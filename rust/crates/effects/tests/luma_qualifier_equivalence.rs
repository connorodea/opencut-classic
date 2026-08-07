//! Verifies COLOR_GRADING_DESIGN.md's gap-map item 11 (a "luma qualifier"
//! is already achievable via hsl-qualifier, not a separate shader) on real
//! pixels, rather than trusting the hand-derived math alone. Setting
//! hue_width=1.0 and sat_width=1.0 makes hue_membership/range_membership
//! return 1.0 for every possible hue/saturation (the widest circular hue
//! distance is 0.5 == inner when width=1.0, and same for the 0..1
//! saturation range) -- confirmed by reading hsl_qualifier.wgsl's own
//! formulas, then verified here the same way every other "is this claim
//! actually true" question got verified this session: run it, don't just
//! reason about it.

use std::collections::HashMap;

use effects::{ApplyEffectsOptions, EffectPass, EffectPipeline, UniformValue};
use gpu::GpuContext;

fn render_and_read_pixel(
    context: &GpuContext,
    pipeline: &EffectPipeline,
    input: [f32; 3],
    lum_center: f32,
    lum_width: f32,
) -> [f32; 3] {
    let width = 1u32;
    let height = 1u32;
    let source_texture =
        context.create_render_texture(width, height, "test-luma-qualifier-source");

    let to_u8 = |v: f32| (v.clamp(0.0, 1.0) * 255.0).round() as u8;
    let bgra_pixel = [to_u8(input[2]), to_u8(input[1]), to_u8(input[0]), 255u8];

    context.queue().write_texture(
        wgpu::TexelCopyTextureInfo {
            texture: &source_texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        &bgra_pixel,
        wgpu::TexelCopyBufferLayout {
            offset: 0,
            bytes_per_row: Some(4),
            rows_per_image: Some(1),
        },
        wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
    );

    let mut uniforms = HashMap::new();
    // Hue/sat gates fully open -- see this file's doc comment.
    uniforms.insert("u_hue_center".to_string(), UniformValue::Number(0.5));
    uniforms.insert("u_hue_width".to_string(), UniformValue::Number(1.0));
    uniforms.insert("u_sat_center".to_string(), UniformValue::Number(0.5));
    uniforms.insert("u_sat_width".to_string(), UniformValue::Number(1.0));
    uniforms.insert("u_lum_center".to_string(), UniformValue::Number(lum_center));
    uniforms.insert("u_lum_width".to_string(), UniformValue::Number(lum_width));
    uniforms.insert("u_softness".to_string(), UniformValue::Number(0.02));

    let pass = EffectPass {
        shader: "hsl-qualifier".to_string(),
        uniforms,
    };

    let output_texture = pipeline
        .apply(
            context,
            ApplyEffectsOptions {
                source: &source_texture,
                width,
                height,
                passes: &[pass],
            },
        )
        .expect("applying the hsl-qualifier pass should succeed");

    const PADDED_BYTES_PER_ROW: u32 = 256;
    let readback_buffer = context.device().create_buffer(&wgpu::BufferDescriptor {
        label: Some("test-luma-qualifier-readback"),
        size: PADDED_BYTES_PER_ROW as u64,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });

    let mut encoder = context
        .device()
        .create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("test-luma-qualifier-readback-encoder"),
        });
    encoder.copy_texture_to_buffer(
        wgpu::TexelCopyTextureInfo {
            texture: &output_texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        wgpu::TexelCopyBufferInfo {
            buffer: &readback_buffer,
            layout: wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(PADDED_BYTES_PER_ROW),
                rows_per_image: Some(1),
            },
        },
        wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
    );
    context.queue().submit([encoder.finish()]);

    let slice = readback_buffer.slice(..);
    let (tx, rx) = std::sync::mpsc::channel();
    slice.map_async(wgpu::MapMode::Read, move |result| {
        tx.send(result).expect("readback channel should still be open");
    });
    context
        .device()
        .poll(wgpu::PollType::wait_indefinitely())
        .expect("device poll should succeed");
    rx.recv()
        .expect("map_async callback should fire")
        .expect("buffer mapping should succeed");

    let mapped = slice.get_mapped_range();
    let out = [
        mapped[2] as f32 / 255.0,
        mapped[1] as f32 / 255.0,
        mapped[0] as f32 / 255.0,
    ];
    drop(mapped);
    readback_buffer.unmap();
    out
}

const TOLERANCE: f32 = 2.5 / 255.0;

#[test]
fn matching_luma_passes_through_full_color_regardless_of_hue() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);

    // Three very different hues, all with the same HSL lightness (0.5):
    // pure red, pure green, pure blue (each is max=1,min=0 -> L=0.5).
    let same_luma_different_hue = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]];

    for input in same_luma_different_hue {
        let output = render_and_read_pixel(&context, &pipeline, input, 0.5, 0.3);
        for channel in 0..3 {
            assert!(
                (output[channel] - input[channel]).abs() < TOLERANCE,
                "hue-open qualifier at matching luma should pass {input:?} through unchanged, \
                 got {output:?} on channel {channel}"
            );
        }
    }
}

#[test]
fn non_matching_luma_dims_regardless_of_hue() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);

    // Same three hues, but qualify for lum_center=0.9 (highlights) with a
    // narrow width -- L=0.5 pixels should fall well outside the range and
    // get dimmed toward grayscale.
    let same_luma_different_hue = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]];

    for input in same_luma_different_hue {
        let output = render_and_read_pixel(&context, &pipeline, input, 0.9, 0.05);
        let unchanged = (0..3).all(|c| (output[c] - input[c]).abs() < TOLERANCE);
        assert!(
            !unchanged,
            "hue-open qualifier at non-matching luma should dim {input:?}, but it passed through unchanged as {output:?}"
        );
    }
}

#[test]
fn two_different_hues_at_the_same_luma_get_identical_treatment() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);

    // A mid-gray (L=0.2, achromatic) and a saturated color with the same
    // HSL lightness (0.2): e.g. dark red (0.4, 0, 0) has L=0.2 too.
    let gray = [0.2, 0.2, 0.2];
    let dark_red = [0.4, 0.0, 0.0];

    let lum_center = 0.2;
    let lum_width = 0.1;
    let output_gray = render_and_read_pixel(&context, &pipeline, gray, lum_center, lum_width);
    let output_red = render_and_read_pixel(&context, &pipeline, dark_red, lum_center, lum_width);

    // Both should pass through unchanged (matching luma), regardless of
    // hue/saturation being completely different (gray has none, red is
    // fully saturated) -- proving the qualification is genuinely
    // luma-only when hue/sat gates are held open.
    for channel in 0..3 {
        assert!(
            (output_gray[channel] - gray[channel]).abs() < TOLERANCE,
            "gray at matching luma should pass through"
        );
        assert!(
            (output_red[channel] - dark_red[channel]).abs() < TOLERANCE,
            "saturated red at the same matching luma should also pass through"
        );
    }
}
