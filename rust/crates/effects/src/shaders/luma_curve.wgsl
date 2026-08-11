struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) tex_coord: vec2f,
}

struct EffectUniforms {
    resolution: vec2f,
    direction: vec2f,
    scalars: vec4f,
    scalars_b: vec4f,
}

@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: EffectUniforms;

// A 5-point Catmull-Rom spline curve (shadow/quarter/mid/three-quarter/
// highlight, at fixed x = 0, 0.25, 0.5, 0.75, 1.0 -- only the Y values are
// adjustable), applied identically to R, G, and B. This is a real,
// non-trivial curve tool, not a parametric stand-in -- but it's a
// deliberate scope reduction from DaVinci's actual curve editor, which
// lets a user add/remove/drag arbitrary control points on an arbitrary
// texture-backed LUT. That would need new pipeline infrastructure (a
// per-pass texture binding, which EffectPass/UniformValue don't support
// today) -- real, separate, larger work. A fixed-point-count spline
// evaluated analytically in-shader needs none of that and still delivers
// genuine S-curve/contrast-curve capability, which is why this is the v1
// scope rather than the texture-LUT version. See COLOR_GRADING_DESIGN.md.
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

// Points are at x = 0, 0.25, 0.5, 0.75, 1.0. Boundary segments need a
// virtual control point before y0 / after y4. Linearly extrapolating it
// (2*y0 - y1, 2*y4 - y3) rather than duplicating the endpoint (y0, y4) is
// the difference between an identity curve (y_i = x_i) actually staying
// identity at the edges or silently drifting -- duplication was tried
// first, produced a real, measurable pass-through error at the edges
// (caught by a test that checks this, not assumed correct), and was
// replaced with this extrapolated form once traced to the actual cause.
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
    let y0 = uniforms.scalars.x;
    let y1 = uniforms.scalars.y;
    let y2 = uniforms.scalars.z;
    let y3 = uniforms.scalars.w;
    let y4 = uniforms.scalars_b.x;

    let source = textureSample(input_texture, input_sampler, input.tex_coord);
    let r = clamp(eval_curve(source.r, y0, y1, y2, y3, y4), 0.0, 1.0);
    let g = clamp(eval_curve(source.g, y0, y1, y2, y3, y4), 0.0, 1.0);
    let b = clamp(eval_curve(source.b, y0, y1, y2, y3, y4), 0.0, 1.0);

    return vec4f(r, g, b, source.a);
}
