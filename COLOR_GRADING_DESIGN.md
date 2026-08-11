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
4. **Luma curve — closed 2026-08-06, scoped down from the original plan.** This gap-map
   originally assumed curves would need the LUT-texture-sampling pattern (a new kind of
   Rust work — texture binding, not just uniforms). Shipped a smaller, real alternative
   instead: a fixed 5-point Catmull-Rom spline (`luma_curve.wgsl`) evaluated analytically
   from uniform scalars, applied identically to R/G/B — needed zero new pipeline
   infrastructure, fits the existing `scalars`/`scalars_b` slots exactly. Arbitrary-
   point, texture-backed curves (DaVinci's actual curve editor) remain the larger,
   deferred version, stated explicitly in the shader's own doc comment. **Caught a real
   bug via the test, not shipped on assumption**: the first boundary-condition choice
   (duplicate the endpoint as the missing virtual control point) is a common Catmull-Rom
   convention but doesn't preserve linearity at the edges — an identity curve measurably
   distorted input near the boundaries. Traced by hand (shader output matched an
   independent Rust reference exactly, so the bug was the boundary-condition choice
   itself, not an implementation slip) and fixed with linear extrapolation for the
   virtual points instead. Same two-way verification as everything else (native-GPU
   pixel tests, including the one that caught the bug, + headless state-persistence
   proof, both pass now).
5. **LUT import/apply — closed 2026-08-06.** The item that actually introduces
   texture-backed effect passes to the pipeline for the first time (see the item-4
   correction above). Required a genuinely new shape of Rust work: LUT data flows
   through the existing `UniformValue::Vector` wire format (already arbitrary-length —
   no new FFI plumbing needed, confirmed by reading `rust/wasm/src/effects.rs`), but
   `pack_effect_uniforms`/`apply_with_encoder` had no mechanism to turn a large vector
   into a bound GPU texture. Since wgpu bakes bind-group layouts into a pipeline at
   creation time, the shared 2-bind-group `pipeline_layout` couldn't grow a 3rd group —
   built a separate `lut_pipeline_layout` + `lut-3d` shader/pipeline instead. The 3D LUT
   is stored as a tiled 2D texture (LUT_SIZE tiles of LUT_SIZE x LUT_SIZE, one tile per
   blue slice) sampled via `textureLoad` at nearest-neighbor integer coordinates —
   deliberately not trilinear, and deliberately not a native `wgpu::TextureDimension::D3`
   texture, both stated as scope choices in `lut_3d.wgsl`'s doc comment (nearest-neighbor
   avoids the cross-tile-bleed a filtering sampler would cause at tile edges; 2D-tiled
   avoids native-3D-texture-support questions). Fixed at a 9x9x9 grid (729 points), not
   the 17/33/65 sizes real `.cube` files ship at — the TS-side parser (`parse-cube.ts`)
   nearest-neighbor resamples any source size down to 9^3 to fit. Verified on native GPU:
   identity LUT leaves grid-aligned inputs unchanged, an independently-predicted R/B
   channel-swap LUT matches, intensity=0 fully bypasses the LUT, and malformed LUT
   data/unknown uniforms are rejected — plus a `bun:test` suite for the `.cube` parser
   itself (parsing, resampling, identity-preservation) and the usual headless
   state-persistence proof. LUT data is stored on the effect as a JSON-encoded flat
   array in a `text` param (`ParamValues` has no array/blob type) — a real, working v1,
   not the eventual LUT-library/file-reference architecture DaVinci parity would want
   long-term; noted explicitly in `lut.ts`'s doc comment so it isn't mistaken for final.
6. **Serial node graph — closed 2026-08-06.** Was free at the Action/state layer (the
   effects list's existing order, mutable via `reorder-clip-effects` from Goal 1) — but
   that claim had never actually been pixel-verified, only inferred from reading
   `apply_with_encoder`'s structure (each pass's output becomes the next pass's input).
   Reading code isn't verifying it: a copy-paste bug swapping input/output textures, or
   a texture-aliasing bug, would look identical on inspection and only show up by
   running it. Added `rust/crates/effects/tests/serial_chain.rs`: chains two
   non-commutative primary-wheels passes (multiplicative gain, additive offset) in both
   orders and confirms each ordering matches its own independently hand-computed
   expected value, *and* that the two orderings genuinely differ from each other — proof
   that pass 2 really consumes pass 1's output rather than the original source, and that
   order is respected end to end, not just "multiple passes can run." A second test
   chains three additive passes and confirms all three compose, not just the last one.
   The TS/Action side (`resolveEffectPassGroups` in `resolve.ts`: `effects.filter(...).
   map(...)`) wasn't given its own test — array `.map()` is provably order-preserving by
   inspection, unlike GPU pass chaining, which is exactly the kind of claim this session
   learned (via the luma-curve bug) not to trust without running it.
7. **Parallel node graph** — real new data-model work, recommend deferring past 4b's
   first pass.
8. **Scopes — histogram's core computation closed 2026-08-06; waveform/vectorscope/
   parade and all Action/UI wiring still open. Correction:** this item originally
   assumed pixel-correctness verification was blocked on `HEADLESS_DESIGN.md`'s
   browser/Bun rendering gap. That's wrong the same way item 4's original LUT-reuse
   assumption was wrong — v1.6 already established native `cargo test` has real, working
   GPU access independent of that gap, and scopes are read-only frame *analysis* (texture
   readback + binning), not a rendering-pipeline shader pass, so they need nothing from
   the blocked path at all. Added `effects::compute_histogram` (a plain readback + CPU
   binning function, not an `EffectPipeline` shader — there's nothing here a fragment
   shader does better) and verified it against a hand-counted expected histogram for a
   known image: exact per-bucket R/G/B/luma counts, plus asserting every *other* bucket
   is exactly zero (catches off-by-one indexing a "the right buckets are non-zero" check
   would miss). Handles both `Bgra8Unorm` (native) and `Rgba8Unorm` (WebGL fallback)
   texture formats via `context.texture_format()` rather than hardcoding channel order
   the way the ad hoc readback in every other test file does — getting this wrong on the
   GL fallback would silently swap R and B in every bucket. **Waveform's core computation
   also closed 2026-08-06** (`effects::compute_waveform`) — per-column luma histograms
   (one bucket-column per source pixel column, full horizontal resolution, no
   downsampling), reusing histogram.rs's luma weighting and format handling. Verified two
   ways: a 3-column test confirms columns don't leak into each other and that two
   distinct luma values in one column stay as two separate buckets rather than being
   merged, and a 4-pixel gradient test confirms each column gets its own distinct
   expected bucket. **Vectorscope also closed 2026-08-06** (`effects::compute_vectorscope`)
   — full-swing BT.601 Cb/Cr binned directly into a 256x256 grid (both axes already
   0..255, no extra scaling needed). Verified achromatic grays (R=G=B) land at the exact
   center bucket (128,128) at every brightness level, not just white/black — BT.601's
   Cb/Cr coefficients sum to exactly 0.5 on each side — and that pure red/green/blue land
   at three distinct, non-overlapping buckets matching an independently-written reference
   implementation. Computes the bucket grid only, not hue-angle target overlays
   (skin-tone line, color targets) a real vectorscope draws on top — stated scope.
   **Parade also closed 2026-08-06** (`effects::compute_parade`) — structurally
   `waveform.rs` generalized from one collapsed luma channel to three independent R/G/B
   channels. Verified with a color (10,200,90) chosen specifically so cross-channel
   leakage would be visible: each channel spikes only at its own value, with explicit
   assertions the other two channels are zero at that value. **All four scope types' core
   computations are now closed.** Action/UI wiring in progress: extracted each
   `compute_*` function into a GPU-independent `compute_*_from_pixels(pixels, width,
   height, is_bgra)` (behavior-preserving refactor, all 9 existing tests re-verified
   unchanged) so it can bind directly to already-in-hand tightly-packed RGBA8 bytes
   (e.g. canvas `ImageData.data`) with zero WebGPU/rendering dependency — unlike the
   effects shader pipeline, which needs a live `wgpu::Texture` to run at all. This makes
   scopes the first grading-arc capability genuinely pixel-verifiable through the real
   JS/WASM bridge in this session's headless Bun environment (`rust/wasm/src/
   scopes.rs`'s `computeHistogram`/`computeWaveform`/`computeVectorscope`/
   `computeParade`, verified end to end via `headless/scopes-wasm-proof.ts` and a thin
   `@/services/color-scope/service.ts` dispatch wrapper mirroring this codebase's own
   `waveformCache` precedent for "queryable derived analysis data, not a registered
   Action").

   **Real packaging gap surfaced doing this, not a code bug:** `apps/web` pins
   `opencut-wasm` to upstream's published `^0.2.10`, not this fork's local Rust build —
   already known from earlier in the session ("local Rust changes don't automatically
   propagate"), but this is the first time it had visible consequences: the new WASM
   exports aren't reachable without a manual `bun link`, and leaving that link in place
   broke `bun test` for unrelated files (bare Bun can't load a wasm-pack "bundler"-target
   `.wasm` without the same preload shim `headless/wasm-bindgen-bun-plugin.ts` exists
   for). Surfaced to the user via `AskUserQuestion` rather than deciding silently, since
   it's a real build-pipeline tradeoff; **user chose to publish this fork's own scoped
   package** (`@connorodea/opencut-wasm`). `rust/wasm/Cargo.toml` bumped to 0.3.0,
   `repository` repointed at this fork, package built and ready — publish itself blocked
   on npm auth in this environment (asked the user to run `npm login`). The TS service
   layer and its 2 headless proofs are written and verified via the documented local-link
   dev flow, but deliberately not committed yet — they'd fail typecheck by default until
   the publish + repin lands, and this session doesn't leave new tsc errors in the
   default checkout state.

9. **Exposure + white balance/tint — missed by this gap-map's original v1.0 audit,
   caught and corrected 2026-08-06.** The Goal 4 northstar-cascade instruction's original
   Phase 1 scope explicitly included "basic RAW exposure/WB/temp-tint controls" alongside
   wheels/curves/qualifiers/node-graph/LUTs — this table (data-model design, above) and
   the gap-map's items 1-8 simply never listed it, and neither did `GOALS.md`'s Goal 4
   "Done when" clause. Not a deliberate scope-out with reasoning recorded (the way, say,
   per-channel RGB color-balance wheels or arbitrary-point curves were) — a genuine miss,
   the same class of mistake `GOALS.md` itself warns 4b not to repeat (Goal 1's original
   v0.1 gap-map missed 3 methods). Found while blocked on the npm-publish step above and
   re-reading this doc end to end rather than idling.

   Scoped down the same way every other primitive here was: **not** DaVinci's actual RAW
   page (that operates on true camera sensor RAW data — BRAW/RED RAW decode, which this
   codebase has no decode-level support for anywhere, an architecturally much bigger gap
   than a color-grading shader). Built as two ordinary `EffectDefinition`s, same shape as
   primary wheels: `exposure` (single EV-stops scalar, `output = input * 2^ev`) and
   `white-balance` (temperature + tint as relative correction sliders, not an absolute
   Kelvin/blackbody-radiation conversion — DaVinci's own WB temp slider is also a
   relative correction, not a from-scratch colorimetric computation). Coefficients for
   the temp/tint channel scaling are a defensible, clean approximation, explicitly not a
   verified match to DaVinci's proprietary math — same honesty standard as log wheels'
   own doc comment.
10. **RGB curves — a second gap-map correction, caught and closed 2026-08-06.** This
    doc's own data-model design table (above) planned `"rgb-curves"` and `"luma-curve"`
    as two separate `EffectDefinition`s, but only luma-curve was ever built — which
    applies one shared curve identically to all three channels, not the independent
    per-channel curves DaVinci's RGB Curves panel gives. Silently dropped when item 4
    closed, never recorded as a deliberate scope-out. Found the same way as item 9: still
    blocked on the scopes npm-publish step, re-reading this doc rather than idling.

    Needed 15 independent scalar uniforms (5 control points x 3 channels) — more than
    `scalars`/`scalars_b`'s 8 free floats. Extended `EffectUniformBuffer` again with
    `scalars_c`/`scalars_d`, verified backward-compatible by re-running
    `cargo test --workspace` *before* writing the new shader, not assumed safe.
    `rgb_curves.wgsl` reuses the exact same `catmull_rom`/`eval_curve` math and
    boundary-extrapolation fix already proven in `luma_curve.wgsl`, evaluated three
    times with independent control points instead of once shared. The critical test
    isn't "the curve math is right" (already proven identical for luma-curve) — it's
    that changing only red's curve leaves green/blue provably untouched, verified on
    native GPU, plus all three channels independently matching their own hand-computed
    reference with genuinely different deltas (ruling out a shared-curve regression, the
    luma-curve bug's own failure class). TS side: 15 number params, headless proof sets
    15 genuinely distinct values (not one repeated) so a channel-collapsing bug at the
    Action/state layer would show up there too, not just in the shader.
11. **Luma qualifier — a third gap-map correction, closed 2026-08-06 via reuse, not new
    GPU work.** `GOALS.md`'s Done-when clause says "HSL/RGB/luma qualifiers" — HSL was
    built, RGB was explicitly deferred with reasoning in item 3's own closure note, but
    luma qualifier was never mentioned as either built or deferred anywhere. Found the
    same way as items 9-10: still blocked on the scopes npm-publish step, systematically
    checking Phase 1's original scope against what actually shipped rather than assuming
    "done" once the obvious items were closed.

    Unlike 9 and 10, this needed **zero new Rust code**. Reading `hsl_qualifier.wgsl`'s
    own `hue_membership`/`range_membership` formulas shows `hue_width=1.0` and
    `sat_width=1.0` make both return 1.0 unconditionally — the widest possible circular
    hue distance (0.5) and the full 0..1 saturation range both equal `width * 0.5`
    exactly at `width=1.0`, so `dist <= inner` always holds and `smoothstep` never
    triggers. `hsl-qualifier` already provides luma-only qualification as a special case.
    Same shape as gap-map item 6 (serial node graph): don't duplicate a shader, verify
    the reuse claim on real pixels rather than trust the derived math alone, and close
    the gap with a test + a thin TS convenience layer instead of new GPU work.
    `rust/crates/effects/tests/luma_qualifier_equivalence.rs` verifies on native GPU:
    matching luma passes through full-color regardless of hue (pure red/green/blue at
    the same HSL lightness all pass identically), non-matching luma dims regardless of
    hue, and two very different hues at the same luma get pixel-identical treatment.
    TS side: a `"luma-qualifier"` `EffectDefinition` (3 focused params) rendering passes
    against `hsl-qualifier`'s existing shader ID with the hue/sat gates hardcoded open —
    the discoverable surface for the common case, while the full hue/sat/lum control set
    stays directly available via `"hsl-qualifier"`. Verified via the standard headless
    state-persistence proof.

    **Believed closed now** — the systematic re-check against `DAVINCI_PARITY.md`'s
    Phase 1 "In scope" line (primary+log wheels, RGB/luma curves, HSL/RGB/luma
    qualifiers, serial+parallel node graph, LUT import/apply, exposure/WB/tint, four
    scopes) that surfaced items 9-11 has now been run item-by-item against everything
    that's shipped; no further gaps found as of this pass.

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
