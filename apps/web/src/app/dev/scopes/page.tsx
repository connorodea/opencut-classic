"use client";

import { ScopePanel } from "@/scopes/components/scope-panel";
import type {
	ScopeHistogram,
	ScopeParade,
	ScopeVectorscope,
	ScopeWaveform,
} from "@/scopes/types";

/**
 * Dev-only visual preview of the scope panel with synthetic data (no
 * dependency on @connorodea/opencut-wasm, which hasn't published yet) --
 * a horizontal gradient frame, matching the kind of synthetic patterns
 * used in the Rust-side scope tests (rust/crates/effects/tests/{histogram,
 * waveform,vectorscope,parade}.rs), just large enough to look like a real
 * frame instead of a 1x1/2x2 test pixel. Once the real WASM package
 * publishes, computeFrameScopeFromImageData against an actual rendered
 * frame replaces this generator; the panel itself doesn't change.
 *
 * Not linked from any nav -- visit directly at /dev/scopes.
 */
function buildSyntheticFrameData(width: number, height: number): Uint8ClampedArray {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const index = (y * width + x) * 4;
			// Horizontal hue sweep, vertical brightness ramp -- gives every
			// scope something non-trivial to show (histogram spread across
			// levels, waveform/parade variation per column, vectorscope
			// spread around the wheel).
			const hue = (x / width) * 360;
			const brightness = 0.3 + 0.7 * (y / height);
			const [r, g, b] = hslToRgb(hue, 0.7, brightness * 0.5);
			data[index] = r;
			data[index + 1] = g;
			data[index + 2] = b;
			data[index + 3] = 255;
		}
	}
	return data;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const hPrime = h / 60;
	const x = c * (1 - Math.abs((hPrime % 2) - 1));
	let [r1, g1, b1] = [0, 0, 0];
	if (hPrime < 1) [r1, g1, b1] = [c, x, 0];
	else if (hPrime < 2) [r1, g1, b1] = [x, c, 0];
	else if (hPrime < 3) [r1, g1, b1] = [0, c, x];
	else if (hPrime < 4) [r1, g1, b1] = [0, x, c];
	else if (hPrime < 5) [r1, g1, b1] = [x, 0, c];
	else [r1, g1, b1] = [c, 0, x];
	const m = l - c / 2;
	return [
		Math.round((r1 + m) * 255),
		Math.round((g1 + m) * 255),
		Math.round((b1 + m) * 255),
	];
}

function computeSyntheticHistogram(pixels: Uint8ClampedArray): ScopeHistogram {
	const red = new Array(256).fill(0);
	const green = new Array(256).fill(0);
	const blue = new Array(256).fill(0);
	const luma = new Array(256).fill(0);
	for (let i = 0; i < pixels.length; i += 4) {
		const r = pixels[i] ?? 0;
		const g = pixels[i + 1] ?? 0;
		const b = pixels[i + 2] ?? 0;
		red[r]++;
		green[g]++;
		blue[b]++;
		luma[Math.round(0.299 * r + 0.587 * g + 0.114 * b)]++;
	}
	return { red, green, blue, luma };
}

function computeSyntheticWaveform(
	pixels: Uint8ClampedArray,
	width: number,
	height: number,
): ScopeWaveform {
	const lumaByColumn: number[][] = Array.from({ length: width }, () => new Array(256).fill(0));
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const index = (y * width + x) * 4;
			const r = pixels[index] ?? 0;
			const g = pixels[index + 1] ?? 0;
			const b = pixels[index + 2] ?? 0;
			const luma = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
			lumaByColumn[x]![luma]++;
		}
	}
	return { width, lumaByColumn };
}

function computeSyntheticVectorscope(pixels: Uint8ClampedArray): ScopeVectorscope {
	const buckets: number[][] = Array.from({ length: 256 }, () => new Array(256).fill(0));
	for (let i = 0; i < pixels.length; i += 4) {
		const r = pixels[i] ?? 0;
		const g = pixels[i + 1] ?? 0;
		const b = pixels[i + 2] ?? 0;
		const cb = Math.round(128 - 0.168736 * r - 0.331264 * g + 0.5 * b);
		const cr = Math.round(128 + 0.5 * r - 0.418688 * g - 0.081312 * b);
		const cbClamped = Math.max(0, Math.min(255, cb));
		const crClamped = Math.max(0, Math.min(255, cr));
		buckets[cbClamped]![crClamped]++;
	}
	return { buckets };
}

function computeSyntheticParade(
	pixels: Uint8ClampedArray,
	width: number,
	height: number,
): ScopeParade {
	const redByColumn: number[][] = Array.from({ length: width }, () => new Array(256).fill(0));
	const greenByColumn: number[][] = Array.from({ length: width }, () => new Array(256).fill(0));
	const blueByColumn: number[][] = Array.from({ length: width }, () => new Array(256).fill(0));
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const index = (y * width + x) * 4;
			redByColumn[x]![pixels[index] ?? 0]++;
			greenByColumn[x]![pixels[index + 1] ?? 0]++;
			blueByColumn[x]![pixels[index + 2] ?? 0]++;
		}
	}
	return { width, redByColumn, greenByColumn, blueByColumn };
}

export default function ScopesDevPreviewPage() {
	const width = 320;
	const height = 180;
	const pixels = buildSyntheticFrameData(width, height);

	const histogram = computeSyntheticHistogram(pixels);
	const waveform = computeSyntheticWaveform(pixels, width, height);
	const vectorscope = computeSyntheticVectorscope(pixels);
	const parade = computeSyntheticParade(pixels, width, height);

	return (
		<div className="flex h-screen flex-col gap-4 bg-neutral-950 p-6 text-white">
			<div>
				<h1 className="text-lg font-medium">Scope panel — dev preview</h1>
				<p className="text-sm text-neutral-400">
					Synthetic {width}x{height} hue-sweep frame, computed client-side (no WASM). Not
					linked from any nav.
				</p>
			</div>
			<div className="min-h-0 flex-1 rounded-lg border border-white/10 bg-neutral-900 p-4">
				<ScopePanel
					histogram={histogram}
					waveform={waveform}
					vectorscope={vectorscope}
					parade={parade}
				/>
			</div>
		</div>
	);
}
