import type { EffectDefinition } from "@/effects/types";

export const WHITE_BALANCE_SHADER = "white-balance";

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
 * White balance as a relative temperature/tint correction, not an
 * absolute Kelvin/blackbody-radiation conversion -- DaVinci's own WB
 * temperature slider is also a relative correction, not a from-scratch
 * colorimetric computation. See white_balance.wgsl's doc comment and
 * COLOR_GRADING_DESIGN.md.
 */
export const whiteBalanceEffectDefinition: EffectDefinition = {
	type: "white-balance",
	name: "White Balance",
	keywords: [
		"color",
		"grade",
		"grading",
		"white balance",
		"temperature",
		"tint",
		"raw",
		"wb",
	],
	params: [
		{
			key: "temperature",
			label: "Temperature",
			type: "number",
			default: 0,
			min: -1,
			max: 1,
			step: 0.01,
		},
		{
			key: "tint",
			label: "Tint",
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
				shader: WHITE_BALANCE_SHADER,
				uniforms: ({ effectParams }) => ({
					u_temperature: parseNumberParam(effectParams, "temperature", 0),
					u_tint: parseNumberParam(effectParams, "tint", 0),
				}),
			},
		],
	},
};
