import type { EffectDefinition } from "@/effects/types";

export const LUMA_CURVE_SHADER = "luma-curve";

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
 * A 5-point Catmull-Rom curve (shadow/quarter/mid/three-quarter/highlight,
 * fixed x positions at 0/0.25/0.5/0.75/1.0 — only Y is adjustable), applied
 * identically to R/G/B. Deliberately smaller than DaVinci's actual curve
 * editor (arbitrary control points on a texture-backed LUT) — see
 * luma_curve.wgsl's doc comment and COLOR_GRADING_DESIGN.md.
 */
export const lumaCurveEffectDefinition: EffectDefinition = {
	type: "luma-curve",
	name: "Luma Curve",
	keywords: ["color", "grade", "grading", "curve", "curves", "contrast", "tone"],
	params: [
		{
			key: "y0",
			label: "Shadow",
			type: "number",
			default: 0,
			min: 0,
			max: 1,
			step: 0.01,
		},
		{
			key: "y1",
			label: "Quarter",
			type: "number",
			default: 0.25,
			min: 0,
			max: 1,
			step: 0.01,
		},
		{
			key: "y2",
			label: "Midtone",
			type: "number",
			default: 0.5,
			min: 0,
			max: 1,
			step: 0.01,
		},
		{
			key: "y3",
			label: "Three-Quarter",
			type: "number",
			default: 0.75,
			min: 0,
			max: 1,
			step: 0.01,
		},
		{
			key: "y4",
			label: "Highlight",
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
				shader: LUMA_CURVE_SHADER,
				uniforms: ({ effectParams }) => ({
					u_y0: parseNumberParam(effectParams, "y0", 0),
					u_y1: parseNumberParam(effectParams, "y1", 0.25),
					u_y2: parseNumberParam(effectParams, "y2", 0.5),
					u_y3: parseNumberParam(effectParams, "y3", 0.75),
					u_y4: parseNumberParam(effectParams, "y4", 1),
				}),
			},
		],
	},
};
