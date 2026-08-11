/**
 * Headless proof for Goal 4b's rgb-curves Action surface (state layer
 * only — rendering verification is the separate
 * rust/crates/effects/tests/rgb_curves.rs pixel tests). Sets distinct
 * values across all 15 params (not just one representative value) so a
 * bug collapsing channels together at the Action/state layer would show
 * up here too, not just in the shader.
 *
 *   bun run --preload ./headless/wasm-bindgen-bun-plugin.ts headless/rgb-curves-proof.ts
 */
import { proveGradingEffectPersistence } from "./grading-proof-helpers";

proveGradingEffectPersistence({
	projectName: "RGB Curves Proof",
	effectType: "rgb-curves",
	params: {
		rY0: 0.02,
		rY1: 0.12,
		rY2: 0.45,
		rY3: 0.82,
		rY4: 0.97,
		gY0: 0.0,
		gY1: 0.25,
		gY2: 0.5,
		gY3: 0.75,
		gY4: 1.0,
		bY0: 0.05,
		bY1: 0.3,
		bY2: 0.55,
		bY3: 0.6,
		bY4: 0.9,
	},
}).catch((error) => {
	console.error("[FAIL] unhandled error:", error);
	process.exit(1);
});
