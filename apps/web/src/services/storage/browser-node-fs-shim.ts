/**
 * Browser-target stand-in for `node:fs`, wired via next.config.ts's
 * `turbopack.resolveAlias` (browser condition only).
 *
 * filesystem-adapter.ts / filesystem-blob-adapter.ts are real `node:fs`
 * implementations for the headless runner (see HEADLESS_DESIGN.md), but
 * they're statically reachable from the real "use client" editor page too
 * (via storage/service.ts), so Next.js/Turbopack compiles their module for
 * the browser bundle as well -- and a bare `node:fs` has no browser target,
 * which fails that compile outright. In an actual browser,
 * `isBrowserStorageAvailable()` is always true, so this branch is never
 * reached at runtime; this shim only needs to exist so the browser chunk
 * has something valid to compile against.
 */
function unreachable(method: string): never {
	throw new Error(
		`node:fs.${method}() was called in a browser context. This should be ` +
			"unreachable -- filesystem-adapter.ts is only meant to be used when " +
			"isBrowserStorageAvailable() is false (the Bun/Node headless runner).",
	);
}

export const promises = {
	mkdir: () => unreachable("mkdir"),
	readFile: () => unreachable("readFile"),
	writeFile: () => unreachable("writeFile"),
	unlink: () => unreachable("unlink"),
	readdir: () => unreachable("readdir"),
};
