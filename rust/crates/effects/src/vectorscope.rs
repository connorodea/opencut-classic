//! Vectorscope computation — third of the four DaVinci-parity scopes
//! (`COLOR_GRADING_DESIGN.md` gap-map item 8; histogram and waveform were
//! first and second). Same shape again: read-only texture readback + CPU
//! binning, not a shader pass.
//!
//! A vectorscope plots each pixel's chroma (not luma) on a 2D Cb/Cr plane
//! -- full-swing BT.601 YCbCr, `Cb`/`Cr` each already in `[0, 255]`, so they
//! bin directly into a 256x256 grid with no extra scaling. Achromatic
//! pixels (gray/white/black, R=G=B) land at the exact center (128, 128);
//! saturated colors push outward from center in a direction/distance that
//! encodes hue/saturation -- the standard vectorscope reading, though this
//! module only computes the bucket grid, not hue-angle target overlays
//! (skin-tone line, color targets) a real DaVinci vectorscope draws on top.

use gpu::GpuContext;

/// `buckets[cb][cr]` is the pixel count at that Cb/Cr coordinate (full-swing
/// BT.601, both axes 0..256). Center (128, 128) is zero chroma (gray).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Vectorscope {
    pub buckets: Vec<[u32; 256]>,
}

/// Full-swing BT.601 RGB -> (Cb, Cr), both already in 0..=255 (unlike the
/// broadcast "legal range" 16..235/240 convention) so no extra scaling is
/// needed before binning.
fn chroma_indices(r: u8, g: u8, b: u8) -> (usize, usize) {
    let (r, g, b) = (r as f32, g as f32, b as f32);
    let cb = 128.0 - 0.168_736 * r - 0.331_264 * g + 0.5 * b;
    let cr = 128.0 + 0.5 * r - 0.418_688 * g - 0.081_312 * b;
    (
        cb.round().clamp(0.0, 255.0) as usize,
        cr.round().clamp(0.0, 255.0) as usize,
    )
}

/// Reads back `texture` and computes its vectorscope (Cb/Cr bucket grid).
/// See `compute_histogram` for the readback/format-handling pattern this
/// mirrors.
pub fn compute_vectorscope(
    context: &GpuContext,
    texture: &wgpu::Texture,
    width: u32,
    height: u32,
) -> Vectorscope {
    let bytes_per_pixel = 4u32;
    let unpadded_bytes_per_row = width * bytes_per_pixel;
    let align = wgpu::COPY_BYTES_PER_ROW_ALIGNMENT;
    let padded_bytes_per_row = unpadded_bytes_per_row.div_ceil(align) * align;

    let readback_buffer = context.device().create_buffer(&wgpu::BufferDescriptor {
        label: Some("vectorscope-readback-buffer"),
        size: (padded_bytes_per_row * height) as u64,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });

    let mut encoder = context
        .device()
        .create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("vectorscope-readback-encoder"),
        });
    encoder.copy_texture_to_buffer(
        wgpu::TexelCopyTextureInfo {
            texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        wgpu::TexelCopyBufferInfo {
            buffer: &readback_buffer,
            layout: wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(padded_bytes_per_row),
                rows_per_image: Some(height),
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
        tx.send(result)
            .expect("vectorscope readback channel should still be open");
    });
    context
        .device()
        .poll(wgpu::PollType::wait_indefinitely())
        .expect("device poll should succeed");
    rx.recv()
        .expect("map_async callback should fire")
        .expect("buffer mapping should succeed");

    let mapped = slice.get_mapped_range();
    let is_bgra = context.texture_format() == wgpu::TextureFormat::Bgra8Unorm;

    let mut buckets = vec![[0u32; 256]; 256];
    for y in 0..height {
        let row_start = (y * padded_bytes_per_row) as usize;
        for x in 0..width {
            let pixel_start = row_start + (x * bytes_per_pixel) as usize;
            let pixel = &mapped[pixel_start..pixel_start + 4];
            let (r, g, b) = if is_bgra {
                (pixel[2], pixel[1], pixel[0])
            } else {
                (pixel[0], pixel[1], pixel[2])
            };
            let (cb, cr) = chroma_indices(r, g, b);
            buckets[cb][cr] += 1;
        }
    }
    drop(mapped);
    readback_buffer.unmap();

    Vectorscope { buckets }
}
