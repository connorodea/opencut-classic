# OpenCut Fork (working name) — Goals (north-star cascade)

> North star: the video editor where every capability a human can click is also a command
> an AI agent can call — so DaVinci-grade grading, FCP-grade editing, CapCut-grade social
> speed, and Descript-grade text editing all become programmable from one core.
> Source: VISION.md (v2) · _Last updated: 2026-08-06 · Plan version: v1_

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
Rust-core Editor API 1:1, node-based color grading, Fairlight-grade audio mixing,
transcript-driven editing, templates/social export layer, MCP server, desktop (GPUI)
parity.

**MVP boundary:** In = fork classic (done), a complete + documented Action API covering
every current UI-triggerable operation, and headless invocation sufficient for a script to
produce a real, finished edit end-to-end with zero GUI. Out = everything in the non-goals
list above, deferred to VISION.md's Next/Later milestones.

## Goals

### Goal 1 — Every UI operation is a documented Action, with zero gaps · serves: core value prop
**Done when:** every currently UI-triggerable operation in classic has a corresponding
registered Action with typed args and a doc entry per the existing `docs/actions.md`
pattern; no UI handler calls `editor.xxx()` directly, bypassing `invokeAction`.
**Status:** 1a and 1b both done 2026-08-06 (69 Actions registered, `GAP_MAP.md` v1.0).
Goal 1's own literal done-when ("every currently UI-triggerable operation... has a
corresponding registered Action") isn't 100% met yet: media-asset creation via
paste/drag-drop still bypasses the Action layer, deliberately — see `GAP_MAP.md`'s
"What's left" section. That's a real, separate gap needing a design decision (what does
an agent hand over instead of a browser `File`?), deferred to Goal 2a's headless
invocation contract rather than closed superficially here. Not blocking: Goal 2's
"invoke Actions against a project" scope doesn't require importing new media to prove
out, and Goal 3's proof scenario can pick footage that's already in a project if needed.
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
**Status:** in-progress — 2a done, 2b's bootstrapping blocker (storage + WASM loading)
is resolved and verified; the actual Action-layer invocation path (handler extraction +
run.ts) is what's left — see below.
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
- [ ] **2b** Implement the headless shell as a new thin shell alongside `apps/web` and
  `apps/desktop`, calling the same Action layer Goal 1 completed — no parallel/duplicate
  logic — _advances:_ the Action-layer-stays-source-of-truth principle — _accept:_ the
  shell loads a real project, invokes at least one Action end-to-end, and persists the
  result correctly. **Started 2026-08-06, blocked partway through — see
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
  **Precision note**: the proof calls `editor.project.updateSettings(...)` (the manager
  method) directly, not through `invokeAction`— so what's proven is that `EditorCore` +
  persistence work headlessly at all, not yet that a registered Action does. 2b's actual
  accept criteria (invoke an Action end-to-end) still needs the handler-extraction work
  below before it's genuinely met.

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

## Sequencing
- **Now:** Goal 1 → Goal 2 → Goal 3, in that order (each unblocks the next). This whole
  cluster **is** VISION.md's "Now" milestone, decomposed.
- **Next:** Not yet decomposed into goals — opens only after Goal 3 passes. Per VISION.md:
  transcript-driven editing + auto-captioning (Descript/CapCut tier) on the same Action
  surface, then an MCP server once that surface is stable.
- **Later:** Node-based color grading (DaVinci-grade), Fairlight-grade audio mixing,
  template ecosystem, desktop parity, plugin system — directional, not yet scoped.

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

## Changelog
- 2026-08-06 v1 — Initial cascade from VISION.md v2: three goals decomposing the "Now"
  milestone (complete Action API → headless shell → proof gate), tethered to the core
  value prop and the risk named in VISION.md's v2 changelog.
