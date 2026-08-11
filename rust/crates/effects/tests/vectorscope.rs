//! Real pixel-correctness verification for vectorscope computation on
//! native GPU: renders known RGB test colors and confirms each lands in
//! the Cb/Cr bucket predicted by an independently-written reference
//! implementation of the same full-swing BT.601 conversion (not just "does
//! it run"), including confirming distinct hues land in distinct,
//! non-overlapping buckets.

use effects::compute_vectorscope;
use gpu::GpuContext;

/// Independent reference for full-swing BT.601 RGB -> (Cb, Cr) index,
/// written fresh here rather than calling the crate's (private) internal
/// function -- matches this session's pattern of never trusting "the
/// shader/function runs" as proof it's correct.
fn expected_chroma(r: u8, g: u8, b: u8) -> (usize, usize) {
    let (r, g, b) = (r as f32, g as f32, b as f32);
    let cb = 128.0 - 0.168_736 * r - 0.331_264 * g + 0.5 * b;
    let cr = 128.0 + 0.5 * r - 0.418_688 * g - 0.081_312 * b;
    (
        cb.round().clamp(0.0, 255.0) as usize,
        cr.round().clamp(0.0, 255.0) as usize,
    )
}

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
    let texture = context.create_render_texture(width, height, "test-vectorscope-source");

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
fn achromatic_grays_land_exactly_at_center_regardless_of_brightness() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");

    // R=G=B at several brightness levels: BT.601's Cb/Cr coefficients sum
    // to exactly 0.5 on each side, so every achromatic gray should land at
    // exactly (128, 128), not just white/black.
    let width = 4u32;
    let height = 1u32;
    let pixels: [[u8; 3]; 4] = [[0, 0, 0], [64, 64, 64], [128, 128, 128], [255, 255, 255]];
    let texture = write_known_pixels(&context, width, height, &pixels);

    let vectorscope = compute_vectorscope(&context, &texture, width, height);

    assert_eq!(
        vectorscope.buckets[128][128], 4,
        "all 4 achromatic grays should land at the exact center bucket"
    );
    let total: u32 = vectorscope.buckets.iter().flatten().sum();
    assert_eq!(total, 4, "vectorscope should account for exactly 4 pixels total");
}

#[test]
fn distinct_hues_land_in_distinct_non_overlapping_buckets() {
    let context = pollster::block_on(GpuContext::new()).expect("failed to create GPU context");

    let width = 3u32;
    let height = 1u32;
    let pixels: [[u8; 3]; 3] = [
        [255, 0, 0], // pure red
        [0, 255, 0], // pure green
        [0, 0, 255], // pure blue
    ];
    let texture = write_known_pixels(&context, width, height, &pixels);

    let vectorscope = compute_vectorscope(&context, &texture, width, height);

    let mut seen_buckets = Vec::new();
    for &[r, g, b] in &pixels {
        let (cb, cr) = expected_chroma(r, g, b);
        assert_eq!(
            vectorscope.buckets[cb][cr], 1,
            "pixel ({r},{g},{b}) should land at predicted bucket ({cb},{cr})"
        );
        assert!(
            !seen_buckets.contains(&(cb, cr)),
            "pixel ({r},{g},{b})'s bucket ({cb},{cr}) collided with a previous hue's bucket"
        );
        seen_buckets.push((cb, cr));
    }

    let total: u32 = vectorscope.buckets.iter().flatten().sum();
    assert_eq!(total, 3, "vectorscope should account for exactly 3 pixels total");

    // None of the 3 saturated hues should have landed at the achromatic
    // center -- that would indicate the chroma math collapsed to zero.
    assert_eq!(
        vectorscope.buckets[128][128], 0,
        "saturated hues should not land at the achromatic center"
    );
}
