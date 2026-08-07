//! Real pixel-correctness verification for the primary-wheels shader, not
//! just "it compiles" -- renders a known input pixel through the actual
//! wgpu pipeline (native GPU, per HEADLESS_DESIGN.md v1.6) and checks the
//! output against the documented lift/gamma/gain/offset formula.

use std::collections::HashMap;

use effects::{ApplyEffectsOptions, EffectPass, EffectPipeline, UniformValue};
use gpu::GpuContext;

fn expected_output(input: f32, lift: f32, gamma: f32, gain: f32, offset: f32) -> f32 {
    let mut value = (input + lift * (1.0 - input)).clamp(0.0, 1.0);
    value = value.powf(1.0 / gamma);
    value *= gain;
    (value + offset).clamp(0.0, 1.0)
}

#[test]
fn primary_wheels_applies_lift_gamma_gain_offset_correctly() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);

    let width = 1u32;
    let height = 1u32;
    let source_texture = context.create_render_texture(width, height, "test-primary-wheels-source");

    let input_channel = 0.5f32;
    let to_u8 = |v: f32| (v.clamp(0.0, 1.0) * 255.0).round() as u8;
    // Texture format on native (non-GL) backends is Bgra8Unorm -- byte order
    // is B, G, R, A, not R, G, B, A.
    let bgra_pixel = [
        to_u8(input_channel),
        to_u8(input_channel),
        to_u8(input_channel),
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

    let lift = 0.1f32;
    let gamma = 1.2f32;
    let gain = 1.1f32;
    let offset = 0.02f32;

    let mut uniforms = HashMap::new();
    uniforms.insert("u_lift".to_string(), UniformValue::Number(lift));
    uniforms.insert("u_gamma".to_string(), UniformValue::Number(gamma));
    uniforms.insert("u_gain".to_string(), UniformValue::Number(gain));
    uniforms.insert("u_offset".to_string(), UniformValue::Number(offset));

    let pass = EffectPass {
        shader: "primary-wheels".to_string(),
        uniforms,
    };

    let output_texture = pipeline
        .apply(
            &context,
            ApplyEffectsOptions {
                source: &source_texture,
                width,
                height,
                passes: &[pass],
            },
        )
        .expect("applying the primary-wheels pass should succeed");

    // wgpu requires bytes_per_row to be a multiple of 256 for texture->buffer
    // copies; the texture itself is still just 1x1 (4 real bytes, padded).
    const PADDED_BYTES_PER_ROW: u32 = 256;
    let readback_buffer = context.device().create_buffer(&wgpu::BufferDescriptor {
        label: Some("test-primary-wheels-readback"),
        size: PADDED_BYTES_PER_ROW as u64,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });

    let mut encoder = context
        .device()
        .create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("test-primary-wheels-readback-encoder"),
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
    let pixel = &mapped[0..4];
    let out_blue = pixel[0] as f32 / 255.0;
    let out_green = pixel[1] as f32 / 255.0;
    let out_red = pixel[2] as f32 / 255.0;
    drop(mapped);
    readback_buffer.unmap();

    let expected = expected_output(input_channel, lift, gamma, gain, offset);
    // 8-bit quantization on both the input write and the output read means
    // exact float equality isn't achievable -- 1.5/255 covers one step of
    // rounding error on each side.
    let tolerance = 1.5 / 255.0;

    assert!(
        (out_red - expected).abs() < tolerance,
        "red channel: got {out_red}, expected {expected} (input={input_channel}, lift={lift}, gamma={gamma}, gain={gain}, offset={offset})"
    );
    assert!(
        (out_green - expected).abs() < tolerance,
        "green channel: got {out_green}, expected {expected}"
    );
    assert!(
        (out_blue - expected).abs() < tolerance,
        "blue channel: got {out_blue}, expected {expected}"
    );
}

#[test]
fn primary_wheels_rejects_unknown_uniforms() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);

    let width = 1u32;
    let height = 1u32;
    let source_texture = context.create_render_texture(width, height, "test-primary-wheels-source-2");

    let mut uniforms = HashMap::new();
    uniforms.insert("u_lift".to_string(), UniformValue::Number(0.0));
    uniforms.insert("u_gamma".to_string(), UniformValue::Number(1.0));
    uniforms.insert("u_gain".to_string(), UniformValue::Number(1.0));
    uniforms.insert("u_offset".to_string(), UniformValue::Number(0.0));
    // A uniform the primary-wheels shader doesn't accept.
    uniforms.insert("u_sigma".to_string(), UniformValue::Number(5.0));

    let pass = EffectPass {
        shader: "primary-wheels".to_string(),
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
        "an unsupported uniform for the shader should be rejected, not silently ignored"
    );
}
