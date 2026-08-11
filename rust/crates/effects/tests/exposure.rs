//! Real pixel-correctness verification for the exposure shader on native
//! GPU: renders a known-gray pixel through the pipeline at several EV
//! values and compares against an independently-computed `input * 2^ev`
//! reference, including confirming EV=0 is a true no-op and that negative
//! EV actually darkens (not just "some change happened").

use std::collections::HashMap;

use effects::{ApplyEffectsOptions, EffectPass, EffectPipeline, UniformValue};
use gpu::GpuContext;

fn render_and_read_pixel(context: &GpuContext, pipeline: &EffectPipeline, input: f32, ev: f32) -> f32 {
    let width = 1u32;
    let height = 1u32;
    let source_texture = context.create_render_texture(width, height, "test-exposure-source");

    let to_u8 = |v: f32| (v.clamp(0.0, 1.0) * 255.0).round() as u8;
    let level = to_u8(input);
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
    uniforms.insert("u_ev".to_string(), UniformValue::Number(ev));
    let pass = EffectPass {
        shader: "exposure".to_string(),
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
        .expect("applying the exposure pass should succeed");

    const PADDED_BYTES_PER_ROW: u32 = 256;
    let readback_buffer = context.device().create_buffer(&wgpu::BufferDescriptor {
        label: Some("test-exposure-readback"),
        size: PADDED_BYTES_PER_ROW as u64,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });

    let mut encoder = context
        .device()
        .create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("test-exposure-readback-encoder"),
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
    let out = mapped[1] as f32 / 255.0; // green channel, BGRA layout
    drop(mapped);
    readback_buffer.unmap();
    out
}

#[test]
fn ev_zero_is_a_true_no_op() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);
    let tolerance = 1.5 / 255.0;

    for input in [0.1f32, 0.3, 0.5, 0.7, 0.9] {
        let output = render_and_read_pixel(&context, &pipeline, input, 0.0);
        assert!(
            (output - input).abs() < tolerance,
            "EV=0 should leave input {input} unchanged, got {output}"
        );
    }
}

#[test]
fn positive_ev_matches_independently_computed_doubling_reference() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);
    let tolerance = 1.5 / 255.0;

    let input = 0.2f32;
    let ev = 1.0f32; // +1 stop should exactly double
    let expected = (input * 2.0f32.powf(ev)).clamp(0.0, 1.0);
    let output = render_and_read_pixel(&context, &pipeline, input, ev);

    assert!(
        (output - expected).abs() < tolerance,
        "EV=+1 on {input}: expected {expected} (input*2), got {output}"
    );
}

#[test]
fn negative_ev_darkens_matching_the_independent_reference() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);
    let tolerance = 1.5 / 255.0;

    let input = 0.8f32;
    let ev = -1.0f32; // -1 stop should exactly halve
    let expected = (input * 2.0f32.powf(ev)).clamp(0.0, 1.0);
    let output = render_and_read_pixel(&context, &pipeline, input, ev);

    assert!(
        (output - expected).abs() < tolerance,
        "EV=-1 on {input}: expected {expected} (input*0.5), got {output}"
    );
    assert!(output < input, "negative EV should actually darken the pixel");
}

#[test]
fn exposure_rejects_unknown_uniforms() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);

    let width = 1u32;
    let height = 1u32;
    let source_texture =
        context.create_render_texture(width, height, "test-exposure-source-invalid");

    let mut uniforms = HashMap::new();
    uniforms.insert("u_ev".to_string(), UniformValue::Number(0.0));
    uniforms.insert("u_lift".to_string(), UniformValue::Number(0.0));

    let pass = EffectPass {
        shader: "exposure".to_string(),
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
