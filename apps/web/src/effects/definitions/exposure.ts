import type { EffectDefinition } from "@/effects/types";

export const EXPOSURE_SHADER = "exposure";

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
 * A single EV-stops control: output = input * 2^ev, matching how camera
 * exposure stops work. Not a scene-linear/colorimetrically exact model
 * (no linearize/relinearize round-trip) -- a deliberate simplification,
 * see exposure.wgsl's doc comment and COLOR_GRADING_DESIGN.md.
 */
export const exposureEffectDefinition: EffectDefinition = {
	type: "exposure",
	name: "Exposure",
	keywords: ["color", "grade", "grading", "exposure", "ev", "brightness", "raw"],
	params: [
		{
			key: "ev",
			label: "Exposure (EV)",
			type: "number",
			default: 0,
			min: -5,
			max: 5,
			step: 0.1,
		},
	],
	renderer: {
		passes: [
			{
				shader: EXPOSURE_SHADER,
				uniforms: ({ effectParams }) => ({
					u_ev: parseNumberParam(effectParams, "ev", 0),
				}),
			},
		],
	},
};
