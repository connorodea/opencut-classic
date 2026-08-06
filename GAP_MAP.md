# OpenCut Fork — Action API Gap Map (Goal 1a)

> Source-grounded audit: registered Actions (`apps/web/src/actions/definitions.ts`) vs.
> the app's actual mutating capability surface (`Command` classes in `apps/web/src/commands/`,
> invoked through `EditorCore`'s three managers — `TimelineManager`, `ScenesManager`,
> `ProjectManager` — via a shared `CommandManager` with undo/redo).

_Last updated: 2026-08-06 · v0.6_

## Architecture found

- **Actions** (`apps/web/src/actions/definitions.ts`): 30 registered entries, each with a
  description/category/optional args, invoked via `invokeAction()`. Implemented in
  `apps/web/src/actions/use-editor-actions.ts`, which calls `editor.timeline.*` /
  `editor.selection.*` facade methods — it does **not** import `apps/web/src/commands/`
  directly.
- **Commands** (`apps/web/src/commands/`): 53 files implementing `Command` subclasses
  (`execute`/`undo`/`redo`), covering `media/`, `project/`, `scene/`, and
  `timeline/{element,track,clipboard}/{effects,keyframes,masks}`. Dispatched through a
  single `CommandManager` (`apps/web/src/core/managers/commands.ts`) that owns the
  undo/redo history stack.
- **Managers** (`apps/web/src/core/managers/{timeline,scenes,project}-manager.ts`): the
  real capability surface. Each public mutating method wraps one or more Commands and is
  what UI components and (currently, partially) Actions call. This is the closest
  equivalent to Deriv8ion's `modules/shortcut/config.cljs` audit surface — the full list
  of "things that can happen to a project."

**Key finding: the Action layer and the Command/Manager layer are two separate systems
that only partially overlap.** Of the manager methods enumerated below, only ~12 have any
Action-layer entry point at all (directly or via a `switch` branch inside a broader
action like `delete-selected`). Everything else is currently reachable only from inside a
UI component/controller that calls the manager method directly — meaning an AI agent
using only the registered Actions cannot currently do any of it.

## Confirmed gaps (manager method → zero corresponding Action)

Ranked by value (most consequential capability gap first).

### Tier 1 — critical (core value prop unusable without these)
**Status: closed.** All five now have a registered Action (`export-project`,
`create-project`, `load-project`, `save-project`, `update-project-settings`), each a
thin fire-and-forget wrapper matching the existing action-handler signature; state
(new project id, active project, settings) is observed via `editor.project.getActive()`
after the action resolves, same pattern as `export-project`'s `getExportState()`.

| Manager method | What it does | Why it matters | Closed by |
|---|---|---|---|
| `ProjectManager.export` | Render/export the final video | **The single terminal operation of a video editor.** An agent cannot currently produce an actual output file through the Action API — everything else is edit-time-only. | `export-project` |
| `ProjectManager.createNewProject` | Start a new project | An agent can't even begin a project headlessly. | `create-project` |
| `ProjectManager.loadProject` | Open an existing project | Same — no entry point into an existing project. | `load-project` |
| `ProjectManager.saveCurrentProject` | Persist current state | No way to durably save agent-driven edits. | `save-project` |
| `ProjectManager.updateSettings` | Project-level settings (fps, resolution, etc.) | No way to configure a project's output parameters. | `update-project-settings` |

### Tier 2 — whole subsystems with zero coverage
| Subsystem | Manager methods with no Action | Impact |
|---|---|---|
| **Effects** — **closed** | ~~`addClipEffect`, `removeClipEffect`, `toggleClipEffect`, `reorderClipEffects`, `updateClipEffectParams`~~ → `add-clip-effect`, `remove-clip-effect`, `toggle-clip-effect`, `reorder-clip-effects`, `update-clip-effect-params` | Agent can now apply, adjust, reorder, toggle, and remove clip effects — the DaVinci/CapCut-tier capability named in VISION.md. |
| **Keyframes/animation** — **closed** | ~~`upsertKeyframes`, `retimeKeyframe`, `updateKeyframeCurves`, `upsertEffectParamKeyframe`, `removeEffectParamKeyframe`~~ → `upsert-keyframe`, `retime-keyframe`, `update-keyframe-curve`, `upsert-effect-param-keyframe`, `remove-effect-param-keyframe` | Agent can now create, retime, and curve-edit element and effect-param keyframes. (`removeKeyframes` was already reachable via `delete-selected`'s keyframe-selection branch — unchanged.) |
| **Masks** — **closed** | ~~`insertFreeformPathMaskPoint`, `removeMask`, `toggleMaskInverted`~~ → `insert-freeform-path-mask-point`, `remove-mask`, `toggle-mask-inverted` | Agent can now insert mask points, remove a mask, and invert a mask. (`deleteFreeformPathMaskPoints` was already reachable via `delete-selected`'s mask-point-selection branch — unchanged.) |
| **Scenes (CRUD)** — **closed** | ~~`createScene`, `deleteScene`, `renameScene`, `switchToScene`~~ → `create-scene`, `delete-scene`, `rename-scene`, `switch-scene` | Scenes are the project's structural unit; agent can now create, remove, rename, and navigate between them. |
| **Bookmarks (remaining)** — **closed** | ~~`removeBookmark`, `updateBookmark`, `moveBookmark`~~ → `remove-bookmark`, `update-bookmark`, `move-bookmark` | **Correction to this gap-map**: these three `ScenesManager` methods were found during the original v0.1 audit but omitted from the written table by mistake — only `toggleBookmark` made it in. Caught and closed while doing the adjacent scene-CRUD work, since they live in the same file. |
| **Tracks** | `addTrack`, `removeTrack`, `toggleTrackMute`, `toggleTrackVisibility` | Track-level operations have zero Action coverage — `toggle-elements-muted-selected` / `toggle-elements-visibility-selected` only cover selected *elements*, not tracks themselves. |
| **Project lifecycle (non-active)** | `renameProject`, `duplicateProjects`, `deleteProjects`, `updateThumbnail` | Agent has no way to manage the project library itself, only edit within an already-open one. |

### Tier 3 — element-level gaps
| Manager method | What it does | Why it matters |
|---|---|---|
| `insertElement` | Insert a new element onto the timeline | No generic "add this clip/element" action; only removal (`remove-media-asset(s)`) and drag/drop-driven insertion exist. |
| `updateElementTrim` | Trim a clip's in/out point | Currently mouse-drag only. |
| `updateElementRetime` | Change a clip's playback speed/retiming | Currently mouse-drag only. |
| `moveElements` | Move element(s) to a new track/time | Currently drag-only; no programmatic reposition. |
| `updateElements` | Generic element property update | No batch/generic update path exposed. |
| `toggleSourceAudioSeparation` | Extract/recover source audio | **Already has an Action** (`toggle-source-audio`) — not a gap, confirms the pattern works when applied. |

## What's already covered (confirms the pattern, no action needed)
`toggle-play`, `seek-forward/backward`, `frame-step-forward/backward`, `jump-forward/backward`,
`goto-start/end`, `stop-playback` (playback controls — no manager-method equivalent needed,
these are UI/player-local state), `split`/`split-left`/`split-right` (→ `splitElements`),
`delete-selected` (→ `deleteElements`, plus its mask-point/keyframe branches),
`copy-selected`/`paste-copied` (clipboard), `toggle-snapping`, `toggle-ripple-editing`,
`select-all`/`deselect-all`, `cancel-interaction`, `duplicate-selected` (→
`duplicateElements`), `toggle-elements-muted-selected`/`toggle-elements-visibility-selected`
(→ `toggleElementsVisibility`, element-scoped), `toggle-bookmark` (→ scene `toggleBookmark`),
`undo`/`redo` (→ `CommandManager.undo`/`redo`), `remove-media-asset(s)`,
`toggle-source-audio`.

## Direct-bypass call sites (UI/controller code instantiating Commands or calling manager
methods without going through `invokeAction` at all — separate from "no Action exists")
- `apps/web/src/media/use-paste-media.ts`
- `apps/web/src/subtitles/insert.ts`
- `apps/web/src/timeline/controllers/drag-drop-controller.ts`

These aren't necessarily wrong (drag/drop and paste are inherently direct-manipulation
UI, not natural "invoke an Action with args" flows even after gap closure) but each
should get an explicit call in 1b: either it stays direct-manipulation-only by design, or
it gets a parallel Action for agent access to the same outcome.

## Scope note
This audit covers the **editing/project capability surface** (managers + commands) since
that is where 100% of the Command-pattern (undo-able) mutations live. It does not yet
cover pure-UI-state operations with no Command backing (panel layout, zoom level, viewport
pan) — per VISION.md's MVP boundary these are lower value for agent control and are
deliberately out of scope for Goal 1 unless a Goal 3 proof scenario surfaces a real need.

## Gap count
54 registered Actions (30 original + 4 closing Tier 1 + 5 closing effects + 5 closing
keyframes/animation + 3 closing masks + 7 closing scene CRUD/bookmarks). ~41
manager-level mutating methods identified (38 original count + 3 bookmark methods found
missing from the v0.1 write-up, corrected in v0.6). ~37 now have Action coverage. **~4
methods still have zero Action coverage** — Tier 2's tracks/project-library-lifecycle
subsystems, plus all of Tier 3.

## Next (1b)
Tier 1 closed. Tier 2's effects, keyframes/animation, masks, and scene CRUD subsystems
closed. Continue through Tier 2's remaining subsystems (tracks, project-library
lifecycle), then Tier 3 (element trim/retime/move).
