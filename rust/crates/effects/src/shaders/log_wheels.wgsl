struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) tex_coord: vec2f,
}

struct EffectUniforms {
    resolution: vec2f,
    direction: vec2f,
    scalars: vec4f,
}

@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: EffectUniforms;

// Log-domain lift/gamma/gain/offset — the same four-wheel control surface as
// primary-wheels.wgsl, but a deliberately different formula for footage
// that's already log-encoded (camera log profiles: S-Log, Log-C, V-Log,
// etc.). This is NOT a reverse-engineered match to DaVinci's proprietary log
// mode -- it's a defensible, industry-standard-adjacent additive model
// (documented explicitly rather than presented as verified-exact), scoped
// this way per COLOR_GRADING_DESIGN.md:
//
// In log-encoded values, an additive shift corresponds to a consistent
// number of exposure stops across the whole tonal range -- which is the
// actual point of grading in log space (predictable, even-feeling
// adjustments). So unlike primary-wheels' power-curve gamma (correct for
// video-gamma/linear-referred footage), log-mode "gamma" here is additive,
// same as lift and offset. Gain stays multiplicative, consistent with how
// it behaves in both modes.
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let lift = uniforms.scalars.x;
    let gamma_offset = uniforms.scalars.y;
    let gain = uniforms.scalars.z;
    let offset = uniforms.scalars.w;

    let source = textureSample(input_texture, input_sampler, input.tex_coord);
    var rgb = source.rgb;

    // Lift: additive shadow shift that tapers to zero effect as the value
    // approaches white -- same shape as primary-wheels, still valid on
    // log-encoded values.
    rgb = clamp(rgb + lift * (1.0 - rgb), vec3f(0.0), vec3f(1.0));

    // Gamma, in log mode: a flat additive midtone shift, not a power curve
    // -- power curves assume a video-gamma-encoded input, which log footage
    // isn't.
    rgb = rgb + gamma_offset;

    // Gain: multiplicative scale.
    rgb = rgb * gain;

    // Offset: uniform additive shift across the whole tonal range.
    rgb = clamp(rgb + offset, vec3f(0.0), vec3f(1.0));

    return vec4f(rgb, source.a);
}
