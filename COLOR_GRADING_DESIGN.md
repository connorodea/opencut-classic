# Goal 4a — Color Grading Foundation: Design + Gap-Map

> Audits `DAVINCI_PARITY.md`'s Phase 1 scope against the actual codebase — both the
> `apps/web` TypeScript Action layer and the `rust/` engine that renders it — and
> designs where grade state lives. Same rigor `GAP_MAP.md` applied to Goal 1: source-
> grounded, not assumed. Written per `GOALS.md` Goal 4a's accept criteria.

_2026-08-06 · v1.0_

## Architecture found

### The existing pattern this should extend, not duplicate

`apps/web/src/effects/` already implements exactly the shape Phase 1 needs for
primary/log wheels and curves: an `Effect` (`{id, type, params: ParamValues, enabled}`)
attached to a clip, an `EffectDefinition` (`{type, name, keywords, params:
ParamDefinition[], renderer}`) registered via `registerDefaultEffects()` at
`EditorCore` construction, and Actions already closed in Goal 1b —
`add-clip-effect`/`remove-clip-effect`/`toggle-clip-effect`/`reorder-clip-effects`/
`update-clip-effect-params` — that are fully generic over effect `type`. **A primary-
wheels grade is, structurally, just a new `EffectDefinition`.** No new Action types are
needed for wheels, log wheels, or curves — they're new entries in the existing effects
registry, using Actions that already exist and are already verified headlessly.

Effects on a clip are an **ordered list**, not a graph (`reorder-clip-effects` moves a
single effect's position in that list). This turns out to matter for the node-graph
requirement — see below.

### The part that isn't just TypeScript: `rust/`

This repo contains the actual rendering engine — a Cargo workspace at the repo root
(`rust/crates/{time,bridge,effects,gpu,masks,compositor}`, `rust/wasm`) that compiles to
the `opencut-wasm` npm package `apps/web` depends on. **This was not obvious without
checking** — `apps/web/package.json` pins `"opencut-wasm": "^0.2.10"` (a real semver
range against the published registry, not a workspace link), so the installed
`node_modules` copy is a published snapshot, not automatically in sync with local `rust/`
changes.

Each effect's actual pixel math lives in `rust/crates/effects/src/`:
`pipeline.rs` (330 lines) builds one `wgpu::RenderPipeline` per shader at
`EffectPipeline::new()` construction time, from a **literal WGSL file**
(`shaders/gaussian_blur.wgsl`, loaded via `include_str!`). Today there is exactly one:
Gaussian blur.

**The real constraint, found by reading `pack_effect_uniforms`, not assumed:** the
uniform-packing function is *not* shader-aware. It unconditionally expects exactly three
uniform names — `u_sigma`, `u_step`, `u_direction` — and packs them into a fixed
`EffectUniformBuffer { resolution: [f32;2], direction: [f32;2], scalars: [f32;4] }`.
Any other uniform name is rejected with `UnsupportedUniform`, regardless of which shader
is being invoked. **Adding a genuinely different effect (lift/gamma/gain/offset needs
different uniform names/shapes entirely) requires generalizing this function to be
shader-aware — not just adding a WGSL file and a HashMap entry.** This is the one
finding in this document most likely to be missed by a design pass that only looked at
`apps/web`.

### Confirmed buildable, not assumed from the README

`wasm-pack` wasn't installed; installed it (`brew install wasm-pack`) and ran the repo's
own documented build (`bun run build:wasm` → `wasm-pack build rust/wasm --target
bundler --out-dir pkg`) from a clean state — succeeded in ~90s, producing a real
`rust/wasm/pkg`. `cargo build --workspace` also succeeds cleanly. The Rust→WASM→
`apps/web` pipeline is a real, working path for this work, not a theoretical one.

### A genuinely useful side-finding for rendering verification

While checking whether new grading shaders could be *tested* at all, found that
`GpuContext::new()` — the thing that fails with "No WebGPU adapter is available" under
Bun/browser (`HEADLESS_DESIGN.md` v1.5) — is `cfg`-gated, and the **native** (non-
wasm32) build path uses `wgpu` against Metal directly, completely separate from the
browser-WebGPU limitation. A real test (`rust/crates/gpu/tests/adapter_availability.rs`)
confirms it: native GPU access works on this machine. See `HEADLESS_DESIGN.md` v1.6 for
the full account — relevant here because it means **new grading shaders can plausibly be
tested for real pixel correctness via a native `cargo test` against the actual GPU,
independent of whether the Bun/WASM rendering blocker ever gets resolved.** Worth
designing 4b's shader work with a native-test-first verification loop, not deferring all
visual correctness checking until the browser-side gap closes.

## Data model design

**Grade state lives as `Effect` entries**, reusing the existing per-clip ordered list —
no new top-level data structure needed for the state layer. Each Phase 1 grading
primitive becomes an `EffectDefinition`:

| Phase 1 item | `EffectDefinition.type` | New Action needed? | New Rust work needed? |
|---|---|---|---|
| Primary wheels (lift/gamma/gain/offset) | `"primary-wheels"` | No — `add-clip-effect`/`update-clip-effect-params` | Yes: new WGSL shader (4× vec3 or packed equivalent) + generalize `pack_effect_uniforms` to be shader-aware |
| Log wheels | `"log-wheels"` | No | Yes: separate shader (different math domain — log vs. linear), same uniform-generalization prerequisite |
| RGB/luma curves | `"rgb-curves"` / `"luma-curve"` | No | Yes: curves need a LUT-texture-based shader (control points → 1D lookup texture → per-pixel sample), a different shape of Rust work than a pure-uniform shader |
| HSL/RGB/luma qualifiers | `"hsl-qualifier"` etc. | No | Yes: a keying/masking shader — closer in kind to `rust/crates/masks` than `effects`; worth checking that crate before assuming it's new work |
| LUT import/apply (1D/3D `.cube`) | `"lut"` | No | Yes, and different in kind: needs a `.cube`-file parser (TS-side, per `DAVINCI_PARITY.md`'s `lut-cube` crate recommendation) *and* a 3D-texture-sampling shader — the shader here is closer to "generic" (any LUT) than the others, which are bespoke per grading primitive |

**Node graph is the one item that doesn't fit the "just a new Effect type" pattern.**
Effects are a flat ordered list, which already gives **serial** node-graph behavior for
free (`reorder-clip-effects` + apply-in-order *is* a serial node chain). **Parallel**
node graphs (mixing two branches, DaVinci's layer-node concept) have no existing analog
— that's real new data-model work (an actual graph structure, not a list), matching
`DAVINCI_PARITY.md`'s own recommendation to build on `petgraph` rather than force-fit
the existing list. **Recommend sequencing serial-only first** (ships with zero new
data-model work, just new effect types) and treating parallel-node support as its own
later sub-goal once the serial primitives prove the pattern — don't block wheels/curves/
qualifiers on solving the harder graph problem first.

**Scopes are not an `Effect`** — they're read-only analysis of rendered output
(waveform/vectorscope/histogram/parade), not something applied to a clip. They need
their own Action(s) (e.g. `read-scope-data`) that pull from the render pipeline's
output — which is exactly the piece blocked on `HEADLESS_DESIGN.md`'s rendering gap.
Building the scope *UI wiring* doesn't require rendering to work; verifying scopes
*read correct pixel data* does. Keep these as separate accept-criteria items in 4b, per
Goal 4's own status note about not letting a sub-goal quietly assume rendering works.

## Gap-map summary (for 4b)

Ranked by how much new Rust work each needs, cheapest first:

1. **Primary wheels — closed 2026-08-06.** Master lift/gamma/gain/offset shipped: WGSL
   shader (`rust/crates/effects/src/shaders/primary_wheels.wgsl`), `pack_effect_uniforms`
   generalized to be shader-aware (benefits every item below, done once here), TS
   `EffectDefinition` registered (no new Action types needed, as predicted). Verified
   two ways, neither standing in for the other: real pixel output on native GPU
   (`rust/crates/effects/tests/primary_wheels.rs`, matches the documented LGG formula
   within one 8-bit quantization step) and headless state persistence
   (`apps/web/headless/primary-wheels-proof.ts`, all four params survive save/reload).
   Scope note: master/luminance only — per-channel RGB color-balance wheels (the x/y
   position on DaVinci's actual wheel widget) deliberately deferred, stated in the
   shader's own doc comment.
2. **Log wheels — closed 2026-08-06.** Additive lift/gamma-offset/gain/offset shipped
   (`rust/crates/effects/src/shaders/log_wheels.wgsl`), deliberately different from
   primary-wheels' power-curve gamma — documented as a reasonable, industry-standard-
   adjacent model for log-encoded footage, not a verified match to DaVinci's proprietary
   log-mode math. Distinct uniform names (`u_gamma_offset`, not `u_gamma`) so the two
   shaders' params can't be silently cross-used — verified by a test asserting exactly
   that. Same two-way verification as primary wheels (native-GPU pixel test +
   headless state-persistence proof, both pass). Extracted a shared
   `grading-proof-helpers.ts` after this became the second copy of the same proof
   pattern — worth it now that more subsystems will repeat it.
3. **HSL qualifier — closed 2026-08-06.** Checked `rust/crates/masks` first as
   recommended — a dead end, confirmed not assumed: it's SDF/Jump-Flood-Algorithm
   geometric masks (box/circle/freeform paths), not color-based keying, genuinely
   different technique. Shipped DaVinci's qualifier "Highlight" preview mode instead
   (`hsl_qualifier.wgsl`): H/S/L range membership with soft edges, matching pixels stay
   full color, everything else dims to grayscale. Explicitly does NOT implement full
   secondary grading (gating a downstream chained correction by the qualifier's matte)
   — the effect pipeline applies passes sequentially with no matte hand-off between
   them; that's real, separate, deferred pipeline-architecture work, stated as such in
   the shader's own doc comment. Required extending the shared `EffectUniformBuffer`
   with a second `scalars_b: [f32;4]` slot (qualifiers need 7 values, more than the
   original 4-float `scalars` holds) — verified backward-compatible by re-running the
   wheels tests after the extension, not assumed safe from the WGSL spec alone. Same
   two-way verification as the wheels (native-GPU pixel tests + headless
   state-persistence proof, both pass). RGB-channel-based qualification (a distinct
   color model from HSL) remains a smaller, separate follow-up if needed later.
4. **RGB/luma curves** — needs the LUT-texture-sampling shader pattern, a genuinely new
   shape of Rust work (not just a new uniform set).
5. **LUT import/apply** — TS-side `.cube` parser (new, small) + a generic 3D-LUT-
   sampling shader (reusable across (2) and (4) if built as infrastructure rather than
   bespoke).
6. **Serial node graph** — free (already the effects list's behavior); document it as
   such rather than building anything new.
7. **Parallel node graph** — real new data-model work, recommend deferring past 4b's
   first pass.
8. **Scopes** — UI/Action wiring can proceed now; pixel-correctness verification is
   blocked on `HEADLESS_DESIGN.md`'s rendering gap (v1.5/v1.6) until resolved.

## What 4b should NOT assume

- That adding a grading effect is "just write TypeScript" — it's TypeScript *and* Rust,
  and the Rust side has a real architectural prerequisite (uniform-system
  generalization) before the first new shader beyond blur can exist at all.
- That headless verification of a new grading Action means the same thing it did for
  Goal 1/2's effects/keyframes/tracks work. Those verified *state* (does the value
  persist correctly). Grading's whole point is *visual* correctness — state-only
  verification proves the Action layer works, not that the grade looks right. Both
  matter; don't let one stand in for the other in a sub-goal's accept criteria.
- That the rendering gap is symmetric between "browser/Bun" and "everywhere." It isn't
  — native Rust tests can genuinely verify pixel output on this machine right now
  (`HEADLESS_DESIGN.md` v1.6), even though the Bun/browser headless path still can't.
