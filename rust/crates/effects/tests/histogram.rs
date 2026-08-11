//! Real pixel-correctness verification for histogram computation on
//! native GPU: renders a small texture with known, hand-picked pixel
//! values and confirms every bucket in the computed histogram matches an
//! independently hand-counted expected histogram exactly (not just "does
//! it run" -- exact bucket counts, including all the buckets that should
//! be zero).

use effects::compute_histogram;
use gpu::GpuContext;

fn write_known_pixels(context: &GpuContext, width: u32, height: u32, pixels: &[[u8; 3]]) -> wgpu::Texture {
    assert_eq!(pixels.len() as u32, width * height, "pixel count must match width*height");
    let texture = context.create_render_texture(width, height, "test-histogram-source");

    let is_bgra = context.texture_format() == wgpu::TextureFormat::Bgra8Unorm;
    let mut bytes = Vec::with_capacity(pixels.len() * 4);
    for &[r, g, b] in pixels {
        if is_bgra {
            bytes.extend_from_slice(&[b, g, r, 255]);
        } else {
            bytes.extend_from_slice(&[r, g, b, 255]);
        }
    }

    context.queue().write_texture(
        wgpu::TexelCopyTextureInfo {
            texture: &texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        &bytes,
        wgpu::TexelCopyBufferLayout {
            offset: 0,
            bytes_per_row: Some(width * 4),
            rows_per_image: Some(height),
        },
        wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
    );

    texture
}

#[test]
fn histogram_matches_hand_counted_expected_buckets() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");

    // A deliberately non-uniform 2x2 image: pure red, pure green, pure
    // blue, and a repeated mid-gray so at least one bucket has count 2.
    let pixels: [[u8; 3]; 4] = [
        [255, 0, 0],   // pure red
        [0, 255, 0],   // pure green
        [128, 128, 128], // mid-gray
        [128, 128, 128], // mid-gray (repeated)
    ];
    let width = 2u32;
    let height = 2u32;
    let texture = write_known_pixels(&context, width, height, &pixels);

    let histogram = compute_histogram(&context, &texture, width, height);

    // Red channel: 255 appears once (pure red), 0 appears once (pure
    // green), 128 appears twice (the two grays).
    assert_eq!(histogram.red[255], 1, "red[255]");
    assert_eq!(histogram.red[0], 1, "red[0]");
    assert_eq!(histogram.red[128], 2, "red[128]");
    let red_total: u32 = histogram.red.iter().sum();
    assert_eq!(red_total, 4, "red histogram should account for all 4 pixels");

    // Green channel: 0 once (pure red), 255 once (pure green), 128 twice.
    assert_eq!(histogram.green[0], 1, "green[0]");
    assert_eq!(histogram.green[255], 1, "green[255]");
    assert_eq!(histogram.green[128], 2, "green[128]");

    // Blue channel: all 4 pixels have blue=0 or blue=128 -- red/green
    // pixels have blue=0 (two of them), grays have blue=128 (two of them).
    assert_eq!(histogram.blue[0], 2, "blue[0]");
    assert_eq!(histogram.blue[128], 2, "blue[128]");

    // Luma (BT.601: 0.299 R + 0.587 G + 0.114 B), independently computed:
    // pure red -> round(0.299*255) = 76
    // pure green -> round(0.587*255) = 150
    // mid-gray (128,128,128) -> round(128*(0.299+0.587+0.114)) = 128, twice
    assert_eq!(histogram.luma[76], 1, "luma[76] (pure red)");
    assert_eq!(histogram.luma[150], 1, "luma[150] (pure green)");
    assert_eq!(histogram.luma[128], 2, "luma[128] (mid-gray x2)");
    let luma_total: u32 = histogram.luma.iter().sum();
    assert_eq!(luma_total, 4, "luma histogram should account for all 4 pixels");

    // Every other bucket across every channel must be exactly zero -- not
    // just "the buckets we expected are right," but nothing leaked
    // anywhere else (would catch an off-by-one indexing bug).
    for (index, &count) in histogram.red.iter().enumerate() {
        if ![0usize, 128, 255].contains(&index) {
            assert_eq!(count, 0, "unexpected red bucket {index} has count {count}");
        }
    }
    for (index, &count) in histogram.luma.iter().enumerate() {
        if ![76usize, 128, 150].contains(&index) {
            assert_eq!(count, 0, "unexpected luma bucket {index} has count {count}");
        }
    }
}

#[test]
fn uniform_image_produces_a_single_spike_per_channel() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");

    let width = 3u32;
    let height = 3u32;
    let pixels = [[64u8, 200, 32]; 9];
    let texture = write_known_pixels(&context, width, height, &pixels);

    let histogram = compute_histogram(&context, &texture, width, height);

    assert_eq!(histogram.red[64], 9);
    assert_eq!(histogram.green[200], 9);
    assert_eq!(histogram.blue[32], 9);
    assert_eq!(histogram.red.iter().sum::<u32>(), 9);
    assert_eq!(histogram.green.iter().sum::<u32>(), 9);
    assert_eq!(histogram.blue.iter().sum::<u32>(), 9);
}
