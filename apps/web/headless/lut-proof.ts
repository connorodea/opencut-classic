/**
 * Headless proof for Goal 4b's fifth slice: the lut Action surface
 * (state layer only — rendering verification is the separate
 * rust/crates/effects/tests/lut.rs pixel tests).
 *
 *   bun run --preload ./headless/wasm-bindgen-bun-plugin.ts headless/lut-proof.ts
 */
import { buildIdentityLutData } from "@/effects/lut/parse-cube";
import { proveGradingEffectPersistence } from "./grading-proof-helpers";

// A distinct (non-default) LUT so the proof actually exercises param
// persistence rather than trivially matching the default.
const testLut = buildIdentityLutData().map((value) => Math.min(1, value + 0.01));

proveGradingEffectPersistence({
	projectName: "LUT Proof",
	effectType: "lut",
	params: { lutData: JSON.stringify(testLut), intensity: 0.75 },
}).catch((error) => {
	console.error("[FAIL] unhandled error:", error);
	process.exit(1);
});
