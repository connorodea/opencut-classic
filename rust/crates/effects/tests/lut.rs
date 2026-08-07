//! Real pixel-correctness verification for the lut-3d shader on native GPU.
//! Checks: an identity LUT leaves grid-aligned inputs unchanged, a known
//! channel-swap LUT produces the independently-predicted swapped output,
//! intensity=0 fully bypasses the LUT, and malformed LUT data / unknown
//! uniforms are rejected rather than silently accepted.

use std::collections::HashMap;

use effects::{ApplyEffectsOptions, EffectPass, EffectPipeline, UniformValue};
use gpu::GpuContext;

const LUT_SIZE: usize = 9;
const LUT_MAX_INDEX: usize = LUT_SIZE - 1;

/// Builds a flattened LUT in `.cube`-file order (red fastest-varying, then
/// green, then blue) matching `create_lut_texture`'s expected layout in
/// rust/crates/effects/src/pipeline.rs. `f` maps a grid point's (r, g, b)
/// index (each 0..LUT_SIZE) to an output RGB color.
fn build_lut(f: impl Fn(usize, usize, usize) -> [f32; 3]) -> Vec<f32> {
    let mut data = Vec::with_capacity(LUT_SIZE * LUT_SIZE * LUT_SIZE * 3);
    for b in 0..LUT_SIZE {
        for g in 0..LUT_SIZE {
            for r in 0..LUT_SIZE {
                let [out_r, out_g, out_b] = f(r, g, b);
                data.push(out_r);
                data.push(out_g);
                data.push(out_b);
            }
        }
    }
    data
}

fn identity_lut() -> Vec<f32> {
    build_lut(|r, g, b| {
        [
            r as f32 / LUT_MAX_INDEX as f32,
            g as f32 / LUT_MAX_INDEX as f32,
            b as f32 / LUT_MAX_INDEX as f32,
        ]
    })
}

fn channel_swap_lut() -> Vec<f32> {
    // Swaps red and blue: output(r, g, b) = (b, g, r).
    build_lut(|r, g, b| {
        [
            b as f32 / LUT_MAX_INDEX as f32,
            g as f32 / LUT_MAX_INDEX as f32,
            r as f32 / LUT_MAX_INDEX as f32,
        ]
    })
}

fn render_and_read_pixel(
    context: &GpuContext,
    pipeline: &EffectPipeline,
    input: [f32; 3],
    lut_data: Vec<f32>,
    intensity: f32,
) -> [f32; 3] {
    let width = 1u32;
    let height = 1u32;
    let source_texture = context.create_render_texture(width, height, "test-lut-source");

    let to_u8 = |v: f32| (v.clamp(0.0, 1.0) * 255.0).round() as u8;
    // Source texture is BGRA (see GPU_TEXTURE_FORMAT).
    let bgra_pixel = [
        to_u8(input[2]),
        to_u8(input[1]),
        to_u8(input[0]),
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

    let mut uniforms = HashMap::new();
    uniforms.insert("u_intensity".to_string(), UniformValue::Number(intensity));
    uniforms.insert("u_lut_data".to_string(), UniformValue::Vector(lut_data));

    let pass = EffectPass {
        shader: "lut-3d".to_string(),
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
        .expect("applying the lut-3d pass should succeed");

    const PADDED_BYTES_PER_ROW: u32 = 256;
    let readback_buffer = context.device().create_buffer(&wgpu::BufferDescriptor {
        label: Some("test-lut-readback"),
        size: PADDED_BYTES_PER_ROW as u64,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });

    let mut encoder = context
        .device()
        .create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("test-lut-readback-encoder"),
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

// Two 8-bit quantization steps of tolerance: one for the source/output
// texture round-trip, one for the LUT itself being stored as Rgba8Unorm.
const TOLERANCE: f32 = 2.5 / 255.0;

#[test]
fn identity_lut_leaves_grid_aligned_inputs_unchanged() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);

    // Grid step is 1/8 = 0.125 for LUT_SIZE=9, so these inputs land exactly
    // on grid points under nearest-neighbor rounding.
    for input in [[0.0, 0.0, 0.0], [0.25, 0.5, 0.75], [1.0, 1.0, 1.0], [0.375, 0.125, 0.625]] {
        let output = render_and_read_pixel(&context, &pipeline, input, identity_lut(), 1.0);
        for channel in 0..3 {
            assert!(
                (output[channel] - input[channel]).abs() < TOLERANCE,
                "identity LUT should leave {input:?} unchanged, got {output:?} on channel {channel}"
            );
        }
    }
}

#[test]
fn channel_swap_lut_swaps_red_and_blue() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);

    let input = [0.25, 0.5, 0.75];
    let expected = [input[2], input[1], input[0]];
    let output = render_and_read_pixel(&context, &pipeline, input, channel_swap_lut(), 1.0);

    for channel in 0..3 {
        assert!(
            (output[channel] - expected[channel]).abs() < TOLERANCE,
            "channel-swap LUT on {input:?} should produce {expected:?}, got {output:?} on channel {channel}"
        );
    }
}

#[test]
fn zero_intensity_bypasses_the_lut_entirely() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);

    let input = [0.25, 0.5, 0.75];
    // channel_swap_lut would visibly change this input if applied -- at
    // intensity 0.0 the source color must pass through untouched.
    let output = render_and_read_pixel(&context, &pipeline, input, channel_swap_lut(), 0.0);

    for channel in 0..3 {
        assert!(
            (output[channel] - input[channel]).abs() < TOLERANCE,
            "intensity=0 should bypass the LUT, got {output:?} for input {input:?} on channel {channel}"
        );
    }
}

#[test]
fn lut_rejects_wrong_length_data() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);

    let width = 1u32;
    let height = 1u32;
    let source_texture = context.create_render_texture(width, height, "test-lut-source-invalid");

    let mut uniforms = HashMap::new();
    uniforms.insert("u_intensity".to_string(), UniformValue::Number(1.0));
    uniforms.insert(
        "u_lut_data".to_string(),
        UniformValue::Vector(vec![0.0; 42]),
    );

    let pass = EffectPass {
        shader: "lut-3d".to_string(),
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
        "LUT data of the wrong length should be rejected, not silently truncated/padded"
    );
}

#[test]
fn lut_rejects_unknown_uniforms() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);

    let width = 1u32;
    let height = 1u32;
    let source_texture =
        context.create_render_texture(width, height, "test-lut-source-unknown-uniform");

    let mut uniforms = HashMap::new();
    uniforms.insert("u_intensity".to_string(), UniformValue::Number(1.0));
    uniforms.insert("u_lut_data".to_string(), UniformValue::Vector(identity_lut()));
    uniforms.insert("u_lift".to_string(), UniformValue::Number(0.0));

    let pass = EffectPass {
        shader: "lut-3d".to_string(),
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
