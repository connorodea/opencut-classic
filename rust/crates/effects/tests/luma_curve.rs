//! Real pixel-correctness verification for the luma-curve shader on
//! native GPU. Checks two things: an identity curve (y_i = x_i) leaves
//! pixels unchanged, and a real S-curve (contrast boost) pushes a known
//! input toward the expected output -- computed from the exact same
//! Catmull-Rom formula the shader implements, as an independent Rust
//! reference rather than eyeballing the visual result.

use std::collections::HashMap;

use effects::{ApplyEffectsOptions, EffectPass, EffectPipeline, UniformValue};
use gpu::GpuContext;

/// Rust-side reference implementation of the same Catmull-Rom evaluation
/// the WGSL shader performs, so the test isn't just checking "the shader
/// runs" -- it's checking the shader's actual output against an
/// independently-computed expected value.
fn catmull_rom(p0: f32, p1: f32, p2: f32, p3: f32, t: f32) -> f32 {
    let t2 = t * t;
    let t3 = t2 * t;
    0.5 * ((2.0 * p1)
        + (-p0 + p2) * t
        + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2
        + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3)
}

fn eval_curve(x: f32, y: [f32; 5]) -> f32 {
    let xc = x.clamp(0.0, 1.0);
    let virtual_before = 2.0 * y[0] - y[1];
    let virtual_after = 2.0 * y[4] - y[3];
    if xc < 0.25 {
        catmull_rom(virtual_before, y[0], y[1], y[2], xc / 0.25)
    } else if xc < 0.5 {
        catmull_rom(y[0], y[1], y[2], y[3], (xc - 0.25) / 0.25)
    } else if xc < 0.75 {
        catmull_rom(y[1], y[2], y[3], y[4], (xc - 0.5) / 0.25)
    } else {
        catmull_rom(y[2], y[3], y[4], virtual_after, (xc - 0.75) / 0.25)
    }
    .clamp(0.0, 1.0)
}

fn render_and_read_pixel(
    context: &GpuContext,
    pipeline: &EffectPipeline,
    input_channel: f32,
    y: [f32; 5],
) -> [f32; 3] {
    let width = 1u32;
    let height = 1u32;
    let source_texture = context.create_render_texture(width, height, "test-luma-curve-source");

    let to_u8 = |v: f32| (v.clamp(0.0, 1.0) * 255.0).round() as u8;
    let level = to_u8(input_channel);
    let bgra_pixel = [level, level, level, 255u8];

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
    uniforms.insert("u_y0".to_string(), UniformValue::Number(y[0]));
    uniforms.insert("u_y1".to_string(), UniformValue::Number(y[1]));
    uniforms.insert("u_y2".to_string(), UniformValue::Number(y[2]));
    uniforms.insert("u_y3".to_string(), UniformValue::Number(y[3]));
    uniforms.insert("u_y4".to_string(), UniformValue::Number(y[4]));

    let pass = EffectPass {
        shader: "luma-curve".to_string(),
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
        .expect("applying the luma-curve pass should succeed");

    const PADDED_BYTES_PER_ROW: u32 = 256;
    let readback_buffer = context.device().create_buffer(&wgpu::BufferDescriptor {
        label: Some("test-luma-curve-readback"),
        size: PADDED_BYTES_PER_ROW as u64,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });

    let mut encoder = context
        .device()
        .create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("test-luma-curve-readback-encoder"),
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

#[test]
fn identity_curve_leaves_pixels_unchanged() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);

    // y_i = x_i at each control point -- a straight line, no change.
    let identity = [0.0, 0.25, 0.5, 0.75, 1.0];
    let tolerance = 1.5 / 255.0;

    for input in [0.1f32, 0.35, 0.5, 0.65, 0.9] {
        let output = render_and_read_pixel(&context, &pipeline, input, identity);
        for (channel_index, &value) in output.iter().enumerate() {
            assert!(
                (value - input).abs() < tolerance,
                "identity curve should leave input {input} unchanged, got {value} on channel {channel_index}"
            );
        }
    }
}

#[test]
fn s_curve_matches_the_independently_computed_catmull_rom_reference() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);

    // A real contrast S-curve: shadows pulled down, highlights pushed up,
    // midpoint unchanged.
    let s_curve = [0.0, 0.15, 0.5, 0.85, 1.0];
    let tolerance = 1.5 / 255.0;

    for input in [0.1f32, 0.3, 0.5, 0.7, 0.9] {
        let expected = eval_curve(input, s_curve);
        let output = render_and_read_pixel(&context, &pipeline, input, s_curve);
        for (channel_index, &value) in output.iter().enumerate() {
            assert!(
                (value - expected).abs() < tolerance,
                "input {input}: got {value} on channel {channel_index}, expected {expected} (independently computed Catmull-Rom reference)"
            );
        }
    }
}

#[test]
fn luma_curve_rejects_unknown_uniforms() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);

    let width = 1u32;
    let height = 1u32;
    let source_texture =
        context.create_render_texture(width, height, "test-luma-curve-source-invalid");

    let mut uniforms = HashMap::new();
    uniforms.insert("u_y0".to_string(), UniformValue::Number(0.0));
    uniforms.insert("u_y1".to_string(), UniformValue::Number(0.25));
    uniforms.insert("u_y2".to_string(), UniformValue::Number(0.5));
    uniforms.insert("u_y3".to_string(), UniformValue::Number(0.75));
    uniforms.insert("u_y4".to_string(), UniformValue::Number(1.0));
    uniforms.insert("u_lift".to_string(), UniformValue::Number(0.0));

    let pass = EffectPass {
        shader: "luma-curve".to_string(),
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
