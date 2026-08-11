import { describe, expect, test } from "bun:test";
import {
	CubeLutParseError,
	LUT_DATA_LENGTH,
	LUT_SIZE,
	buildIdentityLutData,
	cubeFileToFixedGridData,
	parseCubeLut,
	parseLutDataParamValue,
	resampleLutToFixedGrid,
} from "../parse-cube";

function buildCubeFileContent({
	size,
	pointToColor,
}: {
	size: number;
	pointToColor: (r: number, g: number, b: number) => [number, number, number];
}): string {
	const lines = [`LUT_3D_SIZE ${size}`];
	for (let b = 0; b < size; b++) {
		for (let g = 0; g < size; g++) {
			for (let r = 0; r < size; r++) {
				const [red, green, blue] = pointToColor(r, g, b);
				lines.push(`${red} ${green} ${blue}`);
			}
		}
	}
	return lines.join("\n");
}

describe("parseCubeLut", () => {
	test("parses a well-formed identity .cube file", () => {
		const size = 3;
		const maxIndex = size - 1;
		const content = buildCubeFileContent({
			size,
			pointToColor: (r, g, b) => [r / maxIndex, g / maxIndex, b / maxIndex],
		});

		const parsed = parseCubeLut(content);

		expect(parsed.size).toBe(3);
		expect(parsed.data).toHaveLength(3 * 3 * 3 * 3);
		// First row is r=0,g=0,b=0 -> (0,0,0); last is r=2,g=2,b=2 -> (1,1,1).
		expect(parsed.data.slice(0, 3)).toEqual([0, 0, 0]);
		expect(parsed.data.slice(-3)).toEqual([1, 1, 1]);
	});

	test("skips comments, TITLE, and DOMAIN_MIN/MAX lines", () => {
		const content = [
			"# a comment",
			'TITLE "My LUT"',
			"LUT_3D_SIZE 2",
			"DOMAIN_MIN 0.0 0.0 0.0",
			"DOMAIN_MAX 1.0 1.0 1.0",
			"0 0 0",
			"1 0 0",
			"0 1 0",
			"1 1 0",
			"0 0 1",
			"1 0 1",
			"0 1 1",
			"1 1 1",
		].join("\n");

		const parsed = parseCubeLut(content);
		expect(parsed.size).toBe(2);
		expect(parsed.data).toHaveLength(2 * 2 * 2 * 3);
	});

	test("rejects a file missing LUT_3D_SIZE", () => {
		expect(() => parseCubeLut("0 0 0\n1 1 1")).toThrow(CubeLutParseError);
	});

	test("rejects LUT_1D_SIZE files", () => {
		expect(() => parseCubeLut("LUT_1D_SIZE 4\n0 0 0")).toThrow(CubeLutParseError);
	});

	test("rejects a row count that doesn't match size^3", () => {
		const content = "LUT_3D_SIZE 2\n0 0 0\n1 1 1";
		expect(() => parseCubeLut(content)).toThrow(CubeLutParseError);
	});

	test("rejects a malformed data row", () => {
		const content = "LUT_3D_SIZE 2\n0 0\n1 1 1\n0 0 0\n1 1 1\n0 0 0\n1 1 1\n0 0 0\n1 1 1";
		expect(() => parseCubeLut(content)).toThrow(CubeLutParseError);
	});
});

describe("resampleLutToFixedGrid", () => {
	test("is identity when source size equals target size", () => {
		const size = LUT_SIZE;
		const identity = buildIdentityLutData(size);
		const parsed = { size, data: identity };

		const resampled = resampleLutToFixedGrid(parsed, size);

		expect(resampled).toEqual(identity);
	});

	test("resamples a larger identity LUT down to LUT_SIZE and stays identity", () => {
		const sourceSize = 17;
		const parsed = { size: sourceSize, data: buildIdentityLutData(sourceSize) };

		const resampled = resampleLutToFixedGrid(parsed, LUT_SIZE);

		expect(resampled).toHaveLength(LUT_DATA_LENGTH);
		// An identity LUT resampled to any grid size is still identity: the
		// value at grid point (r, g, b) should equal (r, g, b) normalized.
		const maxIndex = LUT_SIZE - 1;
		for (let b = 0; b < LUT_SIZE; b++) {
			for (let g = 0; g < LUT_SIZE; g++) {
				for (let r = 0; r < LUT_SIZE; r++) {
					const idx = ((b * LUT_SIZE + g) * LUT_SIZE + r) * 3;
					expect(resampled[idx]).toBeCloseTo(r / maxIndex, 5);
					expect(resampled[idx + 1]).toBeCloseTo(g / maxIndex, 5);
					expect(resampled[idx + 2]).toBeCloseTo(b / maxIndex, 5);
				}
			}
		}
	});

	test("resamples a smaller LUT up to LUT_SIZE via nearest-neighbor", () => {
		// A 2-point LUT that swaps R and B.
		const parsed = {
			size: 2,
			data: [
				0, 0, 0, // r=0,g=0,b=0
				0, 0, 1, // r=1,g=0,b=0 -> swapped (b,g,r)
				0, 1, 0, // r=0,g=1,b=0
				0, 1, 1, // r=1,g=1,b=0
				1, 0, 0, // r=0,g=0,b=1
				1, 0, 1, // r=1,g=0,b=1
				1, 1, 0, // r=0,g=1,b=1
				1, 1, 1, // r=1,g=1,b=1
			],
		};

		const resampled = resampleLutToFixedGrid(parsed, LUT_SIZE);
		expect(resampled).toHaveLength(LUT_DATA_LENGTH);

		// Corner (r=0,g=0,b=0) should map to source (0,0,0) -> (0,0,0).
		expect(resampled.slice(0, 3)).toEqual([0, 0, 0]);
		// Corner (r=LUT_SIZE-1, g=LUT_SIZE-1, b=LUT_SIZE-1) maps to source
		// (1,1,1) -> (1,1,1).
		expect(resampled.slice(-3)).toEqual([1, 1, 1]);
	});
});

describe("cubeFileToFixedGridData", () => {
	test("parses and resamples a .cube file end to end", () => {
		const size = 4;
		const maxIndex = size - 1;
		const content = buildCubeFileContent({
			size,
			pointToColor: (r, g, b) => [r / maxIndex, g / maxIndex, b / maxIndex],
		});

		const data = cubeFileToFixedGridData(content);

		expect(data).toHaveLength(LUT_DATA_LENGTH);
		expect(data.slice(0, 3)).toEqual([0, 0, 0]);
		expect(data.slice(-3)).toEqual([1, 1, 1]);
	});
});

describe("parseLutDataParamValue", () => {
	test("decodes a valid JSON-encoded flat array", () => {
		const identity = buildIdentityLutData();
		const decoded = parseLutDataParamValue(JSON.stringify(identity));
		expect(decoded).toEqual(identity);
	});

	test("falls back to identity LUT for missing/malformed values", () => {
		const identity = buildIdentityLutData();
		expect(parseLutDataParamValue(undefined)).toEqual(identity);
		expect(parseLutDataParamValue("not json")).toEqual(identity);
		expect(parseLutDataParamValue(JSON.stringify([1, 2, 3]))).toEqual(identity);
		expect(parseLutDataParamValue(JSON.stringify(["a", "b"]))).toEqual(identity);
	});
});
