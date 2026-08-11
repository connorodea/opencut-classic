//! Real pixel-correctness verification for the white-balance shader on
//! native GPU: renders a known mid-gray pixel through the pipeline at
//! several temperature/tint values and compares against an independently-
//! computed reference matching the exact coefficients documented in
//! white_balance.wgsl's doc comment, including confirming temperature=0,
//! tint=0 is a true no-op.

use std::collections::HashMap;

use effects::{ApplyEffectsOptions, EffectPass, EffectPipeline, UniformValue};
use gpu::GpuContext;

/// Independent reference matching white_balance.wgsl's documented formula.
fn expected_white_balance(input: [f32; 3], temperature: f32, tint: f32) -> [f32; 3] {
    let [mut r, mut g, mut b] = input;
    r *= 1.0 + temperature * 0.4;
    b *= 1.0 - temperature * 0.4;
    g *= 1.0 - tint * 0.4;
    r *= 1.0 + tint * 0.2;
    b *= 1.0 + tint * 0.2;
    [r.clamp(0.0, 1.0), g.clamp(0.0, 1.0), b.clamp(0.0, 1.0)]
}

fn render_and_read_pixel(
    context: &GpuContext,
    pipeline: &EffectPipeline,
    input: [f32; 3],
    temperature: f32,
    tint: f32,
) -> [f32; 3] {
    let width = 1u32;
    let height = 1u32;
    let source_texture = context.create_render_texture(width, height, "test-white-balance-source");

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
    uniforms.insert("u_temperature".to_string(), UniformValue::Number(temperature));
    uniforms.insert("u_tint".to_string(), UniformValue::Number(tint));
    let pass = EffectPass {
        shader: "white-balance".to_string(),
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
        .expect("applying the white-balance pass should succeed");

    const PADDED_BYTES_PER_ROW: u32 = 256;
    let readback_buffer = context.device().create_buffer(&wgpu::BufferDescriptor {
        label: Some("test-white-balance-readback"),
        size: PADDED_BYTES_PER_ROW as u64,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });

    let mut encoder = context
        .device()
        .create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("test-white-balance-readback-encoder"),
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

const TOLERANCE: f32 = 1.5 / 255.0;

#[test]
fn zero_temperature_and_tint_is_a_true_no_op() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);

    for input in [[0.2, 0.5, 0.8], [0.1, 0.1, 0.1], [0.9, 0.4, 0.2]] {
        let output = render_and_read_pixel(&context, &pipeline, input, 0.0, 0.0);
        for channel in 0..3 {
            assert!(
                (output[channel] - input[channel]).abs() < TOLERANCE,
                "zero temp/tint should leave {input:?} unchanged, got {output:?} on channel {channel}"
            );
        }
    }
}

#[test]
fn positive_temperature_matches_independent_warming_reference() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);

    let input = [0.5, 0.5, 0.5];
    let temperature = 0.5;
    let expected = expected_white_balance(input, temperature, 0.0);
    let output = render_and_read_pixel(&context, &pipeline, input, temperature, 0.0);

    for channel in 0..3 {
        assert!(
            (output[channel] - expected[channel]).abs() < TOLERANCE,
            "temperature={temperature} on {input:?}: expected {expected:?}, got {output:?} on channel {channel}"
        );
    }
    assert!(output[0] > input[0], "positive temperature should increase red");
    assert!(output[2] < input[2], "positive temperature should decrease blue");
}

#[test]
fn positive_tint_matches_independent_magenta_shift_reference() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);

    let input = [0.5, 0.5, 0.5];
    let tint = 0.5;
    let expected = expected_white_balance(input, 0.0, tint);
    let output = render_and_read_pixel(&context, &pipeline, input, 0.0, tint);

    for channel in 0..3 {
        assert!(
            (output[channel] - expected[channel]).abs() < TOLERANCE,
            "tint={tint} on {input:?}: expected {expected:?}, got {output:?} on channel {channel}"
        );
    }
    assert!(output[1] < input[1], "positive tint should decrease green (shift toward magenta)");
}

#[test]
fn white_balance_rejects_unknown_uniforms() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);

    let width = 1u32;
    let height = 1u32;
    let source_texture =
        context.create_render_texture(width, height, "test-white-balance-source-invalid");

    let mut uniforms = HashMap::new();
    uniforms.insert("u_temperature".to_string(), UniformValue::Number(0.0));
    uniforms.insert("u_tint".to_string(), UniformValue::Number(0.0));
    uniforms.insert("u_ev".to_string(), UniformValue::Number(0.0));

    let pass = EffectPass {
        shader: "white-balance".to_string(),
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
