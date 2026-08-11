/**
 * Headless proof for Goal 4b's fourth slice: the luma-curve Action surface
 * (state layer only — rendering verification is the separate
 * rust/crates/effects/tests/luma_curve.rs pixel tests).
 *
 *   bun run --preload ./headless/wasm-bindgen-bun-plugin.ts headless/luma-curve-proof.ts
 */
import { proveGradingEffectPersistence } from "./grading-proof-helpers";

proveGradingEffectPersistence({
	projectName: "Luma Curve Proof",
	effectType: "luma-curve",
	params: { y0: 0.02, y1: 0.15, y2: 0.52, y3: 0.88, y4: 0.98 },
}).catch((error) => {
	console.error("[FAIL] unhandled error:", error);
	process.exit(1);
});
