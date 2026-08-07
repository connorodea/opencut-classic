//! Frame histogram computation -- the first of DaVinci parity's four scope
//! types (waveform/vectorscope/histogram/parade, `COLOR_GRADING_DESIGN.md`
//! gap-map item 8). Scopes are read-only analysis of a rendered frame's
//! pixels, not a shader pass that transforms them, so this lives as a plain
//! readback + CPU-side binning function rather than an `EffectPipeline`
//! shader -- there's nothing here a fragment shader would do better, and it
//! reuses the exact texture-readback pattern every pixel test in this crate
//! already uses (`copy_texture_to_buffer` + `map_async`), just exposed as a
//! real library function instead of duplicated test scaffolding.
//!
//! Waveform, vectorscope, and parade are deliberately NOT built here --
//! histogram is the simplest scope and is being closed first, one at a
//! time, matching this session's pattern for every other gap-map item.

use gpu::GpuContext;

/// Per-channel value distributions (256 buckets, one per 8-bit level).
/// `luma` uses ITU-R BT.601 weighting (`0.299 R + 0.587 G + 0.114 B`),
/// matching the coefficients standard waveform/histogram monitors use for
/// SDR video -- not BT.709 or BT.2020, a stated scope choice.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Histogram {
    pub red: [u32; 256],
    pub green: [u32; 256],
    pub blue: [u32; 256],
    pub luma: [u32; 256],
}

impl Histogram {
    fn empty() -> Self {
        Self {
            red: [0; 256],
            green: [0; 256],
            blue: [0; 256],
            luma: [0; 256],
        }
    }

    fn record(&mut self, r: u8, g: u8, b: u8) {
        self.red[r as usize] += 1;
        self.green[g as usize] += 1;
        self.blue[b as usize] += 1;
        let luma = (0.299 * r as f32 + 0.587 * g as f32 + 0.114 * b as f32).round();
        let luma_index = (luma.clamp(0.0, 255.0)) as usize;
        self.luma[luma_index] += 1;
    }
}

/// Bins tightly-packed RGBA8 pixel bytes (row stride == width*4, no padding
/// -- e.g. a canvas `ImageData.data` buffer) into a histogram, with no GPU
/// dependency at all. Split out from `compute_histogram` so the binning
/// logic is callable anywhere pixel bytes are already in hand (a WASM
/// binding operating on canvas `ImageData`, in particular) without needing
/// a live `GpuContext`/`wgpu::Texture` -- see `rust/wasm/src/scopes.rs`.
pub fn compute_histogram_from_pixels(
    pixels: &[u8],
    width: u32,
    height: u32,
    is_bgra: bool,
) -> Histogram {
    let bytes_per_pixel = 4u32;
    let mut histogram = Histogram::empty();
    for y in 0..height {
        let row_start = (y * width * bytes_per_pixel) as usize;
        for x in 0..width {
            let pixel_start = row_start + (x * bytes_per_pixel) as usize;
            let pixel = &pixels[pixel_start..pixel_start + 4];
            let (r, g, b) = if is_bgra {
                (pixel[2], pixel[1], pixel[0])
            } else {
                (pixel[0], pixel[1], pixel[2])
            };
            histogram.record(r, g, b);
        }
    }
    histogram
}

/// Reads back `texture` and computes its per-channel histogram. Handles
/// both `Bgra8Unorm` (the native Metal/Vulkan/DX12 path) and `Rgba8Unorm`
/// (the WebGL fallback path) texture formats correctly rather than
/// hardcoding channel order the way ad hoc test readback code does --
/// getting this wrong on the GL fallback would silently swap R and B in
/// every bucket.
pub fn compute_histogram(
    context: &GpuContext,
    texture: &wgpu::Texture,
    width: u32,
    height: u32,
) -> Histogram {
    let bytes_per_pixel = 4u32;
    let unpadded_bytes_per_row = width * bytes_per_pixel;
    let align = wgpu::COPY_BYTES_PER_ROW_ALIGNMENT;
    let padded_bytes_per_row = unpadded_bytes_per_row.div_ceil(align) * align;

    let readback_buffer = context.device().create_buffer(&wgpu::BufferDescriptor {
        label: Some("histogram-readback-buffer"),
        size: (padded_bytes_per_row * height) as u64,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });

    let mut encoder = context
        .device()
        .create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("histogram-readback-encoder"),
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
            .expect("histogram readback channel should still be open");
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

    let mut tightly_packed = Vec::with_capacity((width * height * bytes_per_pixel) as usize);
    for y in 0..height {
        let row_start = (y * padded_bytes_per_row) as usize;
        tightly_packed.extend_from_slice(&mapped[row_start..row_start + (width * bytes_per_pixel) as usize]);
    }
    drop(mapped);
    readback_buffer.unmap();

    compute_histogram_from_pixels(&tightly_packed, width, height, is_bgra)
}
