/**
 * Headless proof for Goal 4b's white-balance Action surface (state layer
 * only — rendering verification is the separate
 * rust/crates/effects/tests/white_balance.rs pixel tests).
 *
 *   bun run --preload ./headless/wasm-bindgen-bun-plugin.ts headless/white-balance-proof.ts
 */
import { proveGradingEffectPersistence } from "./grading-proof-helpers";

proveGradingEffectPersistence({
	projectName: "White Balance Proof",
	effectType: "white-balance",
	params: { temperature: 0.3, tint: -0.2 },
}).catch((error) => {
	console.error("[FAIL] unhandled error:", error);
	process.exit(1);
});
