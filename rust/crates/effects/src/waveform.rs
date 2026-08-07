//! Waveform scope computation — second of the four DaVinci-parity scopes
//! (`COLOR_GRADING_DESIGN.md` gap-map item 8; histogram was first). Same
//! shape as histogram.rs: read-only frame analysis via texture readback +
//! CPU binning, not a shader pass. A waveform monitor is, per column of the
//! frame, a luma histogram for just that column — this reuses the same
//! BT.601 luma weighting and per-format (Bgra8Unorm/Rgba8Unorm) channel
//! handling as `compute_histogram`.
//!
//! One bucket column per source pixel column (no horizontal downsampling)
//! — the simpler, fully-resolution-faithful choice, at the cost of a larger
//! result for wide frames. A fixed-column-count variant (matching a
//! traditional hardware waveform monitor's display width) is a reasonable
//! follow-up if that size becomes a real problem, not assumed necessary now.

use gpu::GpuContext;

/// `luma_by_column[x]` is a 256-bucket luma histogram (BT.601 weighting,
/// same as `Histogram::luma`) for pixel column `x` across all rows.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Waveform {
    pub width: usize,
    pub luma_by_column: Vec<[u32; 256]>,
}

fn luma_index(r: u8, g: u8, b: u8) -> usize {
    let luma = (0.299 * r as f32 + 0.587 * g as f32 + 0.114 * b as f32).round();
    luma.clamp(0.0, 255.0) as usize
}

/// Reads back `texture` and computes its waveform (per-column luma
/// distribution). See `compute_histogram` for the readback/format-handling
/// pattern this mirrors.
pub fn compute_waveform(
    context: &GpuContext,
    texture: &wgpu::Texture,
    width: u32,
    height: u32,
) -> Waveform {
    let bytes_per_pixel = 4u32;
    let unpadded_bytes_per_row = width * bytes_per_pixel;
    let align = wgpu::COPY_BYTES_PER_ROW_ALIGNMENT;
    let padded_bytes_per_row = unpadded_bytes_per_row.div_ceil(align) * align;

    let readback_buffer = context.device().create_buffer(&wgpu::BufferDescriptor {
        label: Some("waveform-readback-buffer"),
        size: (padded_bytes_per_row * height) as u64,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });

    let mut encoder = context
        .device()
        .create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("waveform-readback-encoder"),
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
            .expect("waveform readback channel should still be open");
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

    let mut luma_by_column = vec![[0u32; 256]; width as usize];
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
            let index = luma_index(r, g, b);
            luma_by_column[x as usize][index] += 1;
        }
    }
    drop(mapped);
    readback_buffer.unmap();

    Waveform {
        width: width as usize,
        luma_by_column,
    }
}
