import type { EffectDefinition } from "@/effects/types";
import { HSL_QUALIFIER_SHADER } from "./hsl-qualifier";

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
 * A luma-only qualifier: isolate/preview a luminance range (e.g. "just the
 * shadows" or "just the highlights") with the same DaVinci "Highlight"
 * preview mode hsl-qualifier uses. Not a new shader -- reuses
 * hsl_qualifier.wgsl's shader directly with the hue/saturation gates held
 * fully open (hue_width=1.0, sat_width=1.0), which its own math makes
 * unconditionally pass every hue/saturation (the widest possible circular
 * hue distance and the full 0..1 saturation range both equal `width * 0.5`
 * exactly when width=1.0, so `range_membership`/`hue_membership` return
 * 1.0 for any input). Verified on real pixels, not just derived from
 * reading the formula, in
 * rust/crates/effects/tests/luma_qualifier_equivalence.rs -- see
 * COLOR_GRADING_DESIGN.md gap-map item 11. This is the smaller, focused,
 * discoverable surface for the common "just qualify by luminance" case;
 * the full hue/sat/lum control set is still available directly via
 * "hsl-qualifier" when needed.
 */
export const lumaQualifierEffectDefinition: EffectDefinition = {
	type: "luma-qualifier",
	name: "Luma Qualifier",
	keywords: ["color", "grade", "grading", "qualifier", "key", "luma", "luminance", "secondary"],
	params: [
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
			default: 0.3,
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
					u_hue_center: 0.5,
					u_hue_width: 1.0,
					u_sat_center: 0.5,
					u_sat_width: 1.0,
					u_lum_center: parseNumberParam(effectParams, "lumCenter", 0.5),
					u_lum_width: parseNumberParam(effectParams, "lumWidth", 0.3),
					u_softness: parseNumberParam(effectParams, "softness", 0.05),
				}),
			},
		],
	},
};
