//! Real pixel-correctness verification for the rgb-curves shader on
//! native GPU. The whole point of this shader (vs. luma-curve) is that
//! R/G/B are genuinely independent -- so the critical test isn't just "the
//! curve math is right" (already proven for the identical Catmull-Rom
//! formula by luma_curve.rs), it's "changing only the red curve leaves
//! green and blue completely unaffected."

use std::collections::HashMap;

use effects::{ApplyEffectsOptions, EffectPass, EffectPipeline, UniformValue};
use gpu::GpuContext;

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

const IDENTITY: [f32; 5] = [0.0, 0.25, 0.5, 0.75, 1.0];

fn render_and_read_pixel(
    context: &GpuContext,
    pipeline: &EffectPipeline,
    input: [f32; 3],
    r_curve: [f32; 5],
    g_curve: [f32; 5],
    b_curve: [f32; 5],
) -> [f32; 3] {
    let width = 1u32;
    let height = 1u32;
    let source_texture = context.create_render_texture(width, height, "test-rgb-curves-source");

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
    let names = [
        "u_r_y0", "u_r_y1", "u_r_y2", "u_r_y3", "u_r_y4", "u_g_y0", "u_g_y1", "u_g_y2", "u_g_y3",
        "u_g_y4", "u_b_y0", "u_b_y1", "u_b_y2", "u_b_y3", "u_b_y4",
    ];
    let values: Vec<f32> = r_curve
        .iter()
        .chain(g_curve.iter())
        .chain(b_curve.iter())
        .copied()
        .collect();
    for (name, value) in names.iter().zip(values.iter()) {
        uniforms.insert(name.to_string(), UniformValue::Number(*value));
    }

    let pass = EffectPass {
        shader: "rgb-curves".to_string(),
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
        .expect("applying the rgb-curves pass should succeed");

    const PADDED_BYTES_PER_ROW: u32 = 256;
    let readback_buffer = context.device().create_buffer(&wgpu::BufferDescriptor {
        label: Some("test-rgb-curves-readback"),
        size: PADDED_BYTES_PER_ROW as u64,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });

    let mut encoder = context
        .device()
        .create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("test-rgb-curves-readback-encoder"),
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
fn identity_on_all_three_channels_leaves_pixels_unchanged() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);

    let input = [0.2, 0.5, 0.8];
    let output = render_and_read_pixel(&context, &pipeline, input, IDENTITY, IDENTITY, IDENTITY);

    for channel in 0..3 {
        assert!(
            (output[channel] - input[channel]).abs() < TOLERANCE,
            "identity on all channels should leave {input:?} unchanged, got {output:?} on channel {channel}"
        );
    }
}

#[test]
fn changing_only_the_red_curve_leaves_green_and_blue_untouched() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);

    let input = [0.3, 0.6, 0.4];
    // A real S-curve on red only; green/blue stay identity.
    let red_s_curve = [0.0, 0.15, 0.5, 0.85, 1.0];
    let output = render_and_read_pixel(&context, &pipeline, input, red_s_curve, IDENTITY, IDENTITY);

    let expected_red = eval_curve(input[0], red_s_curve);
    assert!(
        (output[0] - expected_red).abs() < TOLERANCE,
        "red channel should match the independently-computed S-curve reference: expected {expected_red}, got {}",
        output[0]
    );
    assert!(
        (output[1] - input[1]).abs() < TOLERANCE,
        "green should be untouched by a red-only curve change: input {}, got {}",
        input[1],
        output[1]
    );
    assert!(
        (output[2] - input[2]).abs() < TOLERANCE,
        "blue should be untouched by a red-only curve change: input {}, got {}",
        input[2],
        output[2]
    );
}

#[test]
fn all_three_channels_use_independent_curves_matching_their_own_reference() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);

    let input = [0.3, 0.5, 0.7];
    let r_curve = [0.0, 0.1, 0.4, 0.8, 1.0]; // lifted shadows
    let g_curve = [0.0, 0.25, 0.5, 0.75, 1.0]; // identity
    let b_curve = [0.0, 0.4, 0.5, 0.6, 1.0]; // crushed highlights differently

    let output = render_and_read_pixel(&context, &pipeline, input, r_curve, g_curve, b_curve);

    let expected = [
        eval_curve(input[0], r_curve),
        eval_curve(input[1], g_curve),
        eval_curve(input[2], b_curve),
    ];

    for channel in 0..3 {
        assert!(
            (output[channel] - expected[channel]).abs() < TOLERANCE,
            "channel {channel}: expected {} (its own independent curve reference), got {}",
            expected[channel],
            output[channel]
        );
    }

    // A sanity check that the three channels actually produced different
    // relative shifts from their inputs -- if the shader were secretly
    // sharing one curve across channels (the luma_curve.wgsl bug class),
    // these deltas would be proportional/identical rather than distinct.
    let delta_r = output[0] - input[0];
    let delta_g = output[1] - input[1];
    let delta_b = output[2] - input[2];
    assert!(
        (delta_r - delta_g).abs() > TOLERANCE || (delta_g - delta_b).abs() > TOLERANCE,
        "channels should shift by genuinely different amounts under independent curves"
    );
}

#[test]
fn rgb_curves_rejects_unknown_uniforms() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");
    let pipeline = EffectPipeline::new(&context);

    let width = 1u32;
    let height = 1u32;
    let source_texture =
        context.create_render_texture(width, height, "test-rgb-curves-source-invalid");

    let mut uniforms = HashMap::new();
    let names = [
        "u_r_y0", "u_r_y1", "u_r_y2", "u_r_y3", "u_r_y4", "u_g_y0", "u_g_y1", "u_g_y2", "u_g_y3",
        "u_g_y4", "u_b_y0", "u_b_y1", "u_b_y2", "u_b_y3", "u_b_y4",
    ];
    let values: Vec<f32> = IDENTITY
        .iter()
        .chain(IDENTITY.iter())
        .chain(IDENTITY.iter())
        .copied()
        .collect();
    for (name, value) in names.iter().zip(values.iter()) {
        uniforms.insert(name.to_string(), UniformValue::Number(*value));
    }
    uniforms.insert("u_y0".to_string(), UniformValue::Number(0.0));

    let pass = EffectPass {
        shader: "rgb-curves".to_string(),
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
        "a uniform this shader doesn't expect (e.g. luma-curve's u_y0) should be rejected"
    );
}
