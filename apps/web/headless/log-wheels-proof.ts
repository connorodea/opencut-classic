/**
 * Headless proof for Goal 4b's second slice: the log-wheels Action surface
 * (state layer only — rendering verification is the separate
 * rust/crates/effects/tests/log_wheels.rs pixel test).
 *
 *   bun run --preload ./headless/wasm-bindgen-bun-plugin.ts headless/log-wheels-proof.ts
 */
import { proveGradingEffectPersistence } from "./grading-proof-helpers";

proveGradingEffectPersistence({
	projectName: "Log Wheels Proof",
	effectType: "log-wheels",
	params: { lift: 0.08, gammaOffset: 0.05, gain: 0.95, offset: 0.03 },
}).catch((error) => {
	console.error("[FAIL] unhandled error:", error);
	process.exit(1);
});
