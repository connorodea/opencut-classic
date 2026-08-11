/**
 * Headless proof for Goal 4b's first slice: the primary-wheels Action
 * surface (state layer only — rendering verification is the separate
 * rust/crates/effects/tests/primary_wheels.rs pixel test).
 *
 *   bun run --preload ./headless/wasm-bindgen-bun-plugin.ts headless/primary-wheels-proof.ts
 */
import { proveGradingEffectPersistence } from "./grading-proof-helpers";

proveGradingEffectPersistence({
	projectName: "Primary Wheels Proof",
	effectType: "primary-wheels",
	params: { lift: 0.15, gamma: 1.3, gain: 1.05, offset: -0.02 },
}).catch((error) => {
	console.error("[FAIL] unhandled error:", error);
	process.exit(1);
});
