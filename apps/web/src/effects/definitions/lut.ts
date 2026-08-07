import type { EffectDefinition } from "@/effects/types";
import { buildIdentityLutData, parseLutDataParamValue } from "@/effects/lut/parse-cube";

export const LUT_SHADER = "lut-3d";

function parseNumberParam(
	effectParams: Record<string, unknown>,
	key: string,
	fallback: number,
): number {
	const raw = effectParams[key];
	if (typeof raw === "number") return raw;
	const parsed = Number.parseFloat(String(raw));
	return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * A 3D LUT (imported from a `.cube` file, or the identity default). LUT
 * data is stored as a JSON-encoded flat array in a text param rather than
 * a proper media-asset-style reference -- ParamValues has no array/blob
 * type (see @/params), and a real LUT-library/file-reference system is
 * out of scope for this pass. A real, working v1, not the final storage
 * architecture. See parse-cube.ts and COLOR_GRADING_DESIGN.md.
 */
export const lutEffectDefinition: EffectDefinition = {
	type: "lut",
	name: "LUT",
	keywords: ["color", "grade", "grading", "lut", "look", "cube", "3d lut"],
	params: [
		{
			key: "lutData",
			label: "LUT Data",
			type: "text",
			default: JSON.stringify(buildIdentityLutData()),
		},
		{
			key: "intensity",
			label: "Intensity",
			type: "number",
			default: 1,
			min: 0,
			max: 1,
			step: 0.01,
		},
	],
	renderer: {
		passes: [
			{
				shader: LUT_SHADER,
				uniforms: ({ effectParams }) => ({
					u_intensity: parseNumberParam(effectParams, "intensity", 1),
					u_lut_data: parseLutDataParamValue(effectParams.lutData),
				}),
			},
		],
	},
};
