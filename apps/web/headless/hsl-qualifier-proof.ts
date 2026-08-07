/**
 * Headless proof for Goal 4b's third slice: the hsl-qualifier Action
 * surface (state layer only — rendering verification is the separate
 * rust/crates/effects/tests/hsl_qualifier.rs pixel tests).
 *
 *   bun run --preload ./headless/wasm-bindgen-bun-plugin.ts headless/hsl-qualifier-proof.ts
 */
import { proveGradingEffectPersistence } from "./grading-proof-helpers";

proveGradingEffectPersistence({
	projectName: "HSL Qualifier Proof",
	effectType: "hsl-qualifier",
	params: {
		hueCenter: 0.05,
		hueWidth: 0.2,
		satCenter: 0.8,
		satWidth: 0.6,
		lumCenter: 0.5,
		lumWidth: 0.7,
		softness: 0.08,
	},
}).catch((error) => {
	console.error("[FAIL] unhandled error:", error);
	process.exit(1);
});
