import type { EffectDefinition } from "@/effects/types";

export const HSL_QUALIFIER_SHADER = "hsl-qualifier";

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
 * DaVinci's qualifier "Highlight" preview mode: pixels within the H/S/L
 * range (soft-edged) stay full color, everything else dims to grayscale.
 * Does NOT gate a downstream chained correction (DaVinci's full secondary-
 * grading workflow) — the current effect pipeline has no matte hand-off
 * between passes. See hsl_qualifier.wgsl's doc comment and
 * COLOR_GRADING_DESIGN.md.
 */
export const hslQualifierEffectDefinition: EffectDefinition = {
	type: "hsl-qualifier",
	name: "HSL Qualifier",
	keywords: ["color", "grade", "grading", "qualifier", "key", "hsl", "secondary"],
	params: [
		{
			key: "hueCenter",
			label: "Hue",
			type: "number",
			default: 0,
			min: 0,
			max: 1,
			step: 0.01,
		},
		{
			key: "hueWidth",
			label: "Hue Range",
			type: "number",
			default: 0.15,
			min: 0,
			max: 1,
			step: 0.01,
		},
		{
			key: "satCenter",
			label: "Saturation",
			type: "number",
			default: 0.5,
			min: 0,
			max: 1,
			step: 0.01,
		},
		{
			key: "satWidth",
			label: "Saturation Range",
			type: "number",
			default: 1,
			min: 0,
			max: 1,
			step: 0.01,
		},
		{
			key: "lumCenter",
			label: "Luminance",
			type: "number",
			default: 0.5,
			min: 0,
			max: 1,
			step: 0.01,
		},
		{
			key: "lumWidth",
			label: "Luminance Range",
			type: "number",
			default: 1,
			min: 0,
			max: 1,
			step: 0.01,
		},
		{
			key: "softness",
			label: "Softness",
			type: "number",
			default: 0.05,
			min: 0.001,
			max: 0.5,
			step: 0.01,
		},
	],
	renderer: {
		passes: [
			{
				shader: HSL_QUALIFIER_SHADER,
				uniforms: ({ effectParams }) => ({
					u_hue_center: parseNumberParam(effectParams, "hueCenter", 0),
					u_hue_width: parseNumberParam(effectParams, "hueWidth", 0.15),
					u_sat_center: parseNumberParam(effectParams, "satCenter", 0.5),
					u_sat_width: parseNumberParam(effectParams, "satWidth", 1),
					u_lum_center: parseNumberParam(effectParams, "lumCenter", 0.5),
					u_lum_width: parseNumberParam(effectParams, "lumWidth", 1),
					u_softness: parseNumberParam(effectParams, "softness", 0.05),
				}),
			},
		],
	},
};
