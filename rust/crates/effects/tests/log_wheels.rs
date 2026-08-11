//! Real pixel-correctness verification for the log-wheels shader, mirroring
//! tests/primary_wheels.rs -- renders a known input pixel through the actual
//! wgpu pipeline on native GPU and checks the output against the documented
//! additive log-domain formula (see log_wheels.wgsl's doc comment for why
//! this formula, not primary-wheels', applies here).

use std::collections::HashMap;

use effects::{ApplyEffectsOptions, EffectPass, EffectPipeline, UniformValue};
use gpu::GpuContext;

fn expected_output(input: f32, lift: f32, gamma_offset: f32, gain: f32, offset: f32) -> f32 {
    let mut value = (input + lift * (1.0 - input)).clamp(0.0, 1.0);
    value += gamma_offset;
    value *= gain;
    (value + offset).clamp(0.0, 1.0)
}

#[test]
fn log_wheels_applies_additive_lift_gamma_gain_offset_correctly() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);

    let width = 1u32;
    let height = 1u32;
    let source_texture = context.create_render_texture(width, height, "test-log-wheels-source");

    let input_channel = 0.4f32;
    let to_u8 = |v: f32| (v.clamp(0.0, 1.0) * 255.0).round() as u8;
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

    let lift = 0.08f32;
    let gamma_offset = 0.05f32;
    let gain = 0.95f32;
    let offset = 0.03f32;

    let mut uniforms = HashMap::new();
    uniforms.insert("u_lift".to_string(), UniformValue::Number(lift));
    uniforms.insert(
        "u_gamma_offset".to_string(),
        UniformValue::Number(gamma_offset),
    );
    uniforms.insert("u_gain".to_string(), UniformValue::Number(gain));
    uniforms.insert("u_offset".to_string(), UniformValue::Number(offset));

    let pass = EffectPass {
        shader: "log-wheels".to_string(),
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
        .expect("applying the log-wheels pass should succeed");

    const PADDED_BYTES_PER_ROW: u32 = 256;
    let readback_buffer = context.device().create_buffer(&wgpu::BufferDescriptor {
        label: Some("test-log-wheels-readback"),
        size: PADDED_BYTES_PER_ROW as u64,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });

    let mut encoder = context
        .device()
        .create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("test-log-wheels-readback-encoder"),
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

    let expected = expected_output(input_channel, lift, gamma_offset, gain, offset);
    let tolerance = 1.5 / 255.0;

    assert!(
        (out_red - expected).abs() < tolerance,
        "red channel: got {out_red}, expected {expected} (input={input_channel}, lift={lift}, gamma_offset={gamma_offset}, gain={gain}, offset={offset})"
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
fn log_wheels_rejects_primary_wheels_uniform_names() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);

    let width = 1u32;
    let height = 1u32;
    let source_texture = context.create_render_texture(width, height, "test-log-wheels-source-2");

    // "u_gamma" (primary-wheels' power-curve uniform) is not a name
    // log-wheels understands -- it uses "u_gamma_offset" instead, since the
    // two shaders apply gamma differently (power curve vs. additive).
    let mut uniforms = HashMap::new();
    uniforms.insert("u_lift".to_string(), UniformValue::Number(0.0));
    uniforms.insert("u_gamma".to_string(), UniformValue::Number(1.0));
    uniforms.insert("u_gain".to_string(), UniformValue::Number(1.0));
    uniforms.insert("u_offset".to_string(), UniformValue::Number(0.0));

    let pass = EffectPass {
        shader: "log-wheels".to_string(),
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
        "primary-wheels' uniform names shouldn't silently work for log-wheels"
    );
}
