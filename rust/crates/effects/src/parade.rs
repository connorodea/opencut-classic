//! Parade scope computation — fourth and last of the four DaVinci-parity
//! scopes (`COLOR_GRADING_DESIGN.md` gap-map item 8; histogram, waveform,
//! and vectorscope done first). A "parade" is three waveforms side by
//! side, one per R/G/B channel instead of luma -- structurally
//! `waveform.rs` generalized from one channel (luma) to three (R, G, B)
//! independently. Same read-only readback + CPU binning shape as every
//! other scope in this module.

use gpu::GpuContext;

/// `{red,green,blue}_by_column[x]` is a 256-bucket value histogram for
/// pixel column `x` across all rows, one independent histogram per
/// channel -- unlike `Waveform`, which collapses R/G/B into a single luma
/// value per pixel before binning.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Parade {
    pub width: usize,
    pub red_by_column: Vec<[u32; 256]>,
    pub green_by_column: Vec<[u32; 256]>,
    pub blue_by_column: Vec<[u32; 256]>,
}

/// Reads back `texture` and computes its parade (per-column, per-channel
/// value distributions). See `compute_histogram` for the readback/format-
/// handling pattern this mirrors.
pub fn compute_parade(
    context: &GpuContext,
    texture: &wgpu::Texture,
    width: u32,
    height: u32,
) -> Parade {
    let bytes_per_pixel = 4u32;
    let unpadded_bytes_per_row = width * bytes_per_pixel;
    let align = wgpu::COPY_BYTES_PER_ROW_ALIGNMENT;
    let padded_bytes_per_row = unpadded_bytes_per_row.div_ceil(align) * align;

    let readback_buffer = context.device().create_buffer(&wgpu::BufferDescriptor {
        label: Some("parade-readback-buffer"),
        size: (padded_bytes_per_row * height) as u64,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });

    let mut encoder = context
        .device()
        .create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("parade-readback-encoder"),
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
            .expect("parade readback channel should still be open");
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

    let mut red_by_column = vec![[0u32; 256]; width as usize];
    let mut green_by_column = vec![[0u32; 256]; width as usize];
    let mut blue_by_column = vec![[0u32; 256]; width as usize];
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
            let column = x as usize;
            red_by_column[column][r as usize] += 1;
            green_by_column[column][g as usize] += 1;
            blue_by_column[column][b as usize] += 1;
        }
    }
    drop(mapped);
    readback_buffer.unmap();

    Parade {
        width: width as usize,
        red_by_column,
        green_by_column,
        blue_by_column,
    }
}
