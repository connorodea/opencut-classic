import type { EffectDefinition } from "@/effects/types";

export const LOG_WHEELS_SHADER = "log-wheels";

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
 * Log-domain lift/gamma/gain/offset — for footage that's already log-
 * encoded (camera log profiles: S-Log, Log-C, V-Log, etc.). Same wheel
 * surface as primary-wheels, deliberately different math — see
 * log_wheels.wgsl's doc comment and COLOR_GRADING_DESIGN.md for why.
 */
export const logWheelsEffectDefinition: EffectDefinition = {
	type: "log-wheels",
	name: "Log Wheels",
	keywords: ["color", "grade", "grading", "log", "lift", "gamma", "gain", "offset"],
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
			key: "gammaOffset",
			label: "Gamma",
			type: "number",
			default: 0,
			min: -1,
			max: 1,
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
				shader: LOG_WHEELS_SHADER,
				uniforms: ({ effectParams }) => ({
					u_lift: parseNumberParam(effectParams, "lift", 0),
					u_gamma_offset: parseNumberParam(effectParams, "gammaOffset", 0),
					u_gain: parseNumberParam(effectParams, "gain", 1),
					u_offset: parseNumberParam(effectParams, "offset", 0),
				}),
			},
		],
	},
};
