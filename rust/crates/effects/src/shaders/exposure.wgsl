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

// A single EV-stops scalar: output = input * 2^ev, matching how camera
// exposure stops work (each +1 EV doubles light). Applied directly to the
// source's existing (gamma-encoded) values without a linearize/relinearize
// round-trip -- a deliberate simplification, not a colorimetrically exact
// scene-linear exposure model. See COLOR_GRADING_DESIGN.md.
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let ev = uniforms.scalars.x;

    let source = textureSample(input_texture, input_sampler, input.tex_coord);
    let gain = pow(2.0, ev);
    let rgb = clamp(source.rgb * gain, vec3f(0.0), vec3f(1.0));

    return vec4f(rgb, source.a);
}
