//! Real pixel-correctness verification for waveform computation on native
//! GPU: renders a texture with known, column-varying pixel values and
//! confirms each column's luma bucket matches an independently
//! hand-computed expected value exactly, and that columns are kept
//! separate (a bug merging columns together would still pass a
//! whole-image histogram check but fail this).

use effects::compute_waveform;
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
    let texture = context.create_render_texture(width, height, "test-waveform-source");

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
fn each_column_gets_its_own_independent_luma_distribution() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");

    // 3 columns x 2 rows. Column 0 is uniformly black, column 1 is
    // uniformly mid-gray, column 2 has one white and one black pixel
    // (two distinct luma values in the same column).
    let width = 3u32;
    let height = 2u32;
    #[rustfmt::skip]
    let pixels: [[u8; 3]; 6] = [
        [0, 0, 0],       [128, 128, 128], [255, 255, 255], // row 0
        [0, 0, 0],       [128, 128, 128], [0, 0, 0],       // row 1
    ];
    let texture = write_known_pixels(&context, width, height, &pixels);

    let waveform = compute_waveform(&context, &texture, width, height);
    assert_eq!(waveform.width, 3);

    // Column 0: both rows black -> luma 0, count 2, nothing else non-zero.
    assert_eq!(waveform.luma_by_column[0][0], 2, "column 0 luma[0]");
    assert_eq!(
        waveform.luma_by_column[0].iter().sum::<u32>(),
        2,
        "column 0 total pixel count"
    );

    // Column 1: both rows mid-gray -> luma 128 (BT.601 weights sum to 1.0
    // for equal R=G=B), count 2.
    assert_eq!(waveform.luma_by_column[1][128], 2, "column 1 luma[128]");
    assert_eq!(
        waveform.luma_by_column[1].iter().sum::<u32>(),
        2,
        "column 1 total pixel count"
    );

    // Column 2: one white (luma 255) and one black (luma 0) -- two
    // distinct buckets, not merged/averaged.
    assert_eq!(waveform.luma_by_column[2][255], 1, "column 2 luma[255]");
    assert_eq!(waveform.luma_by_column[2][0], 1, "column 2 luma[0]");
    assert_eq!(
        waveform.luma_by_column[2].iter().sum::<u32>(),
        2,
        "column 2 total pixel count"
    );

    // Columns must not leak into each other: column 0's black pixels
    // shouldn't show up in column 1's or column 2's buckets.
    assert_eq!(waveform.luma_by_column[1][0], 0, "column 1 should have no black pixels");
    assert_eq!(waveform.luma_by_column[2][128], 0, "column 2 should have no gray pixels");
}

#[test]
fn a_horizontal_gradient_produces_a_different_luma_per_column() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");

    let width = 4u32;
    let height = 1u32;
    let levels: [u8; 4] = [0, 85, 170, 255];
    let pixels: Vec<[u8; 3]> = levels.iter().map(|&v| [v, v, v]).collect();
    let texture = write_known_pixels(&context, width, height, &pixels);

    let waveform = compute_waveform(&context, &texture, width, height);

    for (column, &level) in levels.iter().enumerate() {
        assert_eq!(
            waveform.luma_by_column[column][level as usize], 1,
            "column {column} should have exactly one pixel at luma {level}"
        );
        assert_eq!(
            waveform.luma_by_column[column].iter().sum::<u32>(),
            1,
            "column {column} total pixel count"
        );
    }
}
