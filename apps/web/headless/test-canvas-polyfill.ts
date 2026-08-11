/**
 * Test-only polyfill for `OffscreenCanvas`, loaded via bunfig.toml's
 * `[test] preload` -- never imported by application code. Bare `bun test`
 * has no DOM/OffscreenCanvas, so anything calling
 * `getTextMeasurementContext()` (src/text/measure-element.ts) -- notably
 * text-mask snapping -- throws "Failed to create text measurement
 * context" and its test silently fails. `@napi-rs/canvas` (already a
 * devDependency, used by scripts/generate-font-sprites.ts) provides a
 * real native Canvas 2D implementation including working `measureText`,
 * so this defines a thin `OffscreenCanvas` global backed by it --
 * `getTextMeasurementContext()`'s existing `typeof OffscreenCanvas !==
 * "undefined"` branch picks it up with zero application-code changes.
 */
import { type Canvas, createCanvas } from "@napi-rs/canvas";

if (typeof globalThis.OffscreenCanvas === "undefined") {
	class OffscreenCanvasPolyfill {
		// `createCanvas` is overloaded (2-arg -> Canvas, 3-arg with an SVG
		// flag -> SvgCanvas); `ReturnType<typeof createCanvas>` resolves to
		// the *last* overload (SvgCanvas), which doesn't match the 2-arg
		// call below -- pin the type explicitly instead.
		private readonly canvas: Canvas;

		constructor(width: number, height: number) {
			this.canvas = createCanvas(width, height);
		}

		getContext(contextId: string) {
			if (contextId !== "2d") return null;
			return this.canvas.getContext("2d");
		}
	}

	// @ts-expect-error -- intentionally minimal, test-only global; not a
	// full OffscreenCanvas implementation, just enough for measureText.
	globalThis.OffscreenCanvas = OffscreenCanvasPolyfill;
}
