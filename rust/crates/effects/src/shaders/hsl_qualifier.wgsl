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

// DaVinci's "Highlight" qualifier preview: pixels within the H/S/L range
// (with soft falloff) stay in full color, everything else is dimmed to
// grayscale. This is a real, scoped-down slice of DaVinci's qualifier
// system -- it does NOT gate a chained downstream correction (DaVinci's
// full secondary-grading workflow), since the current effect pipeline
// applies passes sequentially to the whole frame with no matte hand-off
// between them. That's real, separate, deferred work needing pipeline
// changes -- see COLOR_GRADING_DESIGN.md. What's here is correct and
// useful on its own: isolating/previewing a color range is exactly what a
// human (or agent) needs while building a qualifier's ranges.
fn rgb_to_hsl(rgb: vec3f) -> vec3f {
    let max_c = max(rgb.r, max(rgb.g, rgb.b));
    let min_c = min(rgb.r, min(rgb.g, rgb.b));
    let delta = max_c - min_c;
    let l = (max_c + min_c) * 0.5;

    var h = 0.0;
    var s = 0.0;
    if (delta > 0.0001) {
        let denom = 1.0 - abs(2.0 * l - 1.0);
        s = delta / max(denom, 0.0001);
        if (max_c == rgb.r) {
            h = ((rgb.g - rgb.b) / delta) % 6.0;
        } else if (max_c == rgb.g) {
            h = (rgb.b - rgb.r) / delta + 2.0;
        } else {
            h = (rgb.r - rgb.g) / delta + 4.0;
        }
        h = h / 6.0;
        if (h < 0.0) {
            h = h + 1.0;
        }
    }
    return vec3f(h, s, l);
}

fn range_membership(value: f32, center: f32, width: f32, softness: f32) -> f32 {
    let dist = abs(value - center);
    let inner = width * 0.5;
    let outer = inner + max(softness, 0.0001);
    return 1.0 - smoothstep(inner, outer, dist);
}

// Hue wraps at 0/1 -- 0.99 and 0.01 are close, not far apart.
fn hue_membership(hue: f32, center: f32, width: f32, softness: f32) -> f32 {
    var dist = abs(hue - center);
    dist = min(dist, 1.0 - dist);
    let inner = width * 0.5;
    let outer = inner + max(softness, 0.0001);
    return 1.0 - smoothstep(inner, outer, dist);
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let hue_center = uniforms.scalars.x;
    let hue_width = uniforms.scalars.y;
    let sat_center = uniforms.scalars.z;
    let sat_width = uniforms.scalars.w;
    let lum_center = uniforms.scalars_b.x;
    let lum_width = uniforms.scalars_b.y;
    let softness = uniforms.scalars_b.z;

    let source = textureSample(input_texture, input_sampler, input.tex_coord);
    let hsl = rgb_to_hsl(source.rgb);

    let weight = hue_membership(hsl.x, hue_center, hue_width, softness)
        * range_membership(hsl.y, sat_center, sat_width, softness)
        * range_membership(hsl.z, lum_center, lum_width, softness);

    let luma = dot(source.rgb, vec3f(0.2126, 0.7152, 0.0722));
    let dimmed = vec3f(luma) * 0.3;
    let output_rgb = mix(dimmed, source.rgb, clamp(weight, 0.0, 1.0));

    return vec4f(output_rgb, source.a);
}
