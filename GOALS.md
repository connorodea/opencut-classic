# OpenCut Fork (working name) — Goals (north-star cascade)

> North star: the video editor where every capability a human can click is also a command
> an AI agent can call — so DaVinci-grade grading, FCP-grade editing, CapCut-grade social
> speed, and Descript-grade text editing all become programmable from one core.
> Source: VISION.md (v3) · _Last updated: 2026-08-06 · Plan version: v2_

## Alignment anchors (every goal must serve these)

**Pillars:**
- The UI is just one client of the control surface — every capability is a versioned,
  typed Action both the UI and an AI agent call identically.
- The Rust core (and, until fully migrated, the existing Action layer) stays the single
  source of truth for logic — no shadow API for agent control.
- Preserve ~90% of classic's current feature surface; extend, don't replace, unless a
  module is explicitly superseded.
- MIT / open source, serving both internal automation use (Reelwire/Cutroom-style
  pipelines) and a public product — same architecture, no fork between the two.
- Augment the expert editor, don't replace them.

**Non-goals (out of scope now):** plugin marketplace, mobile app, matching the rewrite's
Rust-core Editor API 1:1, Fairlight-grade audio mixing, node-based VFX/compositing,
transcript-driven editing, templates/social export layer, MCP server, desktop (GPUI)
parity. (Node-based color grading was on this list until Goal 4 — see below.)

**MVP boundary:** In = fork classic (done), a complete + documented Action API covering
every current UI-triggerable operation, and headless invocation sufficient for a script to
produce a real, finished edit end-to-end with zero GUI. Out = everything in the non-goals
list above, deferred to VISION.md's Next/Later milestones. **Explicit exception:** Goal 4
(color grading foundation, `DAVINCI_PARITY.md` Phase 1) is Later-milestone work pulled
forward ahead of Goal 3's proof gate on direct user instruction ("execute," given
immediately after reviewing the phased roadmap) — recorded here as a conscious MVP-
boundary override, not a silent redefinition of what "MVP" means going forward.

## Goals

### Goal 1 — Every UI operation is a documented Action, with zero gaps · serves: core value prop
**Done when:** every currently UI-triggerable operation in classic has a corresponding
registered Action with typed args and a doc entry per the existing `docs/actions.md`
pattern; no UI handler calls `editor.xxx()` directly, bypassing `invokeAction`.
**Status:** done 2026-08-06 (70 Actions registered, `GAP_MAP.md` v1.1). The
media-import gap flagged when 1a/1b were first marked done (paste/drag-drop bypassing
the Action layer) is now closed too: `add-media-asset` wraps
`MediaManager.addMediaAsset` directly, and the deferred design question ("what does an
agent hand over instead of a browser `File`?") resolved to "a pre-processed `MediaAsset`
object" — the manager already took that shape, so no new design was actually needed.
Verified headlessly via `apps/web/headless/run.ts` + `media-import-example-steps.json`:
a real file's bytes persist correctly through both storage layers. Automatic probing of
a raw file's duration/dimensions/fps (what `processMediaAssets` does in the browser
flow) remains unverified headlessly and is real, separate, deferred work — a caller
supplying those fields itself sidesteps it, as the kept example does. `use-paste-media.ts`
and `drag-drop-controller.ts` correctly keep calling managers directly (browser-event-
driven, nothing to route through `invokeAction`), which is by design, not a lingering gap.
**Sub-goals:**
- [x] **1a** Audit every UI-triggerable operation across `apps/web` (buttons, menus,
  shortcuts, panels) and produce a gap-map: covered-by-an-Action vs. direct-handler-bypass
  — _advances:_ makes the actual size of the gap visible before closing it — _accept:_ a
  written gap-map covering 100% of currently-triggerable operations, each tagged
  covered/gap. **Done 2026-08-06 — see `GAP_MAP.md`.** Found 30 registered Actions vs. ~38
  manager-level mutating methods (`TimelineManager`/`ScenesManager`/`ProjectManager`,
  backed by 53 `Command` classes under `apps/web/src/commands/`); only ~12 have any
  Action-layer coverage. 26 methods have zero coverage, including `ProjectManager.export`
  — the single highest-value gap, since without it an agent cannot produce an actual
  output file through the Action API at all. Whole subsystems (effects, keyframes/
  animation, masks, scene CRUD, track-level ops, project lifecycle) are currently
  unreachable via any Action.
- [x] **1b** Close every gap from 1a, in `GAP_MAP.md`'s Tier 1 → 2 → 3 order — register
  the missing Action per `docs/actions.md`,
  or refactor the handler to route through `invokeAction` — _advances:_ completes the
  control surface that Goal 2 and Goal 3 depend on — _accept:_ gap-map re-run shows zero
  remaining gaps; each new Action is documented. **Tier 1 done 2026-08-06** —
  `export-project`, `create-project`, `load-project`, `save-project`,
  `update-project-settings` registered (PR #1); 34 Actions total. **Tier 2's effects
  subsystem done 2026-08-06** — `add-clip-effect`, `remove-clip-effect`,
  `toggle-clip-effect`, `reorder-clip-effects`, `update-clip-effect-params` registered
  (PR #1); 39 Actions total. **Tier 2's keyframes/animation subsystem done 2026-08-06** —
  `upsert-keyframe`, `retime-keyframe`, `update-keyframe-curve`,
  `upsert-effect-param-keyframe`, `remove-effect-param-keyframe` registered (PR #1);
  44 Actions total. **Tier 2's masks subsystem done 2026-08-06** — `remove-mask`,
  `toggle-mask-inverted`, `insert-freeform-path-mask-point` registered (PR #1);
  47 Actions total. **Tier 2's scene CRUD subsystem done 2026-08-06** — `create-scene`,
  `delete-scene`, `rename-scene`, `switch-scene` registered, plus `remove-bookmark`,
  `update-bookmark`, `move-bookmark` (3 gaps missed in the original 1a audit, caught and
  closed alongside — see `GAP_MAP.md` v0.6) (PR #1); 54 Actions total. **Tier 2's tracks
  subsystem done 2026-08-06** — `add-track`, `remove-track`, `toggle-track-mute`,
  `toggle-track-visibility` registered (PR #1); 58 Actions total. **Tier 2's
  project-library-lifecycle subsystem done 2026-08-06 — Tier 2 fully closed** —
  `rename-project`, `duplicate-projects`, `delete-projects`, `update-project-thumbnail`,
  `close-project` registered (PR #1); 63 Actions total. **Tier 3 + the direct-bypass
  audit done 2026-08-06** — `insert-element`, `update-element-trim`,
  `update-element-retime`, `move-elements`, `update-elements`, plus
  `insert-captions-as-text-track` (the one genuine bypass gap; `subtitles/insert.ts` was
  a pure function, closeable like any other Tier 3 item) registered (PR #1); 69 Actions
  total, `GAP_MAP.md` v1.0. Marking 1b done: every identified gap traceable to a
  same-shape closure (register an Action, wrap the existing manager method) is closed.
  One deliberately-deferred exception remains — see Goal 1's status line below.
**Loop (if iterative):** each cycle → pick the next open gap from the gap-map (largest-
used-operation first), close it, re-run the gap-map, report the new gap count. Stop when
the gap-map shows zero gaps.

### Goal 2 — A headless shell can invoke the Action API with zero GUI · serves: core value prop, "agentic/headless editing" workflow
**Done when:** an external script/CLI can load a project, invoke Actions against it, and
produce a valid, openable/exportable project — with no browser or desktop app involved.
**Status:** 2a and 2b's own accept criteria both met 2026-08-06. One honest caveat on
Goal 2's overall done-when: "openable" is met (the saved file is the same storage
format the real app reads); "exportable" is met only in the sense that the Action
dispatches and reports errors correctly — actually rendering real content is currently
blocked on a genuine WebGPU gap (below), not yet true end-to-end. `apps/web/headless/
run.ts` loads/creates a project and runs named Actions from a `steps.json` file against
real files on disk, verified end-to-end (a settings change + a track add, correctly
persisted and correctly pruned respectively). Also specifically checked
`export-project` (fire-and-forget, so checked by polling `getExportState()` rather than
trusting the call not throwing): it dispatches and completes its lifecycle correctly on
an empty project, resolving with a legitimate business-logic rejection
(`"Project is empty"`), not an infra crash — so the Action mechanism itself works
headlessly. **Exporting a project with real content: traced to a root cause, and it's
bigger than expected.** Followed the actual call chain (`RendererManager.exportProject`
→ `SceneExporter` → `CanvasRenderer.render()` → `wasmCompositor` → WASM
`initCompositor`/`renderFrame`) and tested each link directly under Bun:
`initCompositor` requires `initializeGpu()` first, which throws `"No WebGPU adapter is
available"` — confirmed Bun has no `navigator.gpu` at all. **This project's compositor
needs genuine WebGPU; there's no software/CPU fallback and no simple polyfill for it**
(a `@napi-rs/canvas` install was tried and reverted — it only covers 2D canvas APIs,
unrelated to GPU adapter acquisition, wouldn't have helped). Real fixes are all
substantially bigger than a session continuation: a native WebGPU binding for Bun/Node,
a CPU rendering fallback in the Rust engine itself, or running the headless entry inside
a real GPU-capable browser (headless Chrome via Playwright) instead of bare Bun. **Net
effect: the headless shell edits and persists a project completely correctly, but
cannot currently render one** — not "unverified," genuinely can't, until one of the
above gets built. See `HEADLESS_DESIGN.md` v1.5 for the full chain and evidence.
**Sub-goals:**
- [x] **2a** Design the headless invocation contract — CLI vs. local server transport, how
  a caller addresses a project and invokes an Action with args. Explicitly does NOT need to
  resolve the MCP-vs-REST open question from VISION.md yet — that's a Next-milestone
  decision — _advances:_ gives Goal 2 a concrete shape before building it — _accept:_ a
  short written invocation contract. **Done 2026-08-06 — see `HEADLESS_DESIGN.md`.**
  Key findings: `EditorCore.getInstance()` already has no browser dependency at
  construction (good news, wasn't obvious); the one confirmed blocker is
  `StorageService` hardcoding `IndexedDBAdapter`/`OPFSAdapter`, fixable by adding
  Node-backed adapters implementing the existing `StorageAdapter<T>` interface and
  branching on environment, not a parallel storage layer. Transport decision: a
  single-process script running an ordered `steps.json` of `{action, args}` calls against
  one loaded project (not a CLI-per-Action-call — that would throw away the in-memory
  undo/redo session Deriv8ion's per-command-process CLI pattern doesn't need to preserve
  — and not a local server, since that's really the deferred MCP question). Flagged for
  2b: `SaveManager`'s 800ms debounced auto-save means a one-shot script must explicitly
  `save-project` and wait before exit; `RendererManager`/`AudioManager`/`toast` calls are
  unverified outside a browser and need a smoke test, not an assumption either way.
- [x] **2b** Implement the headless shell as a new thin shell alongside `apps/web` and
  `apps/desktop`, calling the same Action layer Goal 1 completed — no parallel/duplicate
  logic — _advances:_ the Action-layer-stays-source-of-truth principle — _accept:_ the
  shell loads a real project, invokes at least one Action end-to-end, and persists the
  result correctly. **Done 2026-08-06** — the account below (started, hit the WASM
  blocker, fixed it, then found the deeper WebGPU rendering gap) is kept in full as the
  real record, but the final state is: `apps/web/src/actions/handlers.ts` extracts the
  ~39 thin-wrapper Actions into plain functions shared between the React hook and the
  headless runner, and `apps/web/headless/run.ts` dispatches real named Actions (not
  manager-method shortcuts) from a `steps.json` file — verified end-to-end, satisfying
  2b's accept criteria exactly as written. **Started 2026-08-06, blocked partway through — see
  `HEADLESS_DESIGN.md`'s v1.1 correction.** Storage layer is done and verified for real
  (`FileSystemAdapter`/`FileSystemBlobAdapter`, `StorageService` branches on environment;
  a standalone script round-tripped set/get/list/getAll/remove/clear against real files
  on disk under Bun). Bootstrapping `EditorCore` headlessly is **not** done: actually
  running `EditorCore.getInstance()` under `bun run` (not just typechecking it) throws —
  `opencut-wasm`'s glue code expects a bundler to auto-instantiate its `.wasm` binary,
  which Bun's native WASM import doesn't do the same way, and this fires at module-load
  time just from importing `@/core` transitively (MediaTime utilities share a compiled
  module with this package's GPU-compositing code). 2a's "no browser dependency at
  construction" claim was checked by reading the constructor, not by running it — this is
  the gap between those two, caught before being reported as done. **Tried the proposed
  fix (Next.js-server-runtime path) — it also fails, for an unrelated reason**: a real
  Route Handler smoke test (`next dev` + `curl`, not a guess) shows `ScenesManager`
  transitively imports a React component (`bookmarks.tsx`) through a barrel file
  (`@/timeline/bookmarks/index.ts` mixes logic exports with component exports), which
  Next's RSC compiler rejects outright. Both v1.1's candidate fixes were known-blocked
  for two unrelated reasons at that point. **Then the WASM blocker was actually fixed
  (`HEADLESS_DESIGN.md` v1.3)**: `apps/web/headless/wasm-bindgen-bun-plugin.ts`, a real
  `Bun.plugin` that instantiates wasm-bindgen "bundler"-target `.wasm` binaries under
  bare Bun by introspecting the compiled module's import section
  (`WebAssembly.Module.imports()`) and wiring it to its glue JS file directly — no
  Next.js involved, sidestepping the v1.2 barrel issue entirely (confirmed: "use client"
  is a Next-RSC-only concept, bare Bun doesn't enforce it). Verified escalating from a
  standalone `opencut-wasm` call, to `EditorCore.getInstance()` constructing cleanly, to
  a full create→mutate→save→reset→reload round-trip
  (`apps/web/headless/bootstrap-proof.ts`, kept in the repo) — all pass. Along the way,
  fixed a genuinely pre-existing bug on the critical path:
  `migrations/runner.ts` called `IndexedDBAdapter`'s constructor with 3 positional args
  against a 1-object-arg signature (already flagged by `tsc` in this session's very
  first baseline, unrelated to headless work, just never hit until `loadProject` was
  actually exercised outside a browser). `v1-to-v2.ts` has the same bug in 3 more spots,
  left unfixed — legacy-migration-only, out of scope for this pass.
  **Precision note (resolved)**: at this point in the work, the proof only called
  `editor.project.updateSettings(...)` (the manager method) directly, not through
  `invokeAction` — proving `EditorCore` + persistence work headlessly, not yet that a
  registered Action does. The handler-extraction work above closed that gap for real;
  2b's actual accept criteria (invoke an Action end-to-end) is now genuinely met, not
  just the bootstrapping prerequisite.

### Goal 3 — A real headless edit proves the Action API is valuable, not just complete · serves: mitigates VISION.md's named risk (stalling at automation-API-complete/feature-thin)
**Done when:** a real, non-toy scripted/agentic edit is produced entirely through the
headless shell + Action API, zero GUI involved, and a human stakeholder confirms it's
genuinely something they'd use — not just mechanically correct output.
**Status:** todo (blocked on Goal 2)
**Sub-goals:**
- [ ] **3a** Pick a concrete, specific, non-toy edit scenario (e.g. script-to-cut from
  real footage you'd actually want edited) — _advances:_ makes "proof" demoable rather than
  hand-wavy — _accept:_ the scenario is specific enough that success/failure is obvious.
- [ ] **3b** Execute the scenario fully headless and get explicit human sign-off — _advances:_
  this sub-goal **is** the non-negotiable gate from VISION.md's roadmap — _accept:_ the
  human stakeholder explicitly confirms the result is useful, not merely that it ran
  without errors.

**This goal is the gate.** Per VISION.md v2's roadmap, Next (transcript editing,
auto-captions, MCP server) does not start until Goal 3 passes. If it doesn't pass, that's
signal the problem is feature depth, not API completeness — revisit scope, don't proceed
on autopilot.

### Goal 4 — Color grading foundation is a documented, agent-drivable Action surface · serves: core value prop ("DaVinci-grade grading" from the north star, "UI is just one client of the control surface" pillar)
**Done when:** primary wheels, log wheels, RGB/luma curves, HSL/RGB/luma qualifiers, a
basic serial+parallel node graph, and LUT (1D/3D `.cube`) import/apply can all be built
on a clip entirely through registered Actions, with grading state correctly persisted
and headlessly verifiable — the same rigor `GAP_MAP.md` established for Goal 1. Scopes
(waveform/vectorscope/histogram/parade) exist as verification tooling, with their own
pixel-level correctness explicitly gated on the still-unresolved WebGPU rendering
blocker, not assumed solved.

**Status:** todo — started 2026-08-06. **Explicit sequencing override, recorded rather
than silently skipped:** `DAVINCI_PARITY.md` and this document's own Sequencing section
both state Later-milestone work (which this is — `DAVINCI_PARITY.md` Phase 1) stays
gated behind Goal 3 passing, and Goal 3 has not passed — it's still blocked on a
human-supplied real edit scenario (see Goal 3's status above, unchanged by this). The
user said "execute" immediately after reviewing the phased DaVinci roadmap; treated as
direct, explicit authorization to start Phase 1 now, overriding the stated gate for this
one goal. This does not lift the gate for Phases 2–5 or for Goal 3 itself — each future
Later-phase start needs its own explicit go-ahead the same way, not an implied blanket
release once one override happens.

**Sub-goals:**
- [ ] **4a** Audit `DAVINCI_PARITY.md`'s Phase 1 scope against the current codebase,
  design the grading data model (where grade state lives — a new field set on
  `TimelineElement`? a parallel `Command`/`Manager` pair mirroring how effects work?
  what shape do primary/curve/qualifier/node/LUT data take?), and produce a gap-map the
  same way `GAP_MAP.md` did for Goal 1 — _advances:_ makes the real shape of the work
  visible before building it, avoiding Goal 1's own early under-scoping mistake (the
  original v0.1 gap-map missed 3 methods) — _accept:_ a written design + gap-map
  covering every Phase 1 item from `DAVINCI_PARITY.md`, each tagged with its target
  Action name(s) and whether it needs new data-model work or fits the existing
  `add-clip-effect`-style granular-Action pattern directly.
- [ ] **4b** Close every gap from 4a, subsystem by subsystem in `DAVINCI_PARITY.md`'s
  listed order (primary/log wheels → curves → qualifiers → node graph → LUTs → scopes)
  — register each Action per `docs/actions.md`, verify headlessly via
  `apps/web/headless/run.ts` using state-persistence checks (create/mutate/save/reload/
  confirm), not rendered-output checks, since `HEADLESS_DESIGN.md` v1.5's WebGPU gap
  blocks real rendering — _advances:_ completes Phase 1's Action surface — _accept:_
  gap-map re-run shows zero remaining gaps for Phase 1's defined scope; scopes
  specifically get flagged as state-only-verified (UI/wiring done, pixel-correctness
  blocked on WebGPU) rather than marked fully done — don't let a scope's accept
  criteria quietly assume rendering works, the same discipline Goal 2's `export-project`
  check applied.

**Loop (if iterative):** each cycle → pick the next open gap from 4a's gap-map, in
`DAVINCI_PARITY.md`'s listed order, close it (register the Action, verify headlessly via
state persistence), re-run the gap-map, report the new count. Stop when the gap-map
shows zero remaining gaps for Phase 1's scope, or a real blocker is hit and documented
(the way Goal 2 documented the WebGPU blocker) rather than silently worked around.

## Sequencing
- **Now:** Goal 1 → Goal 2 → Goal 3, in that order (each unblocks the next). This whole
  cluster **is** VISION.md's "Now" milestone, decomposed. **Goal 4 runs alongside/ahead
  of Goal 3** as an explicit, recorded override (see Goal 4's status) — this is not a
  reordering of the Now cluster itself, Goal 3's gate is unchanged for everything after it.
- **Next:** Not yet decomposed into goals — opens only after Goal 3 passes. Per VISION.md:
  transcript-driven editing + auto-captioning (Descript/CapCut tier) on the same Action
  surface, then an MCP server once that surface is stable.
- **Later:** Fairlight-grade audio mixing, node-based VFX/compositing, template
  ecosystem, desktop parity, plugin system — `DAVINCI_PARITY.md` Phases 2–5. Scoped in
  detail (5 phases with FOSS accelerants and license analysis), not started, still gated
  behind Goal 3's proof gate — Goal 4's override is scoped to Phase 1 only, not a
  blanket release for the rest.

## Drift watch
No existing backlog on this fork yet (brand new — nothing to flag against these goals).
One thing to watch as upstream `opencut-classic` changes get pulled in: its own README
already marks "Preview panel enhancements (fonts, stickers, effects) and export
functionality" as **avoid for now** upstream, because they're mid-refactor there. Absorbing
upstream changes in those areas without checking them against this plan's MVP boundary
would be silent scope drift — worth a conscious check each time upstream is merged in, not
an assumption that upstream's priorities match ours.

## Runnable prompts

**/goal — Goal 1:**
```text
/goal Goal 1: Every UI operation is a documented Action, with zero gaps
Serves vision pillar: the UI is just one client of the control surface. Done when: every
currently UI-triggerable operation in classic/apps/web has a registered, documented Action;
no handler bypasses invokeAction. Non-goals: don't touch grading/audio/transcript/template
work, that's Next/Later. Read GOALS.md + VISION.md first.
Acceptance checks: gap-map shows zero remaining gaps; every new Action is documented per
docs/actions.md. Report what shipped + what's left.
```

**/loop — Goal 1 (gap closure):**
```text
/loop Goal 1 — close Action API gaps
Each cycle: re-read the current gap-map, pick the next open gap (largest-used operation
first), close it (register the Action per docs/actions.md or refactor the handler to use
invokeAction), re-run the gap-map, report the new count.
Stop when: gap-map shows zero remaining gaps. Don't repeat already-closed gaps.
```

**/goal — Goal 2:**
```text
/goal Goal 2: A headless shell can invoke the Action API with zero GUI
Serves vision pillar: the UI is just one client of the control surface; "agentic/headless
editing" workflow. Done when: an external script/CLI loads a project, invokes Actions
against it, and produces a valid result — no browser/desktop app involved. Non-goals: don't
resolve MCP-vs-REST transport yet, don't build the desktop shell. Read GOALS.md + VISION.md
first, and confirm Goal 1's gap-map is far enough along to cover the operations you'll need.
Acceptance checks: shell loads a real project, invokes at least one Action end-to-end,
persists a correct result. Report what shipped + what's left.
```

**/goal — Goal 3 (the gate):**
```text
/goal Goal 3: A real headless edit proves the Action API is valuable
Serves vision pillar: mitigates the named risk of stalling at automation-API-complete/
feature-thin. Done when: a real, non-toy scripted edit is produced entirely headless, and a
human stakeholder confirms it's genuinely useful. Read GOALS.md + VISION.md first.
Acceptance checks: the scenario is specific and demoable; explicit human sign-off is
recorded, not assumed. This is a gate — if it doesn't pass, report that plainly and flag
that VISION.md's Next milestone should not start yet.
```

**/goal — Goal 4:**
```text
/goal Goal 4: Color grading foundation is a documented, agent-drivable Action surface
Serves vision pillar: DaVinci-grade grading, "the UI is just one client of the control
surface." Done when: primary/log wheels, curves, HSL/RGB/luma qualifiers, a basic node
graph, and LUT import/apply are all built entirely through registered Actions, verified
headlessly via state persistence (not rendering — HEADLESS_DESIGN.md v1.5's WebGPU gap
blocks that). Non-goals: tracked Power Windows, HDR grading, Face Refinement, temporal
noise reduction, full ACES/DaVinci Wide Gamut, stereo 3D — DAVINCI_PARITY.md Phase 1
scope only. Read GOALS.md + DAVINCI_PARITY.md + HEADLESS_DESIGN.md first.
Acceptance checks: gap-map (4a) shows zero remaining Phase-1 gaps after 4b; every new
Action documented per docs/actions.md; scopes flagged state-only-verified, not claimed
fully done. Report what shipped + what's left.
```

**/loop — Goal 4 (gap closure):**
```text
/loop Goal 4 — close color-grading Action gaps
Each cycle: re-read the current gap-map (4a), pick the next open gap in
DAVINCI_PARITY.md's Phase 1 order (wheels → curves → qualifiers → node graph → LUTs →
scopes), close it (register the Action per docs/actions.md, verify headlessly via
apps/web/headless/run.ts using state-persistence checks), re-run the gap-map, report the
new count.
Stop when: gap-map shows zero remaining Phase-1 gaps, or a real blocker is hit and
documented rather than worked around. Don't repeat already-closed gaps.
```

## Changelog
- 2026-08-06 v1 — Initial cascade from VISION.md v2: three goals decomposing the "Now"
  milestone (complete Action API → headless shell → proof gate), tethered to the core
  value prop and the risk named in VISION.md's v2 changelog.
- 2026-08-06 v1.1 — VISION.md v3 fleshed out the "Later" milestone into
  `DAVINCI_PARITY.md` (5-phase DaVinci-parity roadmap + FOSS accelerant/license map).
  Sequencing's Later line now points to it. No change to the active Goal 1–3 cascade or
  Goal 3's gate — Later stays Later until Goal 3 passes.
- 2026-08-06 v2 — Added Goal 4 (color grading foundation, `DAVINCI_PARITY.md` Phase 1),
  cascaded via `/northstar` on explicit user instruction ("execute," immediately after
  reviewing the phased roadmap) — a deliberate, recorded override of the Goal-3-gate
  this document itself states, scoped to Phase 1 only. Removed "node-based color
  grading" from the Non-goals list (now in scope via Goal 4); added an explicit
  MVP-boundary exception note rather than quietly redefining what MVP means. Also fixed
  a document-integrity gap found while refreshing: Goal 2's sub-goal 2b was still marked
  `[ ]` with stale mid-progress detail text, even though Goal 2's own top-level status
  had already recorded it done — checkbox and detail now match the real final state
  (handler-extraction + `run.ts` real-Action dispatch, verified).
