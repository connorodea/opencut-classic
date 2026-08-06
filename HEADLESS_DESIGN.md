# OpenCut Fork — Headless Invocation Contract (Goal 2a)

> Scope, per GOALS.md 2a: how a caller addresses a project and invokes an Action with
> args, with a CLI-vs-local-server transport decision. Explicitly **not** resolving
> MCP-vs-REST (that's VISION.md's Next milestone) — this is the invocation contract
> underneath whatever agent-facing protocol comes later.

_2026-08-06 · v1.4 — **Goal 2b's actual accept criteria is now met, precisely as
written**, not just its bootstrapping prerequisite. v1.1–v1.3 got `EditorCore` +
persistence running headlessly at all; v1.4 extracts the Action-layer handlers into
`apps/web/src/actions/handlers.ts` and adds `apps/web/headless/run.ts`, a real runner
that loads/creates a project and executes an ordered `steps.json` of named Actions
(`{"action": "update-project-settings", "args": {...}}`, not manager-method calls) —
verified end-to-end against real files on disk, not asserted. All corrections kept in
order rather than collapsed into a clean-looking final state, since the false starts are
part of the real record — same practice as every other correction in this document and
in `GAP_MAP.md`._ **v1.5 adds one significant, sobering finding on top of that: real
(non-empty) rendered output — export, thumbnails, anything touching an actual frame —
needs genuine WebGPU, which neither Bun nor Node currently provide. The headless shell
works completely for editing and persisting a project; it cannot yet render one. See
the v1.5 section below before assuming Goal 3 can produce a rendered result.**

## What's actually being decided

Goal 2's done-when is "an external script/CLI can load a project, invoke Actions against
it, and produce a valid, openable/exportable project — with no browser or desktop app
involved." Two separable questions:

1. **Can `EditorCore` + the Action layer even run outside a browser?** (bootstrapping)
2. **What does the external caller's interface look like?** (transport)

## 1. Bootstrapping: EditorCore already doesn't need a browser to construct

`EditorCore` (`apps/web/src/core/index.ts`) is a plain lazy singleton —
`EditorCore.getInstance()` has no `window`/React dependency, just
`new CommandManager(this)`, `new TimelineManager(this)`, etc. A Node script can
`import { EditorCore } from "@/core"` and call `.getInstance()` directly. **This is good
news and was not obvious going in** — it means the Action layer (`invokeAction`,
`use-editor-actions.ts`'s handlers minus their `useActionHandler`/React wiring) is
already decoupled from any browser runtime at the construction level.

The real blocker is narrower and more contained than "the whole app is browser-coupled":

### The one confirmed blocker: persistence

`StorageService` (`apps/web/src/services/storage/service.ts`) hardcodes
`new IndexedDBAdapter(...)` and `new OPFSAdapter(...)` in its constructor and inline at
call sites — both wrap browser-only APIs (`indexedDB`, `navigator.storage.getDirectory`).
Every manager that persists state (`ProjectManager`, media loading, etc.) imports the
`storageService` singleton directly, not via injection.

**This is more tractable than it sounds**, because:
- `StorageAdapter<T>` (`get`/`set`/`remove`/`list`/`clear`) is already a clean, generic
  interface both `IndexedDBAdapter` and `OPFSAdapter` implement.
- All adapter instantiation is confined to `apps/web/src/services/storage/` (service.ts
  + migrations/) — 8 total call sites across the whole app import `storageService`, and
  none of them reach past its public method contract (~20 methods: `saveProject`,
  `loadProject`, `deleteProject`, `saveMediaAsset`, etc.).

**Recommendation:** add a `FileSystemAdapter implements StorageAdapter<T>` (JSON-per-key
files) and a `FileSystemBlobAdapter implements StorageAdapter<File>` (raw file per key,
mirroring OPFS's per-project media directory convention), then branch `StorageService`'s
adapter construction on environment (`typeof indexedDB !== "undefined"` /
`typeof window === "undefined"`) rather than building a parallel storage layer. This
extends the existing abstraction instead of replacing it — consistent with GOALS.md's
"extend, don't replace" principle — and every calling manager stays completely
unchanged, since they only ever call `storageService.*` methods, never touch adapters
directly.

### Secondary, unresolved browser dependencies (flagged, not solved here)

`EditorCore`'s constructor also unconditionally builds `RendererManager` (canvas/WebGL,
for preview/thumbnail rendering) and `AudioManager` (Web Audio API), and
`project-manager.ts`/`media-manager.ts` call `toast.*` (from `sonner`, a DOM toast
library) on error paths. None of these block *construction* — `EditorCore.getInstance()`
already succeeds without a DOM present, per the code path above — but they're real
runtime risks the moment a headless script's edit sequence touches preview rendering,
audio, or hits an error path that calls `toast.error(...)`. **2b's implementation work
should smoke-test whether these degrade gracefully (no-op without a DOM) or throw**,
rather than this design doc assuming either. If they throw, the fix is narrow (guard the
`toast` calls, or stub the two managers for the headless target) — not a reason to
reconsider the overall approach.

### Auto-save timing matters for a one-shot script

`SaveManager` auto-saves via an 800ms-debounced subscription to scene/timeline changes
(`save-manager.ts`), not synchronously on every mutation. A headless script that runs a
sequence of actions and then exits the process immediately can race the debounce and
lose the final edits. **The invocation contract must end every session with an explicit
`save-project` action call, and the shell must wait for that call's
`editor.project.getExportState()`-style completion signal (or a fixed flush delay) before
exiting** — don't rely on auto-save alone in a short-lived process.

## 2. Transport: single-process script, not a CLI-per-action or a local server

Two options considered, plus what was actually chosen:

| Option | Shape | Verdict |
|---|---|---|
| **CLI, one process per Action call** (à la `logseq-cli list`/`upsert`/... from the sibling Deriv8ion fork this session) | Each invocation is a fresh process: load project → run one action → save → exit | **Rejected for this app.** Deriv8ion's CLI works this way because its state is a persistent, transactional DataScript store — every command is naturally atomic. OpenCut's `CommandManager` holds an in-memory undo/redo history across a whole editing session; forcing a fresh process (and a full project load) per Action call throws that away and makes even a 20-action edit sequence pay 20x the load/save overhead for no benefit. |
| **Local server, long-running, actions submitted over HTTP/IPC** | One persistent process holds the loaded `EditorCore`; a caller submits Actions over a socket/HTTP as multiple separate requests | **Deferred, not rejected.** This is the right shape once an agent needs to interleave *observation* (read state, decide next action) with mutation across a live session — but that's exactly the MCP-server-shaped problem VISION.md explicitly defers to the Next milestone. Building it now would mean resolving the MCP-vs-REST question 2a is scoped to skip. |
| **Single process, one invocation, a whole script of Actions** | One process: load project once → run an ordered list of `{action, args}` steps entirely in-process (direct `invokeAction`-equivalent calls, no IPC at all since caller and `EditorCore` share a process) → explicit `save-project`/`export-project` → exit | **Chosen.** Matches how a scripted edit (Goal 3's proof scenario) actually wants to run: many actions against one loaded project, one commit at the end. No transport protocol needed at all for a same-process caller — "invocation contract" reduces to a **script file format**, not a wire protocol. |

### The contract, concretely

A headless entry point (`apps/web/src/headless/run.ts` or similar, new — a **thin
sibling to `apps/web`, not inside it**, since it must never bundle React/browser-only
code):

```
bun run headless -- --project <projectId> --script <path-to-steps.json>
```

`steps.json` is an ordered array, each element shaped exactly like an `invokeAction`
call already is in-app:

```json
[
  { "action": "add-clip-effect", "args": { "trackId": "...", "elementId": "...", "effectType": "blur" } },
  { "action": "upsert-keyframe", "args": { "trackId": "...", "elementId": "...", "propertyPath": "opacity", "time": 0, "value": 1 } },
  { "action": "save-project" },
  { "action": "export-project", "args": { "format": "mp4", "quality": "high" } }
]
```

Runner behavior: `EditorCore.getInstance()` → `editor.project.loadProject({ id: projectId })`
→ for each step, call the same handler logic `use-editor-actions.ts` registers (this
does mean extracting each handler's *body* into a plain function `invokeAction` can call
without React — a small refactor of `use-editor-actions.ts`, not a new design; each
handler is already a thin one-liner into a manager method) → after the last step,
confirm `editor.project.getExportState()` shows `isExporting: false` before exiting.

**Addressing a project**: by `projectId`, the same id `ProjectManager` already uses
everywhere (`createNewProject`'s return value, `loadProject`'s `{ id }` param) — no new
addressing scheme needed.

## What this doesn't decide (intentionally, per VISION.md's roadmap)

- **MCP vs. REST vs. any other agent-facing protocol** — that's wrapping *this* runner,
  once it works, per VISION.md's "Next" milestone. This contract is what the wrapper
  would call, not the wrapper itself.
- **Media import** (`GAP_MAP.md`'s deferred gap) — a `steps.json` step referencing media
  needs a concrete answer for "where does the file come from headlessly" (a path? a
  pre-existing asset id already in the project?). Left open here on purpose; 2b's first
  implementation pass can start with edits to *already-imported* media (Goal 3's scenario
  can pick footage already in a project) and resolve media import separately.

## v1.1 correction — WASM loading blocks direct `@/core` import under Bun/Node

**(1) Storage — implemented and verified.** `FileSystemAdapter<T>`
(`apps/web/src/services/storage/filesystem-adapter.ts`) and `FileSystemBlobAdapter`
(`filesystem-blob-adapter.ts`) both implement `StorageAdapter<T>`; `StorageService`'s
constructor and `getProjectMediaAdapters` now branch on
`isBrowserStorageAvailable()` (`typeof indexedDB !== "undefined"`). Verified with a
standalone script exercising `set`/`get`/`list`/`getAll`/`remove`/`clear` against real
files on disk under Bun — all round-tripped correctly, including the `{ id: key,
...value }` merge shape `IndexedDBAdapter.set` uses (matched for callers that read `id`
back off a stored record). `bun x tsc --noEmit` shows zero new errors from this change.

**(2) Bootstrapping — the "no browser dependency" claim was wrong.** Actually running
`import { EditorCore } from "@/core"; EditorCore.getInstance()` under `bun run` (not
just typechecking it) fails immediately:

```
TypeError: wasm.__wbindgen_start is not a function
  at .../opencut-wasm/opencut_wasm.js:6:6
```

`opencut-wasm`'s glue code does `import * as wasm from "./opencut_wasm_bg.wasm"; ...
wasm.__wbindgen_start()` — this relies on the *bundler* (webpack/Next.js's async-WASM
handling) to transparently instantiate the `.wasm` binary and hand back its exports
object in place of the raw import. Bun's native `.wasm` import instead returns an
uninstantiated `WebAssembly.Module`, so `wasm.__wbindgen_start` is `undefined`. This
fires at **module load time** (a top-level side effect in the wasm-bindgen glue), so it
can't be dodged by simply not calling any WASM-backed function — importing `@/core` at
all pulls it in transitively, since `MediaTime` utilities (`@/wasm`, used pervasively —
`TProjectMetadata.duration`, every manager) live in the same compiled module as this
package's GPU-compositing exports (`initializeGpu`, `getCompositorCanvas`, `renderFrame`,
`uploadTexture` — a 3MB binary). The original design doc's "EditorCore has no window/
React dependency at construction" claim was checked by reading code and confirming the
constructor's own logic doesn't touch DOM APIs — true, but incomplete: it didn't trace
the transitive import graph far enough to catch this. That's the gap between "read the
code" and "ran the code," and this correction exists because the second one was actually
done before writing this down as fact.

**What this changes about the transport recommendation:** the "single-process script,
no server, no CLI-per-action" *design* still holds — nothing here argues for a server or
a fresh-process-per-action model. What's wrong is the assumption that such a script can
`import "@/core"` directly under a bare Bun/Node runtime. Two real paths forward, neither
explored yet:
- **Write a Bun-native loader for `opencut-wasm`** (Bun supports custom import plugins)
  that properly instantiates the `.wasm` binary and provides whatever import object
  wasm-bindgen expects, so `wasm.__wbindgen_start` resolves. Keeps the single-process
  script design intact; the fix is scoped to one loader, not the app.
- **Run the headless entry inside Next.js's own server runtime** (a Route
  Handler/Server Action, invoked via `next build && next start` + one local HTTP call
  per session) instead of bare `bun run` — Next's bundler already handles this exact WASM
  import correctly for the browser bundle and likely does for its server bundle too
  (unverified). This technically becomes "a local server," but not for the reason the
  transport section above rejected a server (agent-interleaved observation/mutation) —
  it'd be a single request that runs a whole `steps.json` script and returns, same shape
  as the single-process design, just hosted inside Next's process instead of a bare
  script. Worth trying first since it needs no new WASM-loading code, only proving Next's
  server bundle actually handles `.wasm` the same way the client bundle does.

Neither is implemented. **2b is not done and should not be reported as such** — only the
storage layer is real, verified progress; the bootstrapping question this whole design
doc treated as "already answered" turned out to be the actual remaining risk.

## v1.2 correction — the Next.js-server-runtime path also fails, for an unrelated reason

Tried the "smaller unknown" from v1.1's fix list: added a temporary Route Handler
(`app/api/.../route.ts`) that imports `@/core` and calls `EditorCore.getInstance()`,
ran it under real `next dev`, hit it with `curl`. Result, from the actual Turbopack
compile error (not a guess):

```
./src/timeline/bookmarks/hooks/use-bookmark-drag.ts:2:2
You're importing a component that needs `useState`. This React Hook only works in a
Client Component. To fix, mark the file (or its parent) with the "use client" directive.

Import trace:
  route.ts → core/index.ts → core/managers/scenes-manager.ts →
  timeline/bookmarks/index.ts → timeline/bookmarks/components/bookmarks.tsx →
  timeline/bookmarks/hooks/use-bookmark-drag.ts
```

`ScenesManager` imports from `@/timeline/bookmarks` (a barrel `index.ts`) for pure
bookmark-utility functions it actually uses — but that same barrel also re-exports
`bookmarks.tsx` (a React component) and `use-bookmark-drag.ts` (a hook using
`useState`/`useRef`). In a browser bundle this is harmless (webpack/Turbopack bundles
everything together regardless of which exports are used). Next's RSC compiler is
stricter: it statically checks every *file* reachable from a Server Component/Route
Handler's import graph for React-hook usage without a `"use client"` directive, and
fails hard the moment one is found — **per file, not per actually-used export**. So a
barrel mixing pure logic and React components poisons the whole graph for any
server-side consumer, even one that only touches the logic half.

This is a genuinely different problem from the WASM one — not a build-tool
incompatibility, an actual **module-boundary hygiene issue already present in the
app**: at least one manager reaches through a barrel into component code it doesn't
use. It would need to be fixed by splitting `@/timeline/bookmarks/index.ts` into a
logic-only export surface and a components-only one (and `ScenesManager` importing only
the former) — and there's no reason to assume this is the *only* barrel with this shape;
other managers likely have the same issue lurking, only surfaced here because
`ScenesManager` happened to be first in this particular import chain.

**Net effect on the recommendation:** both v1.0's original two candidate fixes are now
known-blocked, for unrelated reasons. The Next.js-server-runtime path is no longer the
clear "try this first, it's smaller" option v1.1 called it — it trades one bounded,
well-understood problem (write a WASM loader) for an open-ended one (find and fix every
barrel that mixes logic and component exports across however many managers touch them,
with no way to know the count without trying). **Revised recommendation: try the Bun
WASM loader first instead.** It's the more bounded piece of work, and fixing it doesn't
also require it — the barrel-hygiene issue is orthogonal to bootstrapping and would need
fixing either way before this path is real, but a Bun loader can be built and tested in
isolation without touching `apps/web`'s own module structure at all.

## v1.3 — the WASM loader, built and verified

Confirmed the barrel-hygiene question from v1.2's "next" list first: a bare Bun/tsc
import doesn't enforce Next's "use client" convention at all (that's purely a Next.js
RSC-compiler concept, not a JS/TS runtime one), so the barrel issue that blocked the
Route Handler path **does not block bare Bun**. Only the WASM loading needed fixing.

**What the WASM incompatibility actually is, precisely** (not just "it's a bundler
thing" — checked with `WebAssembly.Module.imports()`): `opencut_wasm_bg.wasm`'s compiled
import section has 609 imports, all under a single import-module name:
`"./opencut_wasm_bg.js"` — wasm-bindgen's "bundler" target convention, where the
`.wasm` binary's own import declarations literally reference its sibling glue file's
relative path. A real bundler resolves this by importing that glue file for its exports
(609 `__wbg_*`-prefixed JS-interop helper functions — iterator protocol, `Map`
instanceof checks, etc., none of which need the WASM instance itself) and using them as
the `WebAssembly.instantiate` import object. Bun's native `.wasm` import returns only an
uninstantiated `WebAssembly.Module`, doing none of this.

**The fix** — `apps/web/headless/wasm-bindgen-bun-plugin.ts`, a `Bun.plugin` that
intercepts any `.wasm` import: reads the binary, introspects its import section for the
glue-module name (generically — not hardcoded to `opencut_wasm_bg.js`, so it'd work for
any wasm-bindgen bundler-target module), imports that glue module, instantiates against
it, and returns the resulting instance's exports as the load result. Loaded via
`bun run --preload ./headless/wasm-bindgen-bun-plugin.ts <script>`.

**Verified in three escalating steps, not just "it typechecks":**
1. `import * as wasm from "opencut-wasm"` + call `wasm.TICKS_PER_SECOND()` directly →
   real value (`120000`) back from the actual compiled Rust function.
2. `EditorCore.getInstance()` → constructs cleanly, all managers present.
3. `apps/web/headless/bootstrap-proof.ts` (kept in the repo): create a project, mutate
   it (`updateSettings`), save, `EditorCore.reset()` to simulate a fresh process, reload
   from disk via the `FileSystemAdapter` storage layer, confirm the mutation survived.
   **All five checks pass.**

**A false alarm along the way, worth recording so it isn't repeated:** the first version
of the proof script used `addTrack` instead of `updateSettings`, and the added track
appeared to vanish by save time — looked exactly like a headless-specific state-sync
bug. It wasn't. `EditorCore`'s constructor (`apps/web/src/core/index.ts`) registers a
reactor that runs after every command and prunes any overlay/audio track with zero
elements — an empty track added and never populated doesn't survive in the browser
either. Confirmed by calling `AddTrackCommand.execute()` directly, bypassing
`CommandManager` (and therefore the reactor): the track persisted in that path. Swapped
the proof to `updateSettings`, which isn't subject to pruning, and it passes cleanly.
Recorded because "the headless script's result looks wrong" and "the headless script
found a real headless-only bug" are different claims, and this was nearly the wrong one.

**A genuinely pre-existing bug found and fixed on the critical path:**
`services/storage/migrations/runner.ts` unconditionally calls `IndexedDBAdapter`'s
constructor with three positional arguments (`new IndexedDBAdapter(dbName, storeName,
version)`), but the actual constructor takes one destructured object
(`{dbName, storeName, version}`) — already flagged as a `tsc` error in this session's
very first baseline check, before any of this session's changes. In a browser this
silently produces a broken-but-non-crashing adapter (destructuring a string doesn't
throw); in Node it crashes outright once `isBrowserStorageAvailable()` was false and hit
`indexedDB.open`. Fixed alongside the environment-branch work since it was directly on
`loadProject`'s critical path and already broken either way — `v1-to-v2.ts` has the same
positional-args bug in three more places, **left unfixed**: it's the legacy v1→v2
migration path specifically, not reachable by any project created at the current
version, and out of scope for this pass (still flagged in `tsc`'s output, unchanged).

## v1.4 — handler extraction + the real runner, accept criteria met

**`apps/web/src/actions/handlers.ts`**: the ~39 thin-wrapper Actions closing
`GAP_MAP.md` (everything from `export-project` through
`insert-captions-as-text-track` in `use-editor-actions.ts`, confirmed by inspection to
have zero closures over React-only state — no `selectedElements`, no refs, no scope
activation) each became a standalone `(editor: EditorCore, args) => void` function,
fully typed against `TActionArgsMap`. `use-editor-actions.ts` was rewritten to delegate
into these same functions from inside each `useActionHandler(...)` call — a real DRY
refactor, not an addition: the logic moved, it didn't duplicate. A loosely-typed
`ACTION_HANDLERS: Record<string, (editor, args) => void>` dispatch table lives alongside
the named exports, for the runner's dynamic string-keyed lookup (JSON-sourced action
names aren't statically known, so this one boundary trades some type safety for the
alternative — fighting a mapped type across a heterogeneous, partial set of Actions —
which wasn't worth it).

**`apps/web/headless/run.ts`**: `bun run --preload ./headless/wasm-bindgen-bun-plugin.ts
headless/run.ts --project <id|new:Name> --steps <path>` loads or creates a project,
runs each `{action, args}` step from the JSON file through `ACTION_HANDLERS[step.action]`
— genuine Action-name dispatch, not a manager-method shortcut — and does an explicit
final `saveCurrentProject()` regardless of whether the step list already ends in one
(cheap insurance against `SaveManager`'s debounce, per the "auto-save timing" risk
flagged back in v1.0).

**Verified, not asserted** — `apps/web/headless/example-steps.json`
(`update-project-settings` → `add-track` → `save-project`) run through `run.ts` against
real files on disk: both steps executed via their actual Action names, the persisted
project file has `settings.fps` correctly changed, and the added track is correctly
absent (the empty-track-pruning reactor from v1.3's false-alarm section, working exactly
as documented, not a regression). **Goal 2b's accept criteria is met as literally
written**, with the earlier imprecision (manager-method call passed off as "an Action
ran") actually corrected, not just re-asserted more confidently.

Separately checked `export-project` specifically, since it's the highest-value Action
and it's fire-and-forget (the handler doesn't await, matching the UI's own polling
pattern) — trusting "the call didn't throw" wouldn't actually prove anything. Polled
`editor.project.getExportState()` after dispatching it against an empty project: it
transitions `isExporting: true` → `false` and resolves with `{success: false, error:
"Project is empty"}` — a real, legitimate business-logic rejection, not an infra crash.
So the Action's dispatch-and-lifecycle mechanism works headlessly. Exporting a project
with **actual content** (real media/elements to encode) is still unverified — no
headless test project has any — and is a real risk given `RendererManager`'s confirmed
`OffscreenCanvas` dependency; that's the next thing to actually run, not infer from this.

**What's still open, honestly:**
- The original 30 Actions (playback, selection, clipboard, etc.) are not extracted —
  they close over real React state with no headless equivalent designed yet. Running
  those headlessly is future work, not needed for Goal 2b's own bar.
- `RendererManager`/`AudioManager`/`toast` are confirmed to fail loudly the moment
  they're touched (`OffscreenCanvas is not defined`, seen in every proof run) but are
  already caught by existing try/catch in the code paths this session exercised — not
  smoke-tested for every path, just the ones actually run.
- `v1-to-v2.ts`'s pre-existing positional-args bug (3 spots) remains unfixed —
  legacy-migration-only, still flagged by `tsc`, still out of scope for this pass.

## v1.5 — real-content rendering needs actual WebGPU; traced to the root, not assumed

Follow-up to the `export-project` check in v1.4, which only exercised an **empty**
project (a legitimate business-logic rejection, not a render). Traced what happens once
`SceneExporter.export()` gets past that guard and actually renders a frame, since that's
the case that matters for Goal 3.

**Chain, each link confirmed by reading the code, not inferred:**
`RendererManager.exportProject` → `SceneExporter` → `CanvasRenderer.render()` →
`wasmCompositor.render()` → WASM `initCompositor()`/`renderFrame()` (imported directly
from `opencut-wasm`, exported alongside `initializeGpu`/`getCompositorCanvas`/
`uploadTexture` — the same 3MB compiled module the whole WASM-loading story has been
about). `CanvasRenderer`'s own `OffscreenCanvas` field (from `createCanvasSurface`,
the thing that first threw during thumbnail generation in v1.3/v1.4) turned out to be a
red herring for this specific question — `render()` doesn't touch it; the actual frame
compositing goes through `wasmCompositor` entirely.

**Tested each link directly under Bun** (with the WASM plugin preloaded, so these are
real calls into the compiled module, not typechecking):
- `initCompositor(64, 64)` → throws `"GPU context not initialized. Call
  initializeGpu() first."`
- `initializeGpu()` → throws `"No WebGPU adapter is available"`
- `typeof navigator.gpu` under bare Bun → `undefined`. Bun does not implement WebGPU at
  all (a `navigator` object exists; `.gpu` doesn't).

**Conclusion, stated precisely:** this project's compositor is a genuinely GPU-backed
renderer (wgpu compiled to WASM, targeting WebGPU) — not a CPU/software fallback that
degrades gracefully. There is no simple polyfill for this. (A `@napi-rs/canvas` install
was tried and reverted once this chain was traced — it only implements 2D canvas APIs,
completely orthogonal to WebGPU adapter/device acquisition; it would not have helped and
was removed rather than left in as dead weight.) Real fixes, none attempted here, all
substantially bigger than a session continuation:
- A native WebGPU binding for Bun/Node (e.g. Dawn-backed) — real engineering effort,
  likely needs actual GPU hardware/drivers on whatever machine runs the headless shell,
  and Bun-specific compatibility is unverified.
- A CPU/software rendering fallback path in the Rust/WASM compositor itself — upstream
  engine work, bigger than the above.
- Running the headless entry inside a real GPU-capable browser context (headless Chrome
  via Playwright, with WebGPU flags) instead of bare Bun — a fundamentally different
  transport than v1.0's decision, back to something resembling the path v1.2 explored
  and moved away from, for a genuinely different reason this time (GPU access, not the
  barrel/RSC issue). **Checked, not assumed: this option isn't automatic either.** A
  real Chromium instance (via this session's Playwright MCP tool) was navigated to
  `about:blank` and checked directly — `navigator.gpu` is `undefined` there too. So
  "switch to a real browser" only helps if *that browser's own environment* has GPU
  access (real hardware passthrough, or a working software rasterizer like Dawn's
  SwiftShader) — the fix is "browser + GPU-capable host," not "browser" alone. This
  session's own sandboxed execution environment is itself one example of a host without
  it, which is worth knowing before assuming a Playwright-based fix is a quick swap.

**What this means for Goal 2 / Goal 3, concretely:** the headless shell can load,
create, mutate, and save/reload a project correctly, and can dispatch every Action
including `export-project` — but **cannot currently produce real rendered video output**.
Any real edit run through it today will succeed at every step except actually rendering
a frame. Goal 3's scenario, whenever it's picked, needs to account for this: either the
scenario doesn't require a rendered preview/export (edit-only, verified by inspecting
the saved project state), or this gap gets closed first. Not deciding which — that's
exactly the kind of call this document has repeatedly said isn't mine to make alone.

## Bonus finding — the WASM plugin also unblocks `bun test`

Not part of Goal 2, noted because it was a genuine surprise found while sanity-checking
the handler-extraction refactor didn't regress anything: running the fork's existing
`bun test` suite without the plugin hits the *exact same* `wasm.__wbindgen_start is not
a function` crash this design doc spent v1.1–v1.3 on, in every test file that
transitively imports anything WASM-touching (`src/timeline/__tests__/
update-pipeline.test.ts`, `src/masks/__tests__/snap.test.ts`,
`src/timeline/placement/__tests__/resolve.test.ts`,
`src/services/storage/migrations/__tests__/v27-to-v28.test.ts` — at least these four).
Running the same suite with `--preload ./headless/wasm-bindgen-bun-plugin.ts` lets all
of them actually execute instead of crashing before a single assertion runs. Doing so
surfaces **4 real test failures that were previously invisible** (masked by the whole
file crashing): two `Failed to create text measurement context` errors (looks like a
missing canvas/DOM polyfill in the bare-Bun test environment, separate from this
design's WASM work), and two numeric-precision/fixture mismatches. Not investigated
further — real app-code test failures unrelated to headless work are their own
follow-up, not something to pull into this PR's scope. Flagged here so it isn't lost:
whoever owns test-suite health next should know `bun test` may have been silently
non-functional for any WASM-touching file before this plugin existed, independent of
this document's actual goal.

## Next

Goal 2b is done. Goal 3 (the proof-gate: a real, non-toy scripted edit, human-approved
as genuinely useful) is next per `GOALS.md`'s sequencing — and per its own explicit
scope, that means picking a concrete edit scenario using only the ~39 headless-runnable
Actions above (no playback/selection-dependent UI actions needed for a scripted,
non-interactive edit), not extracting the remaining 30 first unless Goal 3's actual
scenario turns out to need one of them.
