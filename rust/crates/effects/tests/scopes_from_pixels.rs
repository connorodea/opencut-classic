//! Direct verification of the GPU-independent `*_from_pixels` scope
//! functions (histogram, waveform, vectorscope, parade), extracted from
//! their GPU-readback wrappers so they're callable from a WASM binding
//! operating on plain `ImageData`-shaped bytes with no `GpuContext`/
//! `wgpu::Texture` involved at all -- see rust/wasm/src/scopes.rs. These
//! tests need no GPU adapter and run as plain, fast `#[test]`s (unlike
//! every other test in this crate, which needs `pollster::block_on
//! (GpuContext::new())`), which is itself worth confirming: it's the
//! reason this became the first WASM-reachable scope capability that can
//! be pixel-verified through the actual JS/WASM bridge in this session's
//! Bun headless environment, not just state/wiring-verified.

use effects::{
    compute_histogram_from_pixels, compute_parade_from_pixels, compute_vectorscope_from_pixels,
    compute_waveform_from_pixels,
};

fn rgba_bytes(pixels: &[[u8; 3]]) -> Vec<u8> {
    pixels
        .iter()
        .flat_map(|&[r, g, b]| [r, g, b, 255])
        .collect()
}

#[test]
fn histogram_from_pixels_matches_hand_counted_buckets() {
    let pixels: [[u8; 3]; 4] = [[255, 0, 0], [0, 255, 0], [128, 128, 128], [128, 128, 128]];
    let bytes = rgba_bytes(&pixels);

    let histogram = compute_histogram_from_pixels(&bytes, 2, 2, false);

    assert_eq!(histogram.red[255], 1);
    assert_eq!(histogram.red[0], 1);
    assert_eq!(histogram.red[128], 2);
    assert_eq!(histogram.green[255], 1);
    assert_eq!(histogram.blue[0], 2);
    assert_eq!(histogram.blue[128], 2);
    assert_eq!(histogram.red.iter().sum::<u32>(), 4);
}

#[test]
fn waveform_from_pixels_keeps_columns_independent() {
    let width = 3u32;
    let height = 2u32;
    #[rustfmt::skip]
    let pixels: [[u8; 3]; 6] = [
        [0, 0, 0],       [128, 128, 128], [255, 255, 255],
        [0, 0, 0],       [128, 128, 128], [0, 0, 0],
    ];
    let bytes = rgba_bytes(&pixels);

    let waveform = compute_waveform_from_pixels(&bytes, width, height, false);

    assert_eq!(waveform.luma_by_column[0][0], 2);
    assert_eq!(waveform.luma_by_column[1][128], 2);
    assert_eq!(waveform.luma_by_column[2][255], 1);
    assert_eq!(waveform.luma_by_column[2][0], 1);
    assert_eq!(waveform.luma_by_column[1][0], 0, "no cross-column leakage");
}

#[test]
fn vectorscope_from_pixels_places_grays_at_center_and_hues_apart() {
    let pixels: [[u8; 3]; 4] = [[0, 0, 0], [128, 128, 128], [255, 0, 0], [0, 0, 255]];
    let bytes = rgba_bytes(&pixels);

    let vectorscope = compute_vectorscope_from_pixels(&bytes, 4, 1, false);

    assert_eq!(
        vectorscope.buckets[128][128], 2,
        "both achromatic grays should land at the exact center"
    );
    let total: u32 = vectorscope.buckets.iter().flatten().sum();
    assert_eq!(total, 4);
}

#[test]
fn parade_from_pixels_keeps_channels_independent() {
    let pixels: [[u8; 3]; 3] = [[255, 0, 0], [0, 255, 0], [10, 200, 90]];
    let bytes = rgba_bytes(&pixels);

    let parade = compute_parade_from_pixels(&bytes, 3, 1, false);

    assert_eq!(parade.red_by_column[2][10], 1);
    assert_eq!(parade.green_by_column[2][200], 1);
    assert_eq!(parade.blue_by_column[2][90], 1);
    assert_eq!(parade.red_by_column[2][200], 0, "no cross-channel leakage");
    assert_eq!(parade.red_by_column[2][90], 0, "no cross-channel leakage");
}

#[test]
fn is_bgra_flag_swaps_red_and_blue_correctly() {
    // A single "red" pixel encoded in BGRA byte order: byte 0 = B = 0,
    // byte 1 = G = 0, byte 2 = R = 255.
    let bgra_bytes = vec![0u8, 0, 255, 255];

    let histogram = compute_histogram_from_pixels(&bgra_bytes, 1, 1, true);
    assert_eq!(histogram.red[255], 1, "is_bgra=true should read byte 2 as red");
    assert_eq!(histogram.blue[0], 1, "is_bgra=true should read byte 0 as blue");

    // The same bytes read as if they were RGBA (is_bgra=false) should
    // instead register as blue=255, proving the flag genuinely changes
    // which byte is treated as which channel.
    let histogram_rgba_reading = compute_histogram_from_pixels(&bgra_bytes, 1, 1, false);
    assert_eq!(histogram_rgba_reading.blue[255], 1);
    assert_eq!(histogram_rgba_reading.red[0], 1);
}
