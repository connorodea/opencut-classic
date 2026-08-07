//! Real pixel-correctness verification for parade computation on native
//! GPU: renders known column-varying colors and confirms each column's
//! per-channel buckets match hand-counted expected values exactly,
//! including confirming R/G/B stay independent per column rather than
//! being collapsed into a single luma value the way waveform.rs does.

use effects::compute_parade;
use gpu::GpuContext;

fn write_known_pixels(
    context: &GpuContext,
    width: u32,
    height: u32,
    pixels: &[[u8; 3]],
) -> wgpu::Texture {
    assert_eq!(
        pixels.len() as u32,
        width * height,
        "pixel count must match width*height"
    );
    let texture = context.create_render_texture(width, height, "test-parade-source");

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
fn each_column_gets_independent_per_channel_histograms() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");

    // Column 0: pure red. Column 1: pure green. Column 2: a color with
    // distinct, non-repeating R/G/B values (10, 200, 90) so cross-channel
    // leakage would be visible (if red's bucket showed a count at 200 or
    // 90, something merged the channels incorrectly).
    let width = 3u32;
    let height = 1u32;
    let pixels: [[u8; 3]; 3] = [[255, 0, 0], [0, 255, 0], [10, 200, 90]];
    let texture = write_known_pixels(&context, width, height, &pixels);

    let parade = compute_parade(&context, &texture, width, height);
    assert_eq!(parade.width, 3);

    // Column 0 (pure red): R has a spike at 255, G and B spike at 0.
    assert_eq!(parade.red_by_column[0][255], 1, "col0 red[255]");
    assert_eq!(parade.green_by_column[0][0], 1, "col0 green[0]");
    assert_eq!(parade.blue_by_column[0][0], 1, "col0 blue[0]");

    // Column 1 (pure green): G spikes at 255, R and B at 0.
    assert_eq!(parade.red_by_column[1][0], 1, "col1 red[0]");
    assert_eq!(parade.green_by_column[1][255], 1, "col1 green[255]");
    assert_eq!(parade.blue_by_column[1][0], 1, "col1 blue[0]");

    // Column 2 (10, 200, 90): each channel spikes at its own distinct
    // value, and none of the OTHER channels' buckets at that value should
    // be non-zero (would indicate channel data crossed over).
    assert_eq!(parade.red_by_column[2][10], 1, "col2 red[10]");
    assert_eq!(parade.green_by_column[2][200], 1, "col2 green[200]");
    assert_eq!(parade.blue_by_column[2][90], 1, "col2 blue[90]");
    assert_eq!(parade.red_by_column[2][200], 0, "col2 red should have nothing at green's value");
    assert_eq!(parade.red_by_column[2][90], 0, "col2 red should have nothing at blue's value");
    assert_eq!(parade.green_by_column[2][10], 0, "col2 green should have nothing at red's value");
    assert_eq!(parade.green_by_column[2][90], 0, "col2 green should have nothing at blue's value");
    assert_eq!(parade.blue_by_column[2][10], 0, "col2 blue should have nothing at red's value");
    assert_eq!(parade.blue_by_column[2][200], 0, "col2 blue should have nothing at green's value");

    // Every channel's histogram should account for exactly 3 pixels total
    // (one per column), and columns don't leak into each other.
    for column in [&parade.red_by_column, &parade.green_by_column, &parade.blue_by_column] {
        for (index, histogram) in column.iter().enumerate() {
            let total: u32 = histogram.iter().sum();
            assert_eq!(total, 1, "column {index} should have exactly 1 pixel in this channel");
        }
    }
}
