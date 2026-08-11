# OpenCut Fork — DaVinci Resolve Parity Roadmap

> Fleshes out VISION.md's "Later" milestone ("Node-based color grading (DaVinci-grade),
> Fairlight-grade audio mixing, template ecosystem") into a real, phased, FOSS-accelerated
> plan. This does not replace GOALS.md's active Goal 1–3 cascade (the "Now" milestone) —
> it's the detailed version of what "Later" actually contains, so it can be picked up
> goal-by-goal once Goal 3 passes, instead of re-researched from scratch then.

_2026-08-06 · v1.0_

## The non-negotiable framing

**Every feature added under this roadmap must also become a registered Action** —
typed args, documented, callable headlessly through `apps/web/headless/run.ts` — the
same discipline `GAP_MAP.md` established for the existing editor. Feature parity with
DaVinci is not the goal; it's the material the agent-control differentiator gets built
out of. A color-grading system a human can use but an agent can't drive isn't a partial
win, it's scope drift away from this fork's actual thesis (VISION.md). Each phase below
states its Action-surface requirement explicitly, not as an afterthought.

**Known blocking risk, carried over from HEADLESS_DESIGN.md v1.5:** real rendered
output (anything that needs to actually composite a frame — export, color preview,
VFX preview) requires genuine WebGPU, which neither Bun nor Node currently provide, and
even a real browser needs a GPU-capable host to get it. Phases 1 and 3 below both
produce Actions that mutate grading/compositing *state* correctly regardless of this —
but *verifying the rendered result looks right* is blocked on the same gap until it's
resolved by one of the three paths HEADLESS_DESIGN.md names (native WebGPU binding,
CPU/software rendering fallback in the Rust engine, or a real GPU-capable browser host).
Don't let a phase quietly assume this is solved.

---

## DaVinci Resolve — feature inventory (condensed reference)

Full detail researched from Blackmagic's own docs + community sources; this is the
working summary. See the phase tables below for what's in scope vs. explicitly deferred.

### Media (ingest/organize)
Media Storage browser · drag-drop import w/ folder hierarchy · Smart Bins (metadata-rule
auto-populate) · Power Bins (cross-project shared assets) · 200+ metadata fields ·
audio/video sync (timecode or waveform) · camera-card clone w/ checksum verification ·
LUT-at-ingest · proxy + optimized-media generation.

### Cut (fast-turnaround editing)
Dual timeline (overview + zoomed work area) · Source Tape (scroll all clips as one
strip) · Sync Bin (multicam grouping) · Smart Insert/Append/Place-on-Top/Close-Up/Ripple-
Overwrite · trim editor w/ magnified waveform · 100+ transitions · Boring Detector +
jump-cut detection (AI QC) · Quick Export w/ platform presets.

### Edit (primary NLE)
3-point editing, 7 edit modes (Insert/Overwrite/Replace/Fit-to-Fill/Place-on-Top/Append/
Ripple-Overwrite) · Roll/Ripple/Slip/Slide trim · stacked + tabbed timelines · timeline
curve editor · 100+ transitions, 80+ ResolveFX, OFX plugin support · Smooth Cut (optical-
flow) · 2D/3D titles, subtitle generator · full keyframing w/ Bezier curves · in-Edit
Fairlight controls (pan/level/6-band EQ) · speed ramps, optical-flow retiming, image
stabilization, lens correction, Dynamic Zoom · multicam (4–25+ angles) · subtitle
import/create/style/export · markers, annotations, bin/timeline locking (collaboration).

### Fusion (node-based VFX/compositing)
Node graph (MediaIn/Merge/unlimited chaining, macros, versioning) · true 3D workspace
(camera/light/material nodes, FBX/Alembic import) · Text+/Text3D · 2D point / planar /
3D camera tracking · Delta Keyer + clean-plate · Bezier/B-spline masks (trackable) ·
vector paint (clone mode, tracked strokes) · particle systems (emitter/renderer,
physics) · Spline/Keyframe editor, modifiers, expressions · volumetrics (fog/smoke/rain,
GPU) · deep-pixel EXR compositing · motion graphics templates · Python/Lua scripting.

### Color (grading/finishing — the signature differentiator)
Primary wheels (lift/gamma/gain/offset) + log wheels · custom curves (RGB/luma, hue-vs-
hue/sat/lum) · Color Warper · HSL/RGB/luma qualifiers · tracked Power Windows (circle/
curve/gradient/pen) · node graph (serial/parallel/layer, shared nodes) · scopes
(waveform/parade/vectorscope/histogram/CIE) · RAW processing · DaVinci Color Management +
DaVinci Wide Gamut + full ACES pipeline · 90+ ResolveFX · restoration tools (deflicker,
dirt/dust removal) · noise reduction (spatial+temporal) · RGB mixer · grade gallery/
versioning · wipe/split-screen review tools.

### Fairlight (professional audio)
Full mixer (channel strips, pan/pitch, 6-band EQ) · dynamics (expander/gate/compressor/
limiter) · 25+ FairlightFX, VST/AU plugin support · de-esser/de-hummer/noise reduction ·
multi-track recording, ADR toolset, Elastic Wave time-stretch · automatic ducking, Foley
tools · FlexBus routing (36-channel buses) · loudness metering (3 modes) · immersive
audio (Dolby Atmos/Auro-3D/MPEG-H, Studio-only).

### Deliver (render/export)
Render queue (batch, in/out range) · platform presets (YouTube/Vimeo/TikTok/Dropbox) ·
master presets (ProRes/H.264/H.265) · IMF/DCP (Studio) · EDL/AAF/XML(FCPXML) interchange
· AAF Round Trip · subtitle burn-in/sidecar export · Quick Export direct-publish ·
remote/offload rendering (Studio).

### Cross-cutting
Single shared project model across all pages · Project Manager (local/DB/cloud) ·
Blackmagic Cloud collaboration (locking, shared markers, chat, timeline comparison,
Studio-only) · proxy/optimized-media workflows · media management (consolidate/relink) ·
version control for edits/grades · markers/annotations · **Python/Lua scripting API**
(the closest existing analog to this fork's Action API — `Resolve → ProjectManager →
Project → MediaPool → Timeline → TimelineItem`, worth mining as a reference object
model) · control-surface hardware ecosystem · OFX (video) / VST/AU (audio) plugin
standards.

**Free vs. Studio-tier takeaway** (full detail from the research pass): the *entire*
node-based color pipeline, the full Fusion compositor, and the full Fairlight DAW are
already in Resolve's **free** tier — these are the legitimate replication targets.
Genuinely Studio/enterprise-gated and explicitly out of scope for early phases: Dolby
Atmos/immersive audio mastering, the AI Neural Engine suite (Magic Mask, Depth Map,
Voice Isolation, Music Remixer, Smart Reframe), DCP/IMF cinema mastering, multi-user
cloud collaboration with locking, stereoscopic 3D.

---

## Phased roadmap

Ordered by leverage: the biggest visible gap (color has zero presence today) first, the
thing blocking everything's *verification* (rendering) called out as a cross-cutting
risk rather than hidden in one phase, advanced/enterprise-tier features pushed last.

### Phase 1 — Color grading foundation · serves: core value prop (agent-drivable grading, DaVinci's signature capability)

**Done when:** a project's clips can be graded — primary wheels, curves, HSL qualifiers,
a serial node graph, LUT import/apply — entirely through registered Actions, with scopes
(waveform/vectorscope/histogram) available for verification once rendering is unblocked.

**In scope:** primary color wheels (lift/gamma/gain/offset) + log wheels, RGB/luma
curves, HSL/RGB/luma qualifiers, a basic serial+parallel node graph (skip shared/grouped
nodes — that's a Studio-tier refinement), LUT import/apply (1D/3D `.cube`), basic RAW
exposure/WB/temp-tint controls, the four core scopes.

**Explicitly deferred:** tracked Power Windows (needs the same tracking infra Phase 3's
Fusion work builds — sequence after it, don't duplicate), HDR grading tools, Face
Refinement/beauty tools, temporal noise reduction, DaVinci Wide Gamut / full ACES
management (start with a documented, simpler color-management stance; adopt ACES via
OCIO once the basics are proven), stereoscopic 3D, remote/collaborative grading.

**FOSS accelerants:**
| Use | Project | License | Notes |
|---|---|---|---|
| Color management / ACES pipeline | [OpenColorIO](https://github.com/AcademySoftwareFoundation/OpenColorIO) | 🟢 BSD-3-Clause | No official WASM build — needs a custom Emscripten build or a native-Rust reimplementation using it as spec |
| ACES config data | [OpenColorIO-Config-ACES](https://github.com/AcademySoftwareFoundation/OpenColorIO-Config-ACES) | 🟢 BSD-3-Clause | Bundle the generated `.ocio` config rather than hand-rolling ACES math |
| Color-space math (RGB↔HSL/Lab/XYZ, lift/gamma/gain primitives) | [palette](https://github.com/Ogeon/palette) | 🟢 MIT/Apache-2.0 | Pure Rust, WASM-friendly — vendor directly |
| GPU 3D-LUT application | three.js `LUTPass`/WGSL example | 🟢 MIT | Near-directly portable WGSL into a wgpu compositing pass |
| Scopes (waveform/vectorscope/histogram) | [OxiMedia/OxiScope](https://github.com/cool-japan/oximedia) | 🟢 Apache-2.0 | Pure Rust → WASM, closest tech-stack match; vendor if it holds up under evaluation |
| `.cube` LUT parsing | `lut-cube` (crates.io) | 🟡 verify license before vendoring | More feature-complete than the older `lut_parser` crate |
| Scope-rendering math (study only) | Natron, Movit, openfx-misc | 🔴 GPL — reference only | Study histogram-binning/waveform-accumulation approach, reimplement independently |

**Action-surface requirement:** every wheel/curve/qualifier/node-graph-op/LUT-apply
becomes its own Action (mirroring the granularity already established for effects —
`add-clip-effect`-style, not one giant opaque `set-grade` blob), so an agent can build a
grade incrementally and inspect state between steps, matching the existing pattern.

---

### Phase 2 — Audio foundation (Fairlight-lite) · serves: core value prop, "combine DaVinci/FCP/CapCut/Descript" pillar

**Done when:** a project's audio can be mixed — per-clip/track level, pan, a multi-band
EQ, basic dynamics (compressor/limiter/gate) — entirely through registered Actions,
using the browser's real Web Audio graph (no rendering blocker here — Web Audio works
headlessly-adjacent already via AudioContext, separate from the WebGPU compositor issue).

**In scope:** channel-strip mixer (level/pan per track), parametric EQ (start with 3–6
band, matching Fairlight's baseline), core dynamics (compressor, limiter, gate/expander),
waveform display, basic fade in/out, a small built-in effects set analogous to
FairlightFX's most-used tools (de-esser, noise reduction — even a simple gate-based
version).

**Explicitly deferred:** ADR toolset, Foley Sampler, FlexBus multi-bus routing beyond
basic track→master, immersive/Atmos audio (flatly Studio-tier, skip), VST/AU third-party
plugin hosting (real scope — revisit once WAM 2.0 integration is proven), Elastic Wave
pitch-preserving retime.

**FOSS accelerants:**
| Use | Project | License | Notes |
|---|---|---|---|
| Cross-platform audio I/O | [cpal](https://github.com/RustAudio/cpal) | 🟢 Apache-2.0 | Has an explicit Web Audio/AudioWorklet WASM backend |
| Playback/mixing convenience layer | [rodio](https://github.com/RustAudio/rodio) | 🟢 MIT/Apache-2.0 | Built on cpal |
| PCM sample/frame/resampling primitives | [dasp](https://github.com/RustAudio/dasp) | 🟢 MIT/Apache-2.0 | Foundational, `no_std`-friendly |
| Filter/EQ/dynamics DSP graph | [fundsp](https://github.com/SamiPerttu/fundsp) | 🟢 MIT/Apache-2.0 | Compile-time audio-graph DSL — candidate for implementing EQ/dynamics natively in Rust |
| DSP-as-WASM compiler (EQ/compressor/limiter math) | [Faust](https://github.com/grame-cncm/faust) + [faustwasm](https://github.com/grame-cncm/faustwasm) | 🟡 LGPL-2.1 | Use as an **offline build-time compiler** (own the emitted WASM artifact), not an embedded runtime |
| In-browser WASM-DSP plugin hosting | [Web Audio Modules 2.0](https://github.com/webaudiomodules) | 🟢 MIT | Solves parameter/UI/port declaration for WASM DSP in a Web Audio graph |
| Web Audio API access layer | [standardized-audio-context](https://github.com/chrisguttandin/standardized-audio-context) | 🟢 MIT | Dodges cross-browser AudioContext/AudioWorklet bugs |
| Transport/scheduling + effects-chain abstractions | [Tone.js](https://github.com/Tonejs/Tone.js) | 🟢 MIT | JS/TS layer, reusable directly |
| Track/clip/fade UI reference | [waveform-playlist](https://github.com/naomiaro/waveform-playlist) | 🟢 MIT | Closest existing product match to a browser multitrack audio editor |
| DSP-algorithm reference (study only) | Ardour, Calf Studio Gear, x42-plugins | 🔴 GPL/LGPL — reference only | Clean-room reimplement the math, don't port source |

**Action-surface requirement:** same granularity discipline — `set-track-level`,
`set-track-pan`, `add-audio-effect`, `update-audio-effect-params`, etc., mirroring the
existing `add-clip-effect`/`update-clip-effect-params` pattern from `GAP_MAP.md`.

---

### Phase 3 — Compositing/VFX foundation (Fusion-lite) · serves: core value prop, node-based agent-legible effects

**Done when:** a clip can have a node-based effects chain — keying, masking/roto, basic
tracking, particle-free 2D compositing — built entirely through registered Actions,
with the node graph itself represented as agent-inspectable state (not just a black-box
render).

**In scope:** a real node graph (build on `petgraph`, not a fixed filter stack — a DAG
an agent can construct/inspect matches this fork's whole thesis better than Resolve's
own linear-node UI convention), basic keying (chroma/luma key), Bezier mask shapes
(trackable once Phase 1's tracking-adjacent infra exists — sequence masks-with-tracking
after basic 2D point tracking, not before), 2D point tracking, simple text/title nodes.

**Explicitly deferred:** true 3D compositing (cameras/lights/materials/FBX import),
particle systems, volumetrics, deep-pixel EXR, planar/3D-camera tracking, vector paint,
Python/Lua scripting parity (this fork's Action API already *is* the scripting surface
— don't build a second one).

**FOSS accelerants:**
| Use | Project | License | Notes |
|---|---|---|---|
| Closest architectural match — same stack | [Graphite](https://github.com/GraphiteEditor/Graphite) | 🟢 Apache-2.0 | **Rust → WASM, wgpu compositing** — identical tech stack to this fork. Study (and consider porting) its `node-graph` crate: node trait design, graph execution/caching, editor↔engine IPC |
| Node-graph data structure | [petgraph](https://github.com/petgraph/petgraph) | 🟢 MIT/Apache-2.0 | DAG storage, topo-sort execution order, cycle detection |
| Node-editor UI (frontend) | [React Flow](https://github.com/xyflow/xyflow) or [Rete.js](https://github.com/retejs/rete) | 🟢 MIT | React Flow for pure UI; Rete if client-side graph execution is wanted too |
| Chroma-key WGSL shader reference | [greenscreen](https://github.com/rsamaium/greenscreen) | 🟢 MIT | Same Rust/wgpu/WGSL stack, very new/small — read and port the shader rather than depending on the crate wholesale |
| Plugin-interop target standard | [OpenFX (OFX) spec](https://github.com/AcademySoftwareFoundation/openfx) | 🟢 BSD-3-Clause | Spec itself is safe to implement a fresh Rust-native host against, even though most existing OFX plugins are GPL |
| CPU compositing correctness-oracle | [image-blend](https://github.com/seb105/image-blend-rs), [photon-rs](https://github.com/silvia-odwyer/photon) | 🟢 MIT/Apache-2.0 | Use to verify WGSL compute-shader blend-mode math against a known-good CPU reference |
| Node-compositing architecture (study only) | Natron, Blender compositor, Olive | 🔴 GPL — reference only | Natron: OFX hosting + node-graph UX. Blender: CPU→GPU node-to-shader migration case study. Olive: DAG-of-typed-nodes model, most "agent-legible" of the three |

**Action-surface requirement:** the node graph itself needs Actions for graph
construction (`add-compositing-node`, `connect-nodes`, `remove-compositing-node`) in
addition to per-node-type parameter Actions — this is the phase where "is the whole
system actually addressable as a graph an agent can build programmatically" gets
tested for real, not just individual operations in isolation.

---

### Phase 4 — Export/Deliver hardening · serves: core value prop ("produce a real output file"), directly blocked on the WebGPU gap

**Done when:** real (non-empty) projects export correctly to at least MP4/WebM through
the existing `export-project` Action, with results verified by inspecting actual output
bytes — not just checking the Action dispatched without throwing.

**This phase cannot start meaningfully until the WebGPU gap from HEADLESS_DESIGN.md v1.5
is resolved.** Every other phase produces state-correct Actions regardless of rendering;
this one's entire done-when is a rendered artifact. Treat resolving the WebGPU gap as
Phase 4's actual first sub-goal, not a precondition to note and move past.

**In scope (once unblocked):** codec/container support beyond whatever the WASM
compositor already provides, platform export presets (matching Resolve's Cut-page Quick
Export idea — YouTube/Vimeo-style presets, not the literal upload integration), basic
EDL/OTIO interchange for timeline portability.

**Explicitly deferred:** AAF (Avid-centric, GPL-only libraries available — LibAAF is
read-only GPL, usable only as an out-of-process CLI tool if ever needed), IMF/DCP cinema
mastering, remote/offload rendering, AAF Round Trip.

**FOSS accelerants:**
| Use | Project | License | Notes |
|---|---|---|---|
| AV1 decode | [dav1d](https://github.com/videolan/dav1d) | 🟢 BSD-2-Clause | Fastest software AV1 decoder, safe to vendor |
| AV1 encode (Rust-native) | [rav1e](https://github.com/xiph/rav1e) | 🟢 BSD-2-Clause | Most natural fit for the Rust/WASM core; expect a speed hit on the pure-Rust WASM path vs. asm-optimized native |
| VP8/VP9 encode/decode | [libvpx](https://github.com/webmproject/libvpx) | 🟢 BSD-3-Clause | WASM-compilable, no relicensing risk |
| Audio decode/demux | [symphonia](https://github.com/pdeljanov/Symphonia) | 🟢 MPL-2.0 (dependency-safe) | Pure Rust, WASM-friendly — strong FFmpeg-subprocess replacement for audio-only paths |
| MP4 muxing | [mp4 crate](https://github.com/alfg/mp4-rust) | 🟢 MIT | Most mature pure-Rust MP4 muxer found, WASM-proven |
| Browser-side container muxing (JS layer) | [Mediabunny](https://github.com/Vanilagy/mediabunny) | 🟢 MPL-2.0, free for closed-source commercial use | Pure TypeScript, WebCodecs-native, 25+ codecs, tree-shakable — strongest ready-made option for the Next.js app layer |
| Timeline interchange schema | [OpenTimelineIO](https://github.com/AcademySoftwareFoundation/OpenTimelineIO) | 🟢 Apache-2.0 | No mature Rust/WASM binding exists — **implement the documented JSON schema natively in Rust**, don't bind the C++ core |
| EDL/CMX3600 | [pycmx](https://github.com/iluvcapra/pycmx) (reference), [otio-cmx3600-adapter](https://github.com/OpenTimelineIO/otio-cmx3600-adapter) | 🟢 MIT / Apache-2.0 | Cheap either way — hand-roll a native parser or lean on OTIO's own adapter |
| ⚠️ Highest license risk in the whole roadmap | FFmpeg / ffmpeg.wasm | 🟡 LGPL by default, **flips to GPL the moment `--enable-gpl` is set** (pulls in x264/x265) | If used at all, audit build flags directly — don't trust a tutorial's default config. x264/x265 themselves (🔴 GPL) are not usable in this MIT project without a commercial license |

**Action-surface requirement:** `export-project`'s args already exist
(`format`/`quality`/`fps`/`includeAudio`) — this phase is about making the underlying
render actually work, not about the Action surface, which is already correct.

---

### Phase 5 — Advanced/Studio-tier stretch · serves: directional only, not committed

Everything Resolve gates behind its paid Studio tier, kept here for completeness but
explicitly not sequenced: HDR grading (Dolby Vision/HDR10+/PQ-HLG tone mapping),
Face Refinement/beauty tools, temporal + AI noise reduction, tracked-Power-Window-driven
secondary grading depth, Dolby Atmos/immersive audio mastering, multi-user cloud
collaboration with locking, stereoscopic 3D, DCP/IMF mastering, and Resolve's AI Neural
Engine suite (Magic Mask, Depth Map, Voice Isolation, Music Remixer, Smart Reframe) —
each of which would need either a genuinely open ML model or a from-scratch algorithm,
not just a library integration. Revisit sizing each of these only once Phases 1–4 are
real and Goal 3's proof gate has passed on the base feature set.

---

## License strategy summary (from the FOSS research pass)

**Safe to vendor directly (MIT/Apache-2.0/BSD/ISC):** OCIO, OpenColorIO-Config-ACES,
palette, three.js LUTPass, OxiMedia/OxiScope, Graphite, OpenFX spec, React Flow, Rete.js,
petgraph, image-blend, photon-rs, greenscreen, cpal, rodio, dasp, fundsp, WAM 2.0,
standardized-audio-context, Tone.js, waveform-playlist, dav1d, libvpx, rav1e, symphonia
(MPL-2.0, dependency-safe), mp4 crate, Mediabunny (MPL-2.0), OpenTimelineIO, pycmx,
otio-cmx3600-adapter.

**Conditional — verify build config/subdirectory before shipping:** FFmpeg/ffmpeg.wasm
(audit build flags every time), Faust/faustwasm (LGPL — build-time compiler only, never
embed the runtime), `lut-cube` crate (unclear license, verify).

**Reference/architecture-only — never vendor into this MIT codebase:** Natron, Blender
compositor, GEGL, Ardour, Tenacity/Audacity, Calf Studio Gear, x42-plugins, openDAW
(AGPL), x264, x265, Shotcut, Kdenlive, MLT (LGPL core + GPL modules), Olive, Flowblade,
OpenShot/libopenshot, LibAAF.

**Standing rule for this whole roadmap:** when a phase's implementation touches any
FOSS project not in the "safe" list above, stop and re-check its license before
vendoring — this table is a snapshot from one research pass, not a permanent clearance.

## Biggest opportunity, stated plainly

No existing project has a working WASM/browser port of MLT's engine model, of a
Natron/Blender-style node-compositing architecture, or of OpenTimelineIO. "Rust/WASM/
wgpu-native, node-based, agent-controllable" is genuinely open ground, not a crowded
field — Graphite (2D compositing) and openDAW (audio, AGPL/roadmap-only) are the
closest existing attempts at adjacent problems, worth tracking as prior art even where
their code can't be used directly.

## How to decompose this further

Once a phase is picked to start, run it through `/northstar` the same way VISION.md's
"Now" milestone became GOALS.md's Goal 1–3 — each phase above should become its own
Goal N with sub-goals, sequenced the same disciplined way (audit → close gaps → verify
headlessly), not started all at once.
