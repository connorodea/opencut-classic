# OpenCut Fork — Headless Invocation Contract (Goal 2a)

> Scope, per GOALS.md 2a: how a caller addresses a project and invokes an Action with
> args, with a CLI-vs-local-server transport decision. Explicitly **not** resolving
> MCP-vs-REST (that's VISION.md's Next milestone) — this is the invocation contract
> underneath whatever agent-facing protocol comes later.

_2026-08-06 · v1.0_

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

## Next (2b)

Implement the runner: (1) `FileSystemAdapter`/`FileSystemBlobAdapter` + the
environment-branch in `StorageService`, (2) extract `use-editor-actions.ts`'s handler
bodies into plain functions callable from both the React hook and the headless runner,
(3) the `run.ts` entry point + `steps.json` schema validation, (4) smoke-test
`RendererManager`/`AudioManager`/`toast` don't throw during a real headless run. Accept
criteria per GOALS.md 2b: the shell loads a real project, invokes at least one Action
end-to-end, and persists the result correctly.
