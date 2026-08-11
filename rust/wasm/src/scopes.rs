#![cfg(target_arch = "wasm32")]

//! WASM bindings for the four DaVinci-parity scope computations (histogram,
//! waveform, vectorscope, parade — see `COLOR_GRADING_DESIGN.md` gap-map
//! item 8 and `rust/crates/effects/src/{histogram,waveform,vectorscope,
//! parade}.rs`). Unlike `applyEffectPasses` (effects.rs) or
//! `applyMaskPasses`, these do NOT go through `with_gpu_runtime` -- scopes
//! are read-only analysis of pixels already in hand (e.g. from a canvas
//! `getImageData()` call), not a rendering pass, so they need no WebGPU
//! adapter at all. That means these are the first grading-arc WASM
//! capabilities genuinely reachable and pixel-verifiable in a plain Bun
//! script with no browser and no GPU -- see the headless proof.
//!
//! Each function takes tightly-packed RGBA8 bytes (`ImageData.data`'s
//! exact shape) plus width/height, and always reads them as RGBA (never
//! BGRA) -- canvas `ImageData` is defined by spec to always be RGBA byte
//! order, unlike the wgpu texture formats `compute_histogram` et al. must
//! branch on for the native-GPU path.
//!
//! Local `*Output` DTOs (not the `effects` crate's own `Histogram`/
//! `Waveform`/`Vectorscope`/`Parade` structs) mirror this crate's existing
//! pattern of keeping serde/JS-serialization concerns out of the core
//! crates (compare `EffectPassInput`/`EffectUniformInput` in effects.rs,
//! distinct from `effects::EffectPass`/`UniformValue`) — fixed-size arrays
//! are converted to `Vec` both for JS-array ergonomics and because serde's
//! built-in array support doesn't cover length 256 without pulling in
//! const-generic serde features the rest of this workspace doesn't use.

use effects::{
    compute_histogram_from_pixels, compute_parade_from_pixels, compute_vectorscope_from_pixels,
    compute_waveform_from_pixels, Histogram, Parade, Vectorscope, Waveform,
};
use serde::Serialize;
use wasm_bindgen::{JsValue, prelude::wasm_bindgen};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HistogramOutput {
    red: Vec<u32>,
    green: Vec<u32>,
    blue: Vec<u32>,
    luma: Vec<u32>,
}

impl From<Histogram> for HistogramOutput {
    fn from(histogram: Histogram) -> Self {
        Self {
            red: histogram.red.to_vec(),
            green: histogram.green.to_vec(),
            blue: histogram.blue.to_vec(),
            luma: histogram.luma.to_vec(),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WaveformOutput {
    width: usize,
    luma_by_column: Vec<Vec<u32>>,
}

impl From<Waveform> for WaveformOutput {
    fn from(waveform: Waveform) -> Self {
        Self {
            width: waveform.width,
            luma_by_column: waveform
                .luma_by_column
                .into_iter()
                .map(|column| column.to_vec())
                .collect(),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VectorscopeOutput {
    buckets: Vec<Vec<u32>>,
}

impl From<Vectorscope> for VectorscopeOutput {
    fn from(vectorscope: Vectorscope) -> Self {
        Self {
            buckets: vectorscope
                .buckets
                .into_iter()
                .map(|row| row.to_vec())
                .collect(),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ParadeOutput {
    width: usize,
    red_by_column: Vec<Vec<u32>>,
    green_by_column: Vec<Vec<u32>>,
    blue_by_column: Vec<Vec<u32>>,
}

impl From<Parade> for ParadeOutput {
    fn from(parade: Parade) -> Self {
        Self {
            width: parade.width,
            red_by_column: parade
                .red_by_column
                .into_iter()
                .map(|column| column.to_vec())
                .collect(),
            green_by_column: parade
                .green_by_column
                .into_iter()
                .map(|column| column.to_vec())
                .collect(),
            blue_by_column: parade
                .blue_by_column
                .into_iter()
                .map(|column| column.to_vec())
                .collect(),
        }
    }
}

fn validate_pixel_length(pixels: &[u8], width: u32, height: u32) -> Result<(), JsValue> {
    let expected = width as usize * height as usize * 4;
    if pixels.len() != expected {
        return Err(JsValue::from_str(&format!(
            "expected {expected} pixel bytes for a {width}x{height} RGBA8 image, got {}",
            pixels.len()
        )));
    }
    Ok(())
}

#[wasm_bindgen(js_name = computeHistogram)]
pub fn compute_histogram(pixels: Vec<u8>, width: u32, height: u32) -> Result<JsValue, JsValue> {
    validate_pixel_length(&pixels, width, height)?;
    let histogram = compute_histogram_from_pixels(&pixels, width, height, false);
    serde_wasm_bindgen::to_value(&HistogramOutput::from(histogram))
        .map_err(|error| JsValue::from_str(&error.to_string()))
}

#[wasm_bindgen(js_name = computeWaveform)]
pub fn compute_waveform(pixels: Vec<u8>, width: u32, height: u32) -> Result<JsValue, JsValue> {
    validate_pixel_length(&pixels, width, height)?;
    let waveform = compute_waveform_from_pixels(&pixels, width, height, false);
    serde_wasm_bindgen::to_value(&WaveformOutput::from(waveform))
        .map_err(|error| JsValue::from_str(&error.to_string()))
}

#[wasm_bindgen(js_name = computeVectorscope)]
pub fn compute_vectorscope(pixels: Vec<u8>, width: u32, height: u32) -> Result<JsValue, JsValue> {
    validate_pixel_length(&pixels, width, height)?;
    let vectorscope = compute_vectorscope_from_pixels(&pixels, width, height, false);
    serde_wasm_bindgen::to_value(&VectorscopeOutput::from(vectorscope))
        .map_err(|error| JsValue::from_str(&error.to_string()))
}

#[wasm_bindgen(js_name = computeParade)]
pub fn compute_parade(pixels: Vec<u8>, width: u32, height: u32) -> Result<JsValue, JsValue> {
    validate_pixel_length(&pixels, width, height)?;
    let parade = compute_parade_from_pixels(&pixels, width, height, false);
    serde_wasm_bindgen::to_value(&ParadeOutput::from(parade))
        .map_err(|error| JsValue::from_str(&error.to_string()))
}
