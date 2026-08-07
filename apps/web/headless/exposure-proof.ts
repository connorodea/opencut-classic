/**
 * Headless proof for Goal 4b's exposure Action surface (state layer only
 * — rendering verification is the separate
 * rust/crates/effects/tests/exposure.rs pixel tests).
 *
 *   bun run --preload ./headless/wasm-bindgen-bun-plugin.ts headless/exposure-proof.ts
 */
import { proveGradingEffectPersistence } from "./grading-proof-helpers";

proveGradingEffectPersistence({
	projectName: "Exposure Proof",
	effectType: "exposure",
	params: { ev: 1.5 },
}).catch((error) => {
	console.error("[FAIL] unhandled error:", error);
	process.exit(1);
});
