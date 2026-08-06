# OpenCut Fork — Headless Invocation Contract (Goal 2a)

> Scope, per GOALS.md 2a: how a caller addresses a project and invokes an Action with
> args, with a CLI-vs-local-server transport decision. Explicitly **not** resolving
> MCP-vs-REST (that's VISION.md's Next milestone) — this is the invocation contract
> underneath whatever agent-facing protocol comes later.

_2026-08-06 · v1.1 — see the "v1.1 correction" section: the storage-layer plan below
(section 1) is implemented and verified working. The "single-process script directly
imports `@/core`" bootstrapping claim is **not** verified and turned out to be wrong as
stated — a real WASM-loading incompatibility blocks it under Bun/Node outside Next's own
bundler. Corrected at the bottom rather than silently revised upward, since this session
already did the wrong thing once (the original v0.1 gap audit under-counted by omitting
3 methods) and disclosing corrections beats quietly fixing them._

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

## Next (2b)

In order: (1) resolve the WASM-loading blocker above — try the Next.js-server-runtime
path first since it's the smaller unknown, fall back to a Bun WASM loader if that also
fails; (2) once `EditorCore.getInstance()` genuinely runs headlessly, extract
`use-editor-actions.ts`'s handler bodies into plain functions — note this is **not**
uniformly mechanical the way "thin one-liner into a manager method" suggested: the
~39 actions added while closing `GAP_MAP.md` are true thin wrappers with no React
dependency, but a meaningful share of the original 30 close over React-only state
(`selectedElements`, `selectedKeyframes`, scope-activation refs) that has no headless
equivalent yet and needs real design work, not a mechanical move; (3) the `run.ts` entry
point + `steps.json` schema validation; (4) smoke-test `RendererManager`/
`AudioManager`/`toast` don't throw during a real headless run. Accept criteria per
GOALS.md 2b unchanged: the shell loads a real project, invokes at least one Action
end-to-end, and persists the result correctly.
