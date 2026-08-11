import type { EffectDefinition, EffectUniformValue } from "@/effects/types";

export const RGB_CURVES_SHADER = "rgb-curves";

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

function channelParams(channel: "r" | "g" | "b", label: string) {
	const defaults = [0, 0.25, 0.5, 0.75, 1];
	const names = ["Shadow", "Quarter", "Midtone", "Three-Quarter", "Highlight"];
	return defaults.map((defaultValue, index) => ({
		key: `${channel}Y${index}`,
		label: `${label} ${names[index]}`,
		type: "number" as const,
		default: defaultValue,
		min: 0,
		max: 1,
		step: 0.01,
	}));
}

/**
 * Independent 5-point Catmull-Rom curves per R/G/B channel -- genuinely
 * distinct from luma-curve, which applies one shared curve identically to
 * all three channels. This is what DaVinci's RGB Curves panel gives.
 * Deliberately smaller than DaVinci's actual curve editor (arbitrary
 * control points on a texture-backed LUT) -- same scope reduction as
 * luma-curve, see rgb_curves.wgsl's doc comment and
 * COLOR_GRADING_DESIGN.md.
 */
export const rgbCurvesEffectDefinition: EffectDefinition = {
	type: "rgb-curves",
	name: "RGB Curves",
	keywords: ["color", "grade", "grading", "curve", "curves", "rgb", "channel", "contrast"],
	params: [
		...channelParams("r", "Red"),
		...channelParams("g", "Green"),
		...channelParams("b", "Blue"),
	],
	renderer: {
		passes: [
			{
				shader: RGB_CURVES_SHADER,
				uniforms: ({ effectParams }) => {
					const uniforms: Record<string, EffectUniformValue> = {};
					for (const channel of ["r", "g", "b"] as const) {
						for (let index = 0; index < 5; index++) {
							const key = `${channel}Y${index}`;
							const defaultValue = index === 4 ? 1 : index * 0.25;
							uniforms[`u_${channel}_y${index}`] = parseNumberParam(
								effectParams,
								key,
								defaultValue,
							);
						}
					}
					return uniforms;
				},
			},
		],
	},
};
