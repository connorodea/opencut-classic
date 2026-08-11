import { plugin } from "bun";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * wasm-bindgen's "bundler" target compiles a .wasm binary whose imports
 * are all declared under a single module name equal to the relative path
 * to its own glue .js file (e.g. "./opencut_wasm_bg.js"). A real bundler
 * (webpack/Next.js) auto-instantiates the .wasm with that glue module's
 * exports as the import object. Bun's native `.wasm` import instead
 * returns an *uninstantiated* WebAssembly.Module, so wasm-bindgen glue
 * code (`wasm.__wbindgen_start()`) breaks. This plugin closes that gap:
 * for any `.wasm` import, it introspects the compiled module's own
 * import section to find the glue module's relative path, imports that
 * glue module for its exports, instantiates against it, and returns the
 * resulting instance's exports object as if it were the module's default
 * export set -- exactly what a bundler would hand back.
 */
plugin({
	name: "wasm-bindgen-bundler-target",
	setup(build) {
		build.onLoad({ filter: /\.wasm$/ }, async (args) => {
			const bytes = readFileSync(args.path);
			const mod = new WebAssembly.Module(bytes);
			const importDescriptors = WebAssembly.Module.imports(mod);
			const moduleNames = new Set(importDescriptors.map((i) => i.module));

			if (moduleNames.size !== 1) {
				throw new Error(
					`wasm-bindgen-bundler-target plugin: expected exactly one import module name in ${args.path}, got ${[...moduleNames].join(", ")}`,
				);
			}

			const [glueRelativePath] = moduleNames;
			const gluePath = join(dirname(args.path), glueRelativePath);
			const glueModule = await import(gluePath);

			const instance = new WebAssembly.Instance(mod, {
				[glueRelativePath]: glueModule,
			});

			return {
				exports: { ...instance.exports },
				loader: "object",
			};
		});
	},
});
