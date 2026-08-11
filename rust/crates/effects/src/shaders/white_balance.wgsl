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

// White balance as a relative temperature/tint correction, not an absolute
// Kelvin/blackbody-radiation conversion -- DaVinci's own WB temperature
// slider is also a relative correction, not a from-scratch colorimetric
// computation. temperature/tint are each in [-1, 1]. Positive temperature
// warms the image (more red, less blue); positive tint shifts toward
// magenta (less green, a touch more red+blue). The 0.4/0.2 coefficients
// are a defensible, clean approximation -- not a verified match to
// DaVinci's proprietary math. See COLOR_GRADING_DESIGN.md.
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let temperature = uniforms.scalars.x;
    let tint = uniforms.scalars.y;

    let source = textureSample(input_texture, input_sampler, input.tex_coord);
    var rgb = source.rgb;

    rgb.r = rgb.r * (1.0 + temperature * 0.4);
    rgb.b = rgb.b * (1.0 - temperature * 0.4);

    rgb.g = rgb.g * (1.0 - tint * 0.4);
    rgb.r = rgb.r * (1.0 + tint * 0.2);
    rgb.b = rgb.b * (1.0 + tint * 0.2);

    rgb = clamp(rgb, vec3f(0.0), vec3f(1.0));
    return vec4f(rgb, source.a);
}
