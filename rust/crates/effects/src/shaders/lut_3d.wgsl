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
@group(2) @binding(0) var lut_texture: texture_2d<f32>;

// A 3D LUT, sampled from a 2D "tiled" texture: LUT_SIZE tiles of
// LUT_SIZE x LUT_SIZE laid out side-by-side along X (one tile per blue
// slice), so the whole cube fits in a single texture_2d without needing
// D3 texture support. See lut.rs (Rust side) for the matching tile-index
// math used to build this texture from a flattened RGB array.
//
// Deliberately nearest-neighbor, not trilinear: sampling is done with
// textureLoad at the rounded (r, g, b) index rather than interpolating
// between neighboring cells (which would also require blending across
// tile boundaries -- adjacent tiles are different blue slices, so a
// filtering sampler would blend in wrong data at tile edges). This is a
// real, working LUT application; a lower-quality one than DaVinci's
// trilinear-interpolated cube, most visible as banding on a coarse LUT
// applied to a smooth gradient. See COLOR_GRADING_DESIGN.md.
const LUT_SIZE: i32 = 9;
const LUT_MAX_INDEX: f32 = 8.0;

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let intensity = clamp(uniforms.scalars.x, 0.0, 1.0);

    let source = textureSample(input_texture, input_sampler, input.tex_coord);

    let r_index = i32(round(clamp(source.r, 0.0, 1.0) * LUT_MAX_INDEX));
    let g_index = i32(round(clamp(source.g, 0.0, 1.0) * LUT_MAX_INDEX));
    let b_index = i32(round(clamp(source.b, 0.0, 1.0) * LUT_MAX_INDEX));

    let texel_x = b_index * LUT_SIZE + r_index;
    let texel_y = g_index;

    let graded = textureLoad(lut_texture, vec2<i32>(texel_x, texel_y), 0);

    let out_rgb = mix(source.rgb, graded.rgb, intensity);
    return vec4f(out_rgb, source.a);
}
