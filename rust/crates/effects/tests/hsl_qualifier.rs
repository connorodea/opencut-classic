//! Real pixel-correctness verification for the hsl-qualifier shader on
//! native GPU. Checks the actual behavior that matters for a qualifier:
//! a pixel inside the qualified H/S/L range stays close to its original
//! color, a pixel clearly outside it gets dimmed toward grayscale.

use std::collections::HashMap;

use effects::{ApplyEffectsOptions, EffectPass, EffectPipeline, UniformValue};
use gpu::GpuContext;

const PADDED_BYTES_PER_ROW: u32 = 256;

fn render_and_read_pixel(
    context: &GpuContext,
    pipeline: &EffectPipeline,
    input_rgb: [f32; 3],
    uniforms: HashMap<String, UniformValue>,
) -> [f32; 3] {
    let width = 1u32;
    let height = 1u32;
    let source_texture = context.create_render_texture(width, height, "test-hsl-qualifier-source");

    let to_u8 = |v: f32| (v.clamp(0.0, 1.0) * 255.0).round() as u8;
    // Bgra8Unorm byte order: B, G, R, A.
    let bgra_pixel = [
        to_u8(input_rgb[2]),
        to_u8(input_rgb[1]),
        to_u8(input_rgb[0]),
        255u8,
    ];

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

    let readback_buffer = context.device().create_buffer(&wgpu::BufferDescriptor {
        label: Some("test-hsl-qualifier-readback"),
        size: PADDED_BYTES_PER_ROW as u64,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });

    let mut encoder = context
        .device()
        .create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("test-hsl-qualifier-readback-encoder"),
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
        mapped[2] as f32 / 255.0, // R
        mapped[1] as f32 / 255.0, // G
        mapped[0] as f32 / 255.0, // B
    ];
    drop(mapped);
    readback_buffer.unmap();
    out
}

fn qualifier_uniforms(
    hue_center: f32,
    hue_width: f32,
    sat_center: f32,
    sat_width: f32,
    lum_center: f32,
    lum_width: f32,
    softness: f32,
) -> HashMap<String, UniformValue> {
    let mut uniforms = HashMap::new();
    uniforms.insert("u_hue_center".to_string(), UniformValue::Number(hue_center));
    uniforms.insert("u_hue_width".to_string(), UniformValue::Number(hue_width));
    uniforms.insert("u_sat_center".to_string(), UniformValue::Number(sat_center));
    uniforms.insert("u_sat_width".to_string(), UniformValue::Number(sat_width));
    uniforms.insert("u_lum_center".to_string(), UniformValue::Number(lum_center));
    uniforms.insert("u_lum_width".to_string(), UniformValue::Number(lum_width));
    uniforms.insert("u_softness".to_string(), UniformValue::Number(softness));
    uniforms
}

#[test]
fn hsl_qualifier_keeps_a_matching_pixel_close_to_original_color() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);

    // Pure red: hue=0, sat=1, lum=0.5. Qualifier centered exactly on red
    // with a generous range -- should pass through essentially unchanged.
    let uniforms = qualifier_uniforms(0.0, 0.2, 1.0, 0.6, 0.5, 0.6, 0.05);
    let output = render_and_read_pixel(&context, &pipeline, [1.0, 0.0, 0.0], uniforms);

    let tolerance = 0.05;
    assert!(
        (output[0] - 1.0).abs() < tolerance && output[1] < tolerance && output[2] < tolerance,
        "a pixel matching the qualifier should stay close to its original color, got {output:?}"
    );
}

#[test]
fn hsl_qualifier_dims_a_non_matching_pixel_toward_grayscale() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);

    // Same red-centered qualifier as above, but the input is pure green
    // (hue=1/3) -- clearly outside a narrow hue window, should be dimmed.
    let uniforms = qualifier_uniforms(0.0, 0.2, 1.0, 0.6, 0.5, 0.6, 0.05);
    let output = render_and_read_pixel(&context, &pipeline, [0.0, 1.0, 0.0], uniforms);

    // Expected: luma(green) * 0.3 = 0.7152 * 0.3 ≈ 0.2146 on every channel
    // (grayscale, so R/G/B end up equal).
    let expected_gray = 0.7152 * 0.3;
    let tolerance = 0.03;
    assert!(
        (output[0] - expected_gray).abs() < tolerance
            && (output[1] - expected_gray).abs() < tolerance
            && (output[2] - expected_gray).abs() < tolerance,
        "a pixel outside the qualifier should be dimmed toward grayscale (~{expected_gray}), got {output:?}"
    );
    // And it must no longer look green -- R, G, B should be roughly equal.
    assert!(
        (output[0] - output[1]).abs() < tolerance && (output[1] - output[2]).abs() < tolerance,
        "dimmed output should be grayscale (R≈G≈B), got {output:?}"
    );
}

#[test]
fn hsl_qualifier_rejects_unknown_uniforms() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);

    let width = 1u32;
    let height = 1u32;
    let source_texture =
        context.create_render_texture(width, height, "test-hsl-qualifier-source-invalid");

    let mut uniforms = qualifier_uniforms(0.0, 0.2, 1.0, 0.6, 0.5, 0.6, 0.05);
    uniforms.insert("u_lift".to_string(), UniformValue::Number(0.0));

    let pass = EffectPass {
        shader: "hsl-qualifier".to_string(),
        uniforms,
    };

    let result = pipeline.apply(
        &context,
        ApplyEffectsOptions {
            source: &source_texture,
            width,
            height,
            passes: &[pass],
        },
    );

    assert!(
        result.is_err(),
        "a uniform this shader doesn't expect should be rejected, not silently ignored"
    );
}
