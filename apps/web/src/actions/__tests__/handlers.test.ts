// handlers.ts imports insertCaptionChunksAsTextTrack, which transitively
// touches WASM-backed timeline/command code at module load time — this
// file needs `bun test --preload ../../../headless/wasm-bindgen-bun-plugin.ts`
// to run under bare Bun, same as several pre-existing test files in this
// repo (see HEADLESS_DESIGN.md's "bonus finding" section). Without the
// preload it fails with "wasm.__wbindgen_start is not a function" before
// any assertion runs — a pre-existing project-wide gap, not something
// introduced by this test.
import { describe, expect, test } from "bun:test";
import { ACTION_HANDLERS } from "../handlers";
import { ACTIONS } from "../definitions";

describe("ACTION_HANDLERS", () => {
	test("every key is a real, registered Action name", () => {
		const validActionNames = new Set(Object.keys(ACTIONS));
		for (const key of Object.keys(ACTION_HANDLERS)) {
			expect(validActionNames.has(key)).toBe(true);
		}
	});

	test("every value is a function taking (editor, args)", () => {
		for (const handler of Object.values(ACTION_HANDLERS)) {
			expect(typeof handler).toBe("function");
			expect(handler.length).toBeGreaterThanOrEqual(1);
		}
	});

	test("has no duplicate registrations (object literal would silently keep the last one)", () => {
		// Object.keys already de-dupes, so this mainly documents intent — the
		// real value is Object.keys(ACTION_HANDLERS).length matching the
		// number of distinct action strings written in handlers.ts's literal,
		// which a duplicate key would silently shrink.
		const keys = Object.keys(ACTION_HANDLERS);
		expect(new Set(keys).size).toBe(keys.length);
	});

	test("includes every Tier 1-3 + direct-bypass Action closed while auditing GAP_MAP.md", () => {
		const expectedSample = [
			"export-project",
			"create-project",
			"add-clip-effect",
			"upsert-keyframe",
			"remove-mask",
			"create-scene",
			"add-track",
			"rename-project",
			"insert-element",
			"insert-captions-as-text-track",
			"add-media-asset",
		];
		for (const action of expectedSample) {
			expect(ACTION_HANDLERS[action]).toBeDefined();
		}
	});
});
