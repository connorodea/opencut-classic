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

// Master (luminance) lift/gamma/gain/offset, applied equally to R/G/B.
// Per-channel RGB color-balance wheels are a deliberate follow-up, not this
// pass — see COLOR_GRADING_DESIGN.md.
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let lift = uniforms.scalars.x;
    let gamma = uniforms.scalars.y;
    let gain = uniforms.scalars.z;
    let offset = uniforms.scalars.w;

    let source = textureSample(input_texture, input_sampler, input.tex_coord);
    var rgb = source.rgb;

    // Lift: additive shadow shift that tapers to zero effect as color
    // approaches white — out = in + lift * (1 - in).
    rgb = clamp(rgb + lift * (1.0 - rgb), vec3f(0.0), vec3f(1.0));

    // Gamma: power curve on midtones. Guard against non-positive gamma,
    // which would make pow() undefined/NaN.
    let safe_gamma = max(gamma, 0.001);
    rgb = pow(rgb, vec3f(1.0 / safe_gamma));

    // Gain: multiplicative scale, most visible in highlights.
    rgb = rgb * gain;

    // Offset: uniform additive shift across the whole tonal range
    // (DaVinci's fourth primary-bars wheel).
    rgb = clamp(rgb + offset, vec3f(0.0), vec3f(1.0));

    return vec4f(rgb, source.a);
}
