# OpenCut Fork (working name) — Vision

> One-sentence north star: the video editor where every capability a human can click is also a command an AI agent can call — so DaVinci-grade grading, FCP-grade editing, CapCut-grade social speed, and Descript-grade text editing all become programmable from one core.

_Last updated: 2026-08-06 · Version: v2_

## What it is
An open-source video editor, forked-in-place from `opencut-classic` (MIT), that combines
professional NLE depth (DaVinci Resolve-style node-based color grading and Fairlight-style
audio mixing, Final Cut Pro-style magnetic timeline and performance) with fast social
editing (CapCut-style templates, auto-captions, effects) and language-driven editing
(Descript-style transcript-as-timeline, AI voice/overdub, screen recording). It preserves
~90% of OpenCut classic's existing core (timeline, media pipeline, effects, export) as the
baseline and adds the missing capability tiers on top.

## Who it's for
Both audiences from day one, by decision (not left open):
- **Human editors** spanning pro colorists/editors down to social creators who today
  bounce between DaVinci, FCP, CapCut, and Descript because no single tool covers all four.
- **AI agents and agentic pipelines** that need to produce or modify video programmatically
  — batch content generation, automated social remixing, script-to-cut pipelines — without
  being limited to ffmpeg-level primitives or a GUI with automation bolted on as an
  afterthought. This includes powering your own automation pipelines (Reelwire-style
  faceless generation, Cutroom-style batch processing) as a proving ground, while the
  project itself ships as a public MIT open-source editor — the same Action API serves
  both; there's no fork in the architecture between "internal engine" and "public product."

## The problem
Every existing editor treats automation as secondary: a macro recorder, a chat sidebar, an
export script. The actual editing logic — cut placement, grading, mixing, captioning — lives
inside UI event handlers that only a human clicking a mouse can reach. Teams that want AI to
actually produce finished edits are stuck writing brittle ffmpeg pipelines or paying for
closed APIs with a fraction of a real NLE's capability. Meanwhile OpenCut classic already has
the right bones for this — a real Actions system (`invokeAction`) decoupling triggers from
handlers, and business logic migrating into a UI-agnostic Rust core — but nothing yet exposes
that surface to anything other than the React app.

## Core value proposition
**The UI is just one client of the control surface.** Every editing capability — from "trim
this clip" to "apply this LUT" to "generate captions" — is backed by the same versioned,
typed Action API that the web app, the desktop app, and an AI agent all call identically.
Classic's existing `src/lib/actions` system is the literal seed of this; the work is
completing it into a full, documented, headlessly-invokable API rather than inventing
something new.

To be explicit: **matching DaVinci/FCP/CapCut/Descript's feature checklist is not the
differentiator on its own** — that's parity, not value. None of those four expose a
complete, agent-native control surface over their editing capability; that's the actual
gap this fills. Feature depth (grading, mixing, transcript editing) matters because it
gives the control surface something worth controlling — not because matching the
incumbents' checklists is the goal in itself.

## Principles / non-negotiables
- Every capability ships as an invokable Action first, UI affordance second. No editing
  behavior may exist only inside a component event handler.
- The Rust core stays the single source of truth for logic (per the existing `AGENTS.md`
  rule); agent control calls into the same core the UI does — never a parallel shadow API.
- Preserve ~90% of classic's current feature surface and data model rather than a
  clean-room rewrite. Extend, don't replace, unless a module is explicitly superseded.
- Stay MIT-licensed and open source, matching upstream.
- Augment, don't replace, the expert: pro grading/mixing/editing stay fully hands-on
  capable. Agent control extends reach (batch, automation, social-scale output) — it isn't
  a mandate to automate away manual craft.
- Non-goal (for now): a plugin marketplace, mobile app, or matching the rewrite's Rust-core
  Editor API 1:1 — classic's TS-first architecture is the near-term base.

## Main workflows
1. **Pro NLE editing** (DaVinci/FCP-grade) — multi-track magnetic timeline, node-based color
   grading, Fairlight-style audio mixing, keyframed effects and masks.
2. **Fast social editing** (CapCut-grade) — templates, one-click auto-captions, trending
   effects, vertical/short-form export presets.
3. **Text-driven editing** (Descript-grade) — transcript-as-timeline, cut-by-editing-text,
   AI voice/overdub, screen-recording ingest.
4. **Agentic/headless editing** — an agent receives a brief, script, or raw footage and
   produces a finished cut by calling the same Action API a human uses, no GUI required,
   fully scriptable and replayable.
5. **Hybrid human+agent editing** — a human edits live while an agent assists in the same
   session (rough-cut generation, auto-caption pass, color-match suggestions) through the
   identical action layer, just a different caller.

## System modules
- **Rust core** (`rust/crates`: gpu, bridge, compositor, time, effects, masks) — existing,
  platform-agnostic logic layer.
- **Action / Command Layer** — the agent- and UI-facing control surface; evolves from
  classic's existing `src/lib/actions` into a complete, versioned API.
- **Agent Control API** — headless/programmatic access to the Action layer (CLI and/or
  local server first; MCP server once the surface is stable) for external orchestration.
- **Timeline & Project Model** — magnetic multi-track timeline, keyframes, effects graph
  (existing, to be hardened as the agent-replayable source of truth).
- **Color/Grading Engine** — node-based grading, DaVinci-grade (net-new).
- **Audio Mixing Engine** — Fairlight-style mixing, ducking, leveling (net-new).
- **Transcript/Text Engine** — ASR ingest, transcript-as-timeline, text-edit-to-cut mapping,
  Descript-grade (net-new).
- **Templates & Social Export** — CapCut-grade templates, caption styles, aspect-ratio and
  platform export presets (net-new).
- **Voice/Generative Layer** — AI voice, overdub, screen recording ingest; hook point for
  generative media providers (net-new).
- **Shells** — `apps/web` (Next.js), `apps/desktop` (GPUI), plus a new headless/CLI shell
  that exists purely for agent-only operation.

## Data model implications
Every timeline mutation must already be representable as a discrete, replayable Action
(classic mostly does this today) with typed, serializable args — that's what makes both
headless batch operation and agent control possible. Project state should be reconstructable
by replaying its action log, not just stored as a mutable blob, so agent-driven edits are
deterministic, auditable, and diffable the same way a human's edit history would be.

## UI/UX implications
The UI must never be the only path to a capability — every panel/tool is a view onto an
Action, not the owner of one. The interface needs a visible "activity" surface (extending
existing history/undo UI) so agent-driven edits are transparent and inspectable, not
invisible background mutation — a human should be able to see exactly what an agent did and
replay or reverse it the same way they would their own edit.

## MVP boundary
**In:** Fork classic, preserve its current core (timeline, media, effects/keyframes,
export). Hardened, fully-documented Action API covering every existing UI-triggerable
operation. Headless invocation (CLI or local server) sufficient for a script to produce a
real, finished edit end-to-end with zero GUI involvement.

**Out (for now):** Node-based color grading engine, Fairlight-grade audio mixing,
transcript-driven editing, template/social export layer, MCP server, desktop (GPUI) parity,
mobile, plugin marketplace.

## Roadmap (vision → milestones)
**Biggest named risk:** sequencing the Action API before feature depth is correct for
de-risking the differentiator, but it creates a real failure mode — stalling permanently at
"solid automation API over a thin feature set" and never reaching the capability depth that
makes the DaVinci/FCP/CapCut/Descript comparison mean anything. Mitigation: the gate below
is non-negotiable, not a suggestion.

- **Now:** Complete and document the Action API; ship headless/CLI control as an MVP on top
  of classic's existing architecture, so agent-driven end-to-end edits are provably possible.
- **Gate before Next:** Prove the Action API is valuable, not just complete — a real
  scripted/agentic edit produced end-to-end, using it, that a human would actually want. If
  that proof doesn't land, the problem is feature depth, not API completeness, and Next
  should be reprioritized accordingly rather than proceeding on autopilot.
- **Next:** Layer in transcript-driven editing and auto-captioning (Descript/CapCut tier) on
  the same Action surface; ship an MCP server on top of the now-stable Action API.
- **Later:** Node-based color grading (DaVinci-grade) and Fairlight-grade audio mixing;
  template ecosystem and social export presets; desktop parity; plugin system.

## How to decompose this
Once this direction is confirmed, run `/todoist` from this project directory to create its
tracker (it auto-resolves a project per working directory) and break the "Now" milestone
into goals → sub-goals: (1) audit + gap-map every current UI action against the Action API,
(2) close gaps so the API is complete, (3) build the headless invocation shell, (4) prove it
end-to-end with a real scripted edit. Each subsequent milestone (transcript editing, MCP,
grading, audio) becomes its own goal once "Now" is done.

## Open questions
- **Product identity**: still using the placeholder directory name `opencut-fork` — no name
  or branding decided yet.
- **Agent transport**: MCP server vs. a plain REST/CLI API as the primary agent-control
  surface — MCP fits Claude/agent tooling directly, a plain API is more portable across
  other automation stacks. Possibly both, with MCP as a thin wrapper over the CLI/API.
- **Rust core boundary**: should agent control call into the Rust core directly, or stay at
  the TypeScript Action layer for now and let the Rust migration (already underway per
  `AGENTS.md`) absorb it incrementally?

## Changelog
- 2026-08-06 v1 — Initial vision authored: fork-in-place from opencut-classic, combine
  DaVinci/FCP/CapCut/Descript capability tiers, agent-control Action API as the primary
  differentiator.
- 2026-08-06 v2 — Ran the `layers` skill's `vision-check` stack (L-V1, L-V5, L-V6, L-V10)
  against v1. Resolved the audience open question as "both, same architecture" (internal
  engine + public OSS product, no fork between them). Sharpened core value prop: feature
  parity with the four named incumbents is not the differentiator, agent-native control is.
  Added an explicit named risk (stalling at automation-API-complete/feature-thin) with a
  non-negotiable proof gate between Now and Next. Product name and agent-transport
  (MCP vs REST/CLI) remain open.
