struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) tex_coord: vec2f,
}

struct EffectUniforms {
    resolution: vec2f,
    direction: vec2f,
    scalars: vec4f,
    scalars_b: vec4f,
    scalars_c: vec4f,
    scalars_d: vec4f,
}

@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: EffectUniforms;

// Independent 5-point Catmull-Rom curves per R/G/B channel -- genuinely
// distinct from luma_curve.wgsl, which applies ONE shared curve identically
// to all three channels. This is what DaVinci's RGB Curves panel gives
// (e.g. push red into shadows without touching green/blue); luma_curve is
// closer to a master contrast curve. Same fixed-point-count, analytically-
// evaluated-in-shader scope reduction as luma_curve (not arbitrary-point,
// texture-backed curves) -- see luma_curve.wgsl's doc comment and
// COLOR_GRADING_DESIGN.md for why that's the deliberate v1 scope.
fn catmull_rom(p0: f32, p1: f32, p2: f32, p3: f32, t: f32) -> f32 {
    let t2 = t * t;
    let t3 = t2 * t;
    return 0.5 * (
        (2.0 * p1)
        + (-p0 + p2) * t
        + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2
        + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
    );
}

// Same boundary handling as luma_curve.wgsl: linear extrapolation for the
// virtual control points before y0 / after y4, not endpoint duplication --
// duplication measurably fails to preserve an identity curve at the edges
// (caught by a test in luma_curve's own history). Reused here rather than
// re-deriving, since it's the same fix for the same underlying math.
fn eval_curve(x: f32, y0: f32, y1: f32, y2: f32, y3: f32, y4: f32) -> f32 {
    let xc = clamp(x, 0.0, 1.0);
    let virtual_before = 2.0 * y0 - y1;
    let virtual_after = 2.0 * y4 - y3;
    if (xc < 0.25) {
        return catmull_rom(virtual_before, y0, y1, y2, xc / 0.25);
    } else if (xc < 0.5) {
        return catmull_rom(y0, y1, y2, y3, (xc - 0.25) / 0.25);
    } else if (xc < 0.75) {
        return catmull_rom(y1, y2, y3, y4, (xc - 0.5) / 0.25);
    } else {
        return catmull_rom(y2, y3, y4, virtual_after, (xc - 0.75) / 0.25);
    }
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let r_y0 = uniforms.scalars.x;
    let r_y1 = uniforms.scalars.y;
    let r_y2 = uniforms.scalars.z;
    let r_y3 = uniforms.scalars.w;
    let r_y4 = uniforms.scalars_b.x;

    let g_y0 = uniforms.scalars_b.y;
    let g_y1 = uniforms.scalars_b.z;
    let g_y2 = uniforms.scalars_b.w;
    let g_y3 = uniforms.scalars_c.x;
    let g_y4 = uniforms.scalars_c.y;

    let b_y0 = uniforms.scalars_c.z;
    let b_y1 = uniforms.scalars_c.w;
    let b_y2 = uniforms.scalars_d.x;
    let b_y3 = uniforms.scalars_d.y;
    let b_y4 = uniforms.scalars_d.z;

    let source = textureSample(input_texture, input_sampler, input.tex_coord);
    let r = clamp(eval_curve(source.r, r_y0, r_y1, r_y2, r_y3, r_y4), 0.0, 1.0);
    let g = clamp(eval_curve(source.g, g_y0, g_y1, g_y2, g_y3, g_y4), 0.0, 1.0);
    let b = clamp(eval_curve(source.b, b_y0, b_y1, b_y2, b_y3, b_y4), 0.0, 1.0);

    return vec4f(r, g, b, source.a);
}
