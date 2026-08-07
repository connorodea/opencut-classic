//! Verifies COLOR_GRADING_DESIGN.md's gap-map item 6 ("serial node graph is
//! already free — the effects list's existing ordering") for real, rather
//! than trusting the claim from reading `apply_with_encoder`'s structure
//! alone. Chains two non-commutative primary-wheels passes (a multiplicative
//! gain, then an additive offset) in both orders and confirms: (a) multiple
//! passes actually chain -- pass 2's input is pass 1's output, not the
//! original source -- and (b) order genuinely changes the result, matching
//! independently hand-computed expected values for each ordering. If passes
//! didn't chain (e.g. each ran against the original source) or order didn't
//! matter (e.g. an aliasing bug reused one texture), both orderings would
//! produce the same output -- this test would catch that.

use std::collections::HashMap;

use effects::{ApplyEffectsOptions, EffectPass, EffectPipeline, UniformValue};
use gpu::GpuContext;

fn primary_wheels_pass(lift: f32, gamma: f32, gain: f32, offset: f32) -> EffectPass {
    let mut uniforms = HashMap::new();
    uniforms.insert("u_lift".to_string(), UniformValue::Number(lift));
    uniforms.insert("u_gamma".to_string(), UniformValue::Number(gamma));
    uniforms.insert("u_gain".to_string(), UniformValue::Number(gain));
    uniforms.insert("u_offset".to_string(), UniformValue::Number(offset));
    EffectPass {
        shader: "primary-wheels".to_string(),
        uniforms,
    }
}

fn render_and_read_pixel(
    context: &GpuContext,
    pipeline: &EffectPipeline,
    input_channel: f32,
    passes: &[EffectPass],
) -> f32 {
    let width = 1u32;
    let height = 1u32;
    let source_texture =
        context.create_render_texture(width, height, "test-serial-chain-source");

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

    let output_texture = pipeline
        .apply(
            context,
            ApplyEffectsOptions {
                source: &source_texture,
                width,
                height,
                passes,
            },
        )
        .expect("applying the chained passes should succeed");

    const PADDED_BYTES_PER_ROW: u32 = 256;
    let readback_buffer = context.device().create_buffer(&wgpu::BufferDescriptor {
        label: Some("test-serial-chain-readback"),
        size: PADDED_BYTES_PER_ROW as u64,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });

    let mut encoder = context
        .device()
        .create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("test-serial-chain-readback-encoder"),
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
    // Any channel works -- input is neutral gray, primary-wheels output is
    // equal across R/G/B. Byte 1 (G) avoids relying on the BGRA swap.
    let out = mapped[1] as f32 / 255.0;
    drop(mapped);
    readback_buffer.unmap();
    out
}

#[test]
fn passes_chain_in_order_and_order_changes_the_result() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);

    let input = 0.3f32;
    let gain = 2.0f32;
    let offset = 0.1f32;
    // Wider than the usual single-pass 1.5/255: two passes round-trip
    // through an 8-bit intermediate texture, and gain=2.0 amplifies that
    // intermediate quantization error by 2x when it runs second.
    let tolerance = 3.0 / 255.0;

    let gain_pass = primary_wheels_pass(0.0, 1.0, gain, 0.0);
    let offset_pass = primary_wheels_pass(0.0, 1.0, 1.0, offset);

    // gain then offset: (input * gain) + offset
    let expected_gain_then_offset = (input * gain + offset).clamp(0.0, 1.0);
    let actual_gain_then_offset = render_and_read_pixel(
        &context,
        &pipeline,
        input,
        &[gain_pass.clone(), offset_pass.clone()],
    );
    assert!(
        (actual_gain_then_offset - expected_gain_then_offset).abs() < tolerance,
        "gain-then-offset: expected {expected_gain_then_offset}, got {actual_gain_then_offset}"
    );

    // offset then gain: (input + offset) * gain -- a different result,
    // proving pass 2 really consumed pass 1's output, not the original
    // source, and that pass order is respected end to end.
    let expected_offset_then_gain = ((input + offset) * gain).clamp(0.0, 1.0);
    let actual_offset_then_gain =
        render_and_read_pixel(&context, &pipeline, input, &[offset_pass, gain_pass]);
    assert!(
        (actual_offset_then_gain - expected_offset_then_gain).abs() < tolerance,
        "offset-then-gain: expected {expected_offset_then_gain}, got {actual_offset_then_gain}"
    );

    assert!(
        (expected_gain_then_offset - expected_offset_then_gain).abs() > tolerance,
        "test setup bug: the two orderings should produce genuinely different results"
    );
    assert!(
        (actual_gain_then_offset - actual_offset_then_gain).abs() > tolerance,
        "the two chained orderings produced the same output -- passes are not \
         genuinely chaining in order (a real serial node graph would differ here)"
    );
}

#[test]
fn a_three_pass_chain_composes_all_three_in_order() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);

    let input = 0.2f32;
    let tolerance = 1.5 / 255.0;

    // Three additive offsets in sequence: 0.1, 0.15, 0.05 -- if they truly
    // chain, the final result is input + 0.1 + 0.15 + 0.05, not just the
    // last pass applied to the original input (which would give 0.25).
    let passes = vec![
        primary_wheels_pass(0.0, 1.0, 1.0, 0.1),
        primary_wheels_pass(0.0, 1.0, 1.0, 0.15),
        primary_wheels_pass(0.0, 1.0, 1.0, 0.05),
    ];
    let expected = (input + 0.1 + 0.15 + 0.05).clamp(0.0, 1.0);
    let actual = render_and_read_pixel(&context, &pipeline, input, &passes);

    assert!(
        (actual - expected).abs() < tolerance,
        "three-pass chain: expected {expected} (sum of all three offsets), got {actual}"
    );
}
