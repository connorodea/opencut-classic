/**
 * Headless proof for Goal 4b's luma-qualifier Action surface (state layer
 * only — rendering/hue-sat-gate-equivalence verification is the separate
 * rust/crates/effects/tests/luma_qualifier_equivalence.rs pixel tests).
 *
 *   bun run --preload ./headless/wasm-bindgen-bun-plugin.ts headless/luma-qualifier-proof.ts
 */
import { proveGradingEffectPersistence } from "./grading-proof-helpers";

proveGradingEffectPersistence({
	projectName: "Luma Qualifier Proof",
	effectType: "luma-qualifier",
	params: { lumCenter: 0.75, lumWidth: 0.2, softness: 0.08 },
}).catch((error) => {
	console.error("[FAIL] unhandled error:", error);
	process.exit(1);
});
