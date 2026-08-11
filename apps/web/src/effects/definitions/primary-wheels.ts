import type { EffectDefinition } from "@/effects/types";

export const PRIMARY_WHEELS_SHADER = "primary-wheels";

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
 * Master (luminance) lift/gamma/gain/offset — DaVinci's primary color
 * wheels, applied equally to R/G/B. Per-channel RGB color-balance (the x/y
 * position on the actual wheel widget, not just the master scalar) is a
 * deliberate follow-up — see COLOR_GRADING_DESIGN.md.
 */
export const primaryWheelsEffectDefinition: EffectDefinition = {
	type: "primary-wheels",
	name: "Primary Wheels",
	keywords: ["color", "grade", "grading", "lift", "gamma", "gain", "offset"],
	params: [
		{
			key: "lift",
			label: "Lift",
			type: "number",
			default: 0,
			min: -1,
			max: 1,
			step: 0.01,
		},
		{
			key: "gamma",
			label: "Gamma",
			type: "number",
			default: 1,
			min: 0.1,
			max: 4,
			step: 0.01,
		},
		{
			key: "gain",
			label: "Gain",
			type: "number",
			default: 1,
			min: 0,
			max: 2,
			step: 0.01,
		},
		{
			key: "offset",
			label: "Offset",
			type: "number",
			default: 0,
			min: -1,
			max: 1,
			step: 0.01,
		},
	],
	renderer: {
		passes: [
			{
				shader: PRIMARY_WHEELS_SHADER,
				uniforms: ({ effectParams }) => ({
					u_lift: parseNumberParam(effectParams, "lift", 0),
					u_gamma: parseNumberParam(effectParams, "gamma", 1),
					u_gain: parseNumberParam(effectParams, "gain", 1),
					u_offset: parseNumberParam(effectParams, "offset", 0),
				}),
			},
		],
	},
};
