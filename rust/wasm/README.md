# @connorodea/opencut-wasm

Shared video editor logic compiled to WebAssembly. Built from
[connorodea/opencut-classic](https://github.com/connorodea/opencut-classic), a fork of
[OpenCut](https://github.com/opencut/opencut).

## Install

```bash
npm install @connorodea/opencut-wasm
```

## Usage

```ts
import { formatTimecode, mediaTimeFromSeconds } from "@connorodea/opencut-wasm";

const ticks = mediaTimeFromSeconds(1.5);
const label = formatTimecode({ ticks });
```

All exports are documented in the [TypeScript definitions](./opencut_wasm.d.ts).

## Source

Functions are implemented in Rust under [`rust/crates/`](../crates/). This package is the compiled WebAssembly output — do not edit it directly.

## Local development

`apps/web` depends on the published `@connorodea/opencut-wasm` package by default. If
you are editing the WASM source in this repo and want `apps/web` to use your local
build instead:

```bash
# From the repo root -- build:wasm already bakes in --scope connorodea
bun run build:wasm

cd rust/wasm/pkg
bun link

cd ../../../apps/web
bun link @connorodea/opencut-wasm
```

**Caution:** `bun link` on this package has been observed to also pull in a stray,
non-symlinked `@types/react`/`@types/bun` into `apps/web/node_modules`, which breaks
`tsc`/`bun test` for unrelated files (duplicate-type-identity errors, or `bun:test`
module-resolution failures). If that happens, `rm -rf apps/web/node_modules/@types/react
apps/web/node_modules/@types/bun && bun install --frozen-lockfile` restores the correct
symlinked state, then re-point only `node_modules/opencut-wasm` (or
`node_modules/@connorodea/opencut-wasm`) manually at `../../../rust/wasm/pkg` rather than
using `bun link` again.

**Also caution:** leaving the local link in place breaks a plain `bun test` for any file
that transitively imports this package -- bare Bun can't load a wasm-pack
"bundler"-target `.wasm` without the preload plugin `apps/web/headless/
wasm-bindgen-bun-plugin.ts` provides for headless scripts. Revert to the published
package (`bun install --frozen-lockfile`, or repoint the symlink back to
`node_modules/.bun/...`) before running the general test suite.

While you work, rebuild on changes from the repo root:

```bash
bun dev:wasm
```
