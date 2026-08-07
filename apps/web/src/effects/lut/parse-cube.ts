/**
 * `.cube` LUT file parsing + resampling to the fixed grid size the
 * lut-3d Rust shader expects (rust/crates/effects/src/pipeline.rs's
 * LUT_SIZE / lut_3d.wgsl's LUT_SIZE). Real `.cube` files commonly ship at
 * 17/33/65-point resolution; the current pipeline is a fixed-size
 * texture-tiling scheme (see COLOR_GRADING_DESIGN.md), so any size is
 * nearest-neighbor resampled down to LUT_SIZE here rather than the
 * pipeline supporting arbitrary sizes. A real, working v1 -- not the
 * final architecture.
 */

/** Must match LUT_SIZE in rust/crates/effects/src/pipeline.rs and lut_3d.wgsl. */
export const LUT_SIZE = 9;
export const LUT_DATA_LENGTH = LUT_SIZE * LUT_SIZE * LUT_SIZE * 3;

export interface ParsedCubeLut {
	size: number;
	/** Flattened RGB triples in `.cube` order: red fastest-varying, then green, then blue. */
	data: number[];
}

export class CubeLutParseError extends Error {}

/**
 * Parses the subset of the `.cube` spec this pipeline needs: TITLE,
 * DOMAIN_MIN/DOMAIN_MAX, and `#` comments are recognized and skipped
 * (domain remapping is not applied -- LUTs outside the default 0..1
 * domain will not be handled correctly, a known gap). LUT_1D_SIZE files
 * are rejected explicitly rather than silently mis-parsed as 3D data.
 */
export function parseCubeLut(content: string): ParsedCubeLut {
	let size: number | null = null;
	const data: number[] = [];

	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (line.length === 0 || line.startsWith("#")) continue;
		if (line.startsWith("TITLE")) continue;
		if (line.startsWith("DOMAIN_MIN") || line.startsWith("DOMAIN_MAX")) continue;
		if (line.startsWith("LUT_1D_SIZE")) {
			throw new CubeLutParseError(
				"1D LUTs are not supported, only LUT_3D_SIZE",
			);
		}
		if (line.startsWith("LUT_3D_SIZE")) {
			const parsed = Number.parseInt(line.split(/\s+/)[1] ?? "", 10);
			if (!Number.isFinite(parsed) || parsed < 2) {
				throw new CubeLutParseError(`Invalid LUT_3D_SIZE line: "${line}"`);
			}
			size = parsed;
			continue;
		}

		const parts = line.split(/\s+/).map(Number.parseFloat);
		if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value))) {
			throw new CubeLutParseError(`Expected an "R G B" data row, got: "${line}"`);
		}
		data.push(parts[0] as number, parts[1] as number, parts[2] as number);
	}

	if (size === null) {
		throw new CubeLutParseError("Missing required LUT_3D_SIZE header");
	}
	const expectedLength = size * size * size * 3;
	if (data.length !== expectedLength) {
		throw new CubeLutParseError(
			`Expected ${expectedLength} values (${size}^3 RGB triples) but found ${data.length}`,
		);
	}

	return { size, data };
}

/**
 * Nearest-neighbor resample from the parsed LUT's native grid to
 * `targetSize` (defaults to LUT_SIZE). Identity when size === targetSize.
 */
export function resampleLutToFixedGrid(
	parsed: ParsedCubeLut,
	targetSize: number = LUT_SIZE,
): number[] {
	const { size, data } = parsed;
	const maxSourceIndex = size - 1;
	const maxTargetIndex = targetSize - 1;
	const output = new Array<number>(targetSize * targetSize * targetSize * 3);

	const nearest = (targetIndex: number): number =>
		maxTargetIndex === 0
			? 0
			: Math.round((targetIndex / maxTargetIndex) * maxSourceIndex);

	for (let b = 0; b < targetSize; b++) {
		const sourceB = nearest(b);
		for (let g = 0; g < targetSize; g++) {
			const sourceG = nearest(g);
			for (let r = 0; r < targetSize; r++) {
				const sourceR = nearest(r);
				const sourceIndex = ((sourceB * size + sourceG) * size + sourceR) * 3;
				const targetIndex = ((b * targetSize + g) * targetSize + r) * 3;
				output[targetIndex] = data[sourceIndex] as number;
				output[targetIndex + 1] = data[sourceIndex + 1] as number;
				output[targetIndex + 2] = data[sourceIndex + 2] as number;
			}
		}
	}

	return output;
}

/** An identity LUT (output === input) at `size`, for defaults/fallbacks. */
export function buildIdentityLutData(size: number = LUT_SIZE): number[] {
	const maxIndex = size - 1;
	const data = new Array<number>(size * size * size * 3);
	for (let b = 0; b < size; b++) {
		for (let g = 0; g < size; g++) {
			for (let r = 0; r < size; r++) {
				const idx = ((b * size + g) * size + r) * 3;
				data[idx] = maxIndex === 0 ? 0 : r / maxIndex;
				data[idx + 1] = maxIndex === 0 ? 0 : g / maxIndex;
				data[idx + 2] = maxIndex === 0 ? 0 : b / maxIndex;
			}
		}
	}
	return data;
}

/**
 * Parses a `.cube` file's text content directly to the fixed-size flat
 * array the effect param / shader uniform expects.
 */
export function cubeFileToFixedGridData(content: string): number[] {
	return resampleLutToFixedGrid(parseCubeLut(content));
}

/** Decodes the JSON-encoded flat LUT array stored in the "lutData" text
 * param, falling back to an identity LUT for missing/malformed values
 * rather than throwing -- this runs on every render. */
export function parseLutDataParamValue(value: unknown): number[] {
	if (typeof value === "string") {
		try {
			const parsed = JSON.parse(value);
			if (
				Array.isArray(parsed) &&
				parsed.length === LUT_DATA_LENGTH &&
				parsed.every((entry) => typeof entry === "number" && Number.isFinite(entry))
			) {
				return parsed as number[];
			}
		} catch {
			// fall through to identity default
		}
	}
	return buildIdentityLutData();
}
