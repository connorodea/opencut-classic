use std::collections::HashMap;

use bytemuck::{Pod, Zeroable};
use gpu::{FULLSCREEN_SHADER_SOURCE, GpuContext};
use thiserror::Error;
use wgpu::util::DeviceExt;

use crate::{EffectPass, UniformValue};

const GAUSSIAN_BLUR_SHADER_ID: &str = "gaussian-blur";
const GAUSSIAN_BLUR_SHADER_SOURCE: &str = include_str!("shaders/gaussian_blur.wgsl");
const PRIMARY_WHEELS_SHADER_ID: &str = "primary-wheels";
const PRIMARY_WHEELS_SHADER_SOURCE: &str = include_str!("shaders/primary_wheels.wgsl");
const LOG_WHEELS_SHADER_ID: &str = "log-wheels";
const LOG_WHEELS_SHADER_SOURCE: &str = include_str!("shaders/log_wheels.wgsl");
const HSL_QUALIFIER_SHADER_ID: &str = "hsl-qualifier";
const HSL_QUALIFIER_SHADER_SOURCE: &str = include_str!("shaders/hsl_qualifier.wgsl");
const LUMA_CURVE_SHADER_ID: &str = "luma-curve";
const LUMA_CURVE_SHADER_SOURCE: &str = include_str!("shaders/luma_curve.wgsl");
const LUT_3D_SHADER_ID: &str = "lut-3d";
const LUT_3D_SHADER_SOURCE: &str = include_str!("shaders/lut_3d.wgsl");

/// Grid resolution per axis of the tiled-2D 3D LUT texture (9x9x9 = 729
/// points). Must match the `LUT_SIZE` constant declared in lut_3d.wgsl --
/// there is no single source of truth between Rust and WGSL for this, so
/// both are kept in sync manually and covered by pixel tests that would
/// fail if they drifted.
const LUT_SIZE: usize = 9;
const LUT_GRID_POINTS: usize = LUT_SIZE * LUT_SIZE * LUT_SIZE;
const LUT_DATA_LEN: usize = LUT_GRID_POINTS * 3;

pub struct ApplyEffectsOptions<'a> {
    pub source: &'a wgpu::Texture,
    pub width: u32,
    pub height: u32,
    pub passes: &'a [EffectPass],
}

pub struct EffectPipeline {
    uniform_bind_group_layout: wgpu::BindGroupLayout,
    lut_bind_group_layout: wgpu::BindGroupLayout,
    pipelines: HashMap<String, wgpu::RenderPipeline>,
}

#[derive(Debug, Error)]
pub enum EffectsError {
    #[error("At least one effect pass is required")]
    MissingEffectPasses,
    #[error("Unknown effect shader '{shader}'")]
    UnknownEffectShader { shader: String },
    #[error("Missing uniform '{uniform}' for shader '{shader}'")]
    MissingUniform { shader: String, uniform: String },
    #[error("Uniform '{uniform}' for shader '{shader}' must be a number")]
    InvalidNumberUniform { shader: String, uniform: String },
    #[error(
        "Uniform '{uniform}' for shader '{shader}' must be a vector of length {expected_length}"
    )]
    InvalidVectorUniform {
        shader: String,
        uniform: String,
        expected_length: usize,
    },
    #[error("Shader '{shader}' does not support uniform '{uniform}'")]
    UnsupportedUniform { shader: String, uniform: String },
    #[error(
        "Uniform '{uniform}' for shader '{shader}' must be a vector of length {expected_length} (a flattened {lut_size}x{lut_size}x{lut_size} LUT), got length {actual_length}"
    )]
    InvalidLutData {
        shader: String,
        uniform: String,
        lut_size: usize,
        expected_length: usize,
        actual_length: usize,
    },
}

// scalars_b extends the original 4-float scalars slot for shaders that need
// more than 4 free values (e.g. hsl-qualifier's 7 params). Appended at the
// end so it's backward-compatible: WGSL uniform-buffer bindings only read
// the bytes their own struct declares, so shaders that don't know about
// scalars_b (gaussian-blur, primary-wheels, log-wheels) are unaffected --
// verified by re-running their existing tests after this change, not
// assumed safe from the WGSL spec alone.
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct EffectUniformBuffer {
    resolution: [f32; 2],
    direction: [f32; 2],
    scalars: [f32; 4],
    scalars_b: [f32; 4],
}

impl EffectPipeline {
    pub fn new(context: &GpuContext) -> Self {
        let uniform_bind_group_layout =
            context
                .device()
                .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                    label: Some("effects-uniform-bind-group-layout"),
                    entries: &[wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Buffer {
                            ty: wgpu::BufferBindingType::Uniform,
                            has_dynamic_offset: false,
                            min_binding_size: None,
                        },
                        count: None,
                    }],
                });
        let lut_bind_group_layout =
            context
                .device()
                .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                    label: Some("effects-lut-bind-group-layout"),
                    entries: &[wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            multisampled: false,
                            view_dimension: wgpu::TextureViewDimension::D2,
                            // No sampler is bound alongside this texture --
                            // the shader reads it with textureLoad at exact
                            // integer coordinates (nearest-neighbor LUT
                            // lookup), not textureSample, so it doesn't need
                            // to be filterable.
                            sample_type: wgpu::TextureSampleType::Float { filterable: false },
                        },
                        count: None,
                    }],
                });
        let vertex_shader_module =
            context
                .device()
                .create_shader_module(wgpu::ShaderModuleDescriptor {
                    label: Some("effects-fullscreen-shader"),
                    source: wgpu::ShaderSource::Wgsl(FULLSCREEN_SHADER_SOURCE.into()),
                });
        let gaussian_blur_shader_module =
            context
                .device()
                .create_shader_module(wgpu::ShaderModuleDescriptor {
                    label: Some("effects-gaussian-blur-shader"),
                    source: wgpu::ShaderSource::Wgsl(GAUSSIAN_BLUR_SHADER_SOURCE.into()),
                });
        let primary_wheels_shader_module =
            context
                .device()
                .create_shader_module(wgpu::ShaderModuleDescriptor {
                    label: Some("effects-primary-wheels-shader"),
                    source: wgpu::ShaderSource::Wgsl(PRIMARY_WHEELS_SHADER_SOURCE.into()),
                });
        let log_wheels_shader_module =
            context
                .device()
                .create_shader_module(wgpu::ShaderModuleDescriptor {
                    label: Some("effects-log-wheels-shader"),
                    source: wgpu::ShaderSource::Wgsl(LOG_WHEELS_SHADER_SOURCE.into()),
                });
        let hsl_qualifier_shader_module =
            context
                .device()
                .create_shader_module(wgpu::ShaderModuleDescriptor {
                    label: Some("effects-hsl-qualifier-shader"),
                    source: wgpu::ShaderSource::Wgsl(HSL_QUALIFIER_SHADER_SOURCE.into()),
                });
        let luma_curve_shader_module =
            context
                .device()
                .create_shader_module(wgpu::ShaderModuleDescriptor {
                    label: Some("effects-luma-curve-shader"),
                    source: wgpu::ShaderSource::Wgsl(LUMA_CURVE_SHADER_SOURCE.into()),
                });
        let lut_3d_shader_module =
            context
                .device()
                .create_shader_module(wgpu::ShaderModuleDescriptor {
                    label: Some("effects-lut-3d-shader"),
                    source: wgpu::ShaderSource::Wgsl(LUT_3D_SHADER_SOURCE.into()),
                });
        let pipeline_layout =
            context
                .device()
                .create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                    label: Some("effects-pipeline-layout"),
                    bind_group_layouts: &[
                        Some(context.texture_sampler_bind_group_layout()),
                        Some(&uniform_bind_group_layout),
                    ],
                    immediate_size: 0,
                });
        // A separate 3-bind-group layout for LUT-consuming shaders. wgpu
        // pipelines bake their bind-group layouts in at creation time, so a
        // shader needing a 3rd bind group (the LUT texture) can't reuse the
        // shared 2-group `pipeline_layout` above -- it needs its own
        // pipeline built against this layout.
        let lut_pipeline_layout =
            context
                .device()
                .create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                    label: Some("effects-lut-pipeline-layout"),
                    bind_group_layouts: &[
                        Some(context.texture_sampler_bind_group_layout()),
                        Some(&uniform_bind_group_layout),
                        Some(&lut_bind_group_layout),
                    ],
                    immediate_size: 0,
                });
        let gaussian_blur_pipeline =
            context
                .device()
                .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                    label: Some("effects-gaussian-blur-pipeline"),
                    layout: Some(&pipeline_layout),
                    vertex: wgpu::VertexState {
                        module: &vertex_shader_module,
                        entry_point: Some("vertex_main"),
                        buffers: &[wgpu::VertexBufferLayout {
                            array_stride: std::mem::size_of::<[f32; 2]>() as u64,
                            step_mode: wgpu::VertexStepMode::Vertex,
                            attributes: &[wgpu::VertexAttribute {
                                format: wgpu::VertexFormat::Float32x2,
                                offset: 0,
                                shader_location: 0,
                            }],
                        }],
                        compilation_options: wgpu::PipelineCompilationOptions::default(),
                    },
                    fragment: Some(wgpu::FragmentState {
                        module: &gaussian_blur_shader_module,
                        entry_point: Some("fragment_main"),
                        targets: &[Some(wgpu::ColorTargetState {
                            format: context.texture_format(),
                            blend: None,
                            write_mask: wgpu::ColorWrites::ALL,
                        })],
                        compilation_options: wgpu::PipelineCompilationOptions::default(),
                    }),
                    primitive: wgpu::PrimitiveState::default(),
                    depth_stencil: None,
                    multisample: wgpu::MultisampleState::default(),
                    multiview_mask: None,
                    cache: None,
                });
        let primary_wheels_pipeline =
            context
                .device()
                .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                    label: Some("effects-primary-wheels-pipeline"),
                    layout: Some(&pipeline_layout),
                    vertex: wgpu::VertexState {
                        module: &vertex_shader_module,
                        entry_point: Some("vertex_main"),
                        buffers: &[wgpu::VertexBufferLayout {
                            array_stride: std::mem::size_of::<[f32; 2]>() as u64,
                            step_mode: wgpu::VertexStepMode::Vertex,
                            attributes: &[wgpu::VertexAttribute {
                                format: wgpu::VertexFormat::Float32x2,
                                offset: 0,
                                shader_location: 0,
                            }],
                        }],
                        compilation_options: wgpu::PipelineCompilationOptions::default(),
                    },
                    fragment: Some(wgpu::FragmentState {
                        module: &primary_wheels_shader_module,
                        entry_point: Some("fragment_main"),
                        targets: &[Some(wgpu::ColorTargetState {
                            format: context.texture_format(),
                            blend: None,
                            write_mask: wgpu::ColorWrites::ALL,
                        })],
                        compilation_options: wgpu::PipelineCompilationOptions::default(),
                    }),
                    primitive: wgpu::PrimitiveState::default(),
                    depth_stencil: None,
                    multisample: wgpu::MultisampleState::default(),
                    multiview_mask: None,
                    cache: None,
                });
        let log_wheels_pipeline =
            context
                .device()
                .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                    label: Some("effects-log-wheels-pipeline"),
                    layout: Some(&pipeline_layout),
                    vertex: wgpu::VertexState {
                        module: &vertex_shader_module,
                        entry_point: Some("vertex_main"),
                        buffers: &[wgpu::VertexBufferLayout {
                            array_stride: std::mem::size_of::<[f32; 2]>() as u64,
                            step_mode: wgpu::VertexStepMode::Vertex,
                            attributes: &[wgpu::VertexAttribute {
                                format: wgpu::VertexFormat::Float32x2,
                                offset: 0,
                                shader_location: 0,
                            }],
                        }],
                        compilation_options: wgpu::PipelineCompilationOptions::default(),
                    },
                    fragment: Some(wgpu::FragmentState {
                        module: &log_wheels_shader_module,
                        entry_point: Some("fragment_main"),
                        targets: &[Some(wgpu::ColorTargetState {
                            format: context.texture_format(),
                            blend: None,
                            write_mask: wgpu::ColorWrites::ALL,
                        })],
                        compilation_options: wgpu::PipelineCompilationOptions::default(),
                    }),
                    primitive: wgpu::PrimitiveState::default(),
                    depth_stencil: None,
                    multisample: wgpu::MultisampleState::default(),
                    multiview_mask: None,
                    cache: None,
                });
        let hsl_qualifier_pipeline =
            context
                .device()
                .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                    label: Some("effects-hsl-qualifier-pipeline"),
                    layout: Some(&pipeline_layout),
                    vertex: wgpu::VertexState {
                        module: &vertex_shader_module,
                        entry_point: Some("vertex_main"),
                        buffers: &[wgpu::VertexBufferLayout {
                            array_stride: std::mem::size_of::<[f32; 2]>() as u64,
                            step_mode: wgpu::VertexStepMode::Vertex,
                            attributes: &[wgpu::VertexAttribute {
                                format: wgpu::VertexFormat::Float32x2,
                                offset: 0,
                                shader_location: 0,
                            }],
                        }],
                        compilation_options: wgpu::PipelineCompilationOptions::default(),
                    },
                    fragment: Some(wgpu::FragmentState {
                        module: &hsl_qualifier_shader_module,
                        entry_point: Some("fragment_main"),
                        targets: &[Some(wgpu::ColorTargetState {
                            format: context.texture_format(),
                            blend: None,
                            write_mask: wgpu::ColorWrites::ALL,
                        })],
                        compilation_options: wgpu::PipelineCompilationOptions::default(),
                    }),
                    primitive: wgpu::PrimitiveState::default(),
                    depth_stencil: None,
                    multisample: wgpu::MultisampleState::default(),
                    multiview_mask: None,
                    cache: None,
                });
        let luma_curve_pipeline =
            context
                .device()
                .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                    label: Some("effects-luma-curve-pipeline"),
                    layout: Some(&pipeline_layout),
                    vertex: wgpu::VertexState {
                        module: &vertex_shader_module,
                        entry_point: Some("vertex_main"),
                        buffers: &[wgpu::VertexBufferLayout {
                            array_stride: std::mem::size_of::<[f32; 2]>() as u64,
                            step_mode: wgpu::VertexStepMode::Vertex,
                            attributes: &[wgpu::VertexAttribute {
                                format: wgpu::VertexFormat::Float32x2,
                                offset: 0,
                                shader_location: 0,
                            }],
                        }],
                        compilation_options: wgpu::PipelineCompilationOptions::default(),
                    },
                    fragment: Some(wgpu::FragmentState {
                        module: &luma_curve_shader_module,
                        entry_point: Some("fragment_main"),
                        targets: &[Some(wgpu::ColorTargetState {
                            format: context.texture_format(),
                            blend: None,
                            write_mask: wgpu::ColorWrites::ALL,
                        })],
                        compilation_options: wgpu::PipelineCompilationOptions::default(),
                    }),
                    primitive: wgpu::PrimitiveState::default(),
                    depth_stencil: None,
                    multisample: wgpu::MultisampleState::default(),
                    multiview_mask: None,
                    cache: None,
                });
        let lut_3d_pipeline =
            context
                .device()
                .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                    label: Some("effects-lut-3d-pipeline"),
                    layout: Some(&lut_pipeline_layout),
                    vertex: wgpu::VertexState {
                        module: &vertex_shader_module,
                        entry_point: Some("vertex_main"),
                        buffers: &[wgpu::VertexBufferLayout {
                            array_stride: std::mem::size_of::<[f32; 2]>() as u64,
                            step_mode: wgpu::VertexStepMode::Vertex,
                            attributes: &[wgpu::VertexAttribute {
                                format: wgpu::VertexFormat::Float32x2,
                                offset: 0,
                                shader_location: 0,
                            }],
                        }],
                        compilation_options: wgpu::PipelineCompilationOptions::default(),
                    },
                    fragment: Some(wgpu::FragmentState {
                        module: &lut_3d_shader_module,
                        entry_point: Some("fragment_main"),
                        targets: &[Some(wgpu::ColorTargetState {
                            format: context.texture_format(),
                            blend: None,
                            write_mask: wgpu::ColorWrites::ALL,
                        })],
                        compilation_options: wgpu::PipelineCompilationOptions::default(),
                    }),
                    primitive: wgpu::PrimitiveState::default(),
                    depth_stencil: None,
                    multisample: wgpu::MultisampleState::default(),
                    multiview_mask: None,
                    cache: None,
                });
        let pipelines = HashMap::from([
            (GAUSSIAN_BLUR_SHADER_ID.to_string(), gaussian_blur_pipeline),
            (
                PRIMARY_WHEELS_SHADER_ID.to_string(),
                primary_wheels_pipeline,
            ),
            (LOG_WHEELS_SHADER_ID.to_string(), log_wheels_pipeline),
            (
                HSL_QUALIFIER_SHADER_ID.to_string(),
                hsl_qualifier_pipeline,
            ),
            (LUMA_CURVE_SHADER_ID.to_string(), luma_curve_pipeline),
            (LUT_3D_SHADER_ID.to_string(), lut_3d_pipeline),
        ]);

        Self {
            uniform_bind_group_layout,
            lut_bind_group_layout,
            pipelines,
        }
    }

    pub fn apply(
        &self,
        context: &GpuContext,
        ApplyEffectsOptions {
            source,
            width,
            height,
            passes,
        }: ApplyEffectsOptions<'_>,
    ) -> Result<wgpu::Texture, EffectsError> {
        let mut encoder =
            context
                .device()
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("effects-command-encoder"),
                });
        let output = self.apply_with_encoder(
            context,
            &mut encoder,
            ApplyEffectsOptions {
                source,
                width,
                height,
                passes,
            },
        )?;
        context.queue().submit([encoder.finish()]);
        Ok(output)
    }

    pub fn apply_with_encoder(
        &self,
        context: &GpuContext,
        encoder: &mut wgpu::CommandEncoder,
        ApplyEffectsOptions {
            source,
            width,
            height,
            passes,
        }: ApplyEffectsOptions<'_>,
    ) -> Result<wgpu::Texture, EffectsError> {
        let mut current_texture: Option<wgpu::Texture> = None;

        for pass in passes {
            let input_texture = current_texture.as_ref().unwrap_or(source);
            let output_texture =
                context.create_render_texture(width, height, "effects-pass-output");
            let input_view = input_texture.create_view(&wgpu::TextureViewDescriptor::default());
            let output_view = output_texture.create_view(&wgpu::TextureViewDescriptor::default());
            let texture_bind_group =
                context
                    .device()
                    .create_bind_group(&wgpu::BindGroupDescriptor {
                        label: Some("effects-texture-bind-group"),
                        layout: context.texture_sampler_bind_group_layout(),
                        entries: &[
                            wgpu::BindGroupEntry {
                                binding: 0,
                                resource: wgpu::BindingResource::TextureView(&input_view),
                            },
                            wgpu::BindGroupEntry {
                                binding: 1,
                                resource: wgpu::BindingResource::Sampler(context.linear_sampler()),
                            },
                        ],
                    });
            let uniform_buffer =
                context
                    .device()
                    .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                        label: Some("effects-uniform-buffer"),
                        contents: bytemuck::bytes_of(&pack_effect_uniforms(pass, width, height)?),
                        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                    });
            let uniform_bind_group =
                context
                    .device()
                    .create_bind_group(&wgpu::BindGroupDescriptor {
                        label: Some("effects-uniform-bind-group"),
                        layout: &self.uniform_bind_group_layout,
                        entries: &[wgpu::BindGroupEntry {
                            binding: 0,
                            resource: uniform_buffer.as_entire_binding(),
                        }],
                    });
            let pipeline = self.pipelines.get(&pass.shader).ok_or_else(|| {
                EffectsError::UnknownEffectShader {
                    shader: pass.shader.clone(),
                }
            })?;

            let lut_bind_group = if pass.shader == LUT_3D_SHADER_ID {
                let lut_texture = create_lut_texture(context, pass)?;
                let lut_view = lut_texture.create_view(&wgpu::TextureViewDescriptor::default());
                Some(
                    context
                        .device()
                        .create_bind_group(&wgpu::BindGroupDescriptor {
                            label: Some("effects-lut-bind-group"),
                            layout: &self.lut_bind_group_layout,
                            entries: &[wgpu::BindGroupEntry {
                                binding: 0,
                                resource: wgpu::BindingResource::TextureView(&lut_view),
                            }],
                        }),
                )
            } else {
                None
            };

            {
                let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: Some("effects-render-pass"),
                    color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                        view: &output_view,
                        resolve_target: None,
                        depth_slice: None,
                        ops: wgpu::Operations {
                            load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                            store: wgpu::StoreOp::Store,
                        },
                    })],
                    depth_stencil_attachment: None,
                    occlusion_query_set: None,
                    timestamp_writes: None,
                    multiview_mask: None,
                });
                render_pass.set_pipeline(pipeline);
                render_pass.set_vertex_buffer(0, context.fullscreen_quad().slice(..));
                render_pass.set_bind_group(0, &texture_bind_group, &[]);
                render_pass.set_bind_group(1, &uniform_bind_group, &[]);
                if let Some(lut_bind_group) = &lut_bind_group {
                    render_pass.set_bind_group(2, lut_bind_group, &[]);
                }
                render_pass.draw(0..6, 0..1);
            }

            current_texture = Some(output_texture);
        }

        current_texture.ok_or(EffectsError::MissingEffectPasses)
    }
}

fn pack_effect_uniforms(
    pass: &EffectPass,
    width: u32,
    height: u32,
) -> Result<EffectUniformBuffer, EffectsError> {
    let shader = pass.shader.as_str();
    match shader {
        GAUSSIAN_BLUR_SHADER_ID => pack_gaussian_blur_uniforms(pass, width, height),
        PRIMARY_WHEELS_SHADER_ID => pack_primary_wheels_uniforms(pass, width, height),
        LOG_WHEELS_SHADER_ID => pack_log_wheels_uniforms(pass, width, height),
        HSL_QUALIFIER_SHADER_ID => pack_hsl_qualifier_uniforms(pass, width, height),
        LUMA_CURVE_SHADER_ID => pack_luma_curve_uniforms(pass, width, height),
        LUT_3D_SHADER_ID => pack_lut_uniforms(pass, width, height),
        _ => Err(EffectsError::UnknownEffectShader {
            shader: shader.to_string(),
        }),
    }
}

fn reject_unexpected_uniforms(
    pass: &EffectPass,
    expected: &[&str],
) -> Result<(), EffectsError> {
    for uniform in pass.uniforms.keys() {
        if expected.contains(&uniform.as_str()) {
            continue;
        }
        return Err(EffectsError::UnsupportedUniform {
            shader: pass.shader.clone(),
            uniform: uniform.clone(),
        });
    }
    Ok(())
}

fn pack_gaussian_blur_uniforms(
    pass: &EffectPass,
    width: u32,
    height: u32,
) -> Result<EffectUniformBuffer, EffectsError> {
    let sigma = read_number_uniform(pass, "u_sigma")?;
    let step = read_number_uniform(pass, "u_step")?;
    let direction = read_vec2_uniform(pass, "u_direction")?;
    reject_unexpected_uniforms(pass, &["u_sigma", "u_step", "u_direction"])?;

    Ok(EffectUniformBuffer {
        resolution: [width as f32, height as f32],
        direction,
        scalars: [sigma, step, 0.0, 0.0],
        scalars_b: [0.0; 4],
    })
}

fn pack_primary_wheels_uniforms(
    pass: &EffectPass,
    width: u32,
    height: u32,
) -> Result<EffectUniformBuffer, EffectsError> {
    let lift = read_number_uniform(pass, "u_lift")?;
    let gamma = read_number_uniform(pass, "u_gamma")?;
    let gain = read_number_uniform(pass, "u_gain")?;
    let offset = read_number_uniform(pass, "u_offset")?;
    reject_unexpected_uniforms(pass, &["u_lift", "u_gamma", "u_gain", "u_offset"])?;

    Ok(EffectUniformBuffer {
        resolution: [width as f32, height as f32],
        direction: [0.0, 0.0],
        scalars: [lift, gamma, gain, offset],
        scalars_b: [0.0; 4],
    })
}

fn pack_log_wheels_uniforms(
    pass: &EffectPass,
    width: u32,
    height: u32,
) -> Result<EffectUniformBuffer, EffectsError> {
    let lift = read_number_uniform(pass, "u_lift")?;
    let gamma_offset = read_number_uniform(pass, "u_gamma_offset")?;
    let gain = read_number_uniform(pass, "u_gain")?;
    let offset = read_number_uniform(pass, "u_offset")?;
    reject_unexpected_uniforms(pass, &["u_lift", "u_gamma_offset", "u_gain", "u_offset"])?;

    Ok(EffectUniformBuffer {
        resolution: [width as f32, height as f32],
        direction: [0.0, 0.0],
        scalars: [lift, gamma_offset, gain, offset],
        scalars_b: [0.0; 4],
    })
}

fn pack_hsl_qualifier_uniforms(
    pass: &EffectPass,
    width: u32,
    height: u32,
) -> Result<EffectUniformBuffer, EffectsError> {
    let hue_center = read_number_uniform(pass, "u_hue_center")?;
    let hue_width = read_number_uniform(pass, "u_hue_width")?;
    let sat_center = read_number_uniform(pass, "u_sat_center")?;
    let sat_width = read_number_uniform(pass, "u_sat_width")?;
    let lum_center = read_number_uniform(pass, "u_lum_center")?;
    let lum_width = read_number_uniform(pass, "u_lum_width")?;
    let softness = read_number_uniform(pass, "u_softness")?;
    reject_unexpected_uniforms(
        pass,
        &[
            "u_hue_center",
            "u_hue_width",
            "u_sat_center",
            "u_sat_width",
            "u_lum_center",
            "u_lum_width",
            "u_softness",
        ],
    )?;

    Ok(EffectUniformBuffer {
        resolution: [width as f32, height as f32],
        direction: [0.0, 0.0],
        scalars: [hue_center, hue_width, sat_center, sat_width],
        scalars_b: [lum_center, lum_width, softness, 0.0],
    })
}

fn pack_luma_curve_uniforms(
    pass: &EffectPass,
    width: u32,
    height: u32,
) -> Result<EffectUniformBuffer, EffectsError> {
    let y0 = read_number_uniform(pass, "u_y0")?;
    let y1 = read_number_uniform(pass, "u_y1")?;
    let y2 = read_number_uniform(pass, "u_y2")?;
    let y3 = read_number_uniform(pass, "u_y3")?;
    let y4 = read_number_uniform(pass, "u_y4")?;
    reject_unexpected_uniforms(pass, &["u_y0", "u_y1", "u_y2", "u_y3", "u_y4"])?;

    Ok(EffectUniformBuffer {
        resolution: [width as f32, height as f32],
        direction: [0.0, 0.0],
        scalars: [y0, y1, y2, y3],
        scalars_b: [y4, 0.0, 0.0, 0.0],
    })
}

fn pack_lut_uniforms(
    pass: &EffectPass,
    width: u32,
    height: u32,
) -> Result<EffectUniformBuffer, EffectsError> {
    let intensity = read_number_uniform(pass, "u_intensity")?;
    // u_lut_data is consumed separately by create_lut_texture (it needs a
    // real GPU texture, not a slot in the small fixed-size uniform buffer)
    // but is still a legitimate, expected uniform for this shader.
    reject_unexpected_uniforms(pass, &["u_intensity", "u_lut_data"])?;

    Ok(EffectUniformBuffer {
        resolution: [width as f32, height as f32],
        direction: [0.0, 0.0],
        scalars: [intensity, 0.0, 0.0, 0.0],
        scalars_b: [0.0; 4],
    })
}

/// Builds the tiled-2D GPU texture backing a 3D LUT lookup from a flattened
/// RGB array. `u_lut_data` must have LUT_SIZE^3 * 3 floats, laid out in
/// `.cube`-file order: red fastest-varying, then green, then blue --
/// `data[((b * LUT_SIZE + g) * LUT_SIZE + r) * 3 + channel]`. The texture
/// layout (LUT_SIZE tiles of LUT_SIZE x LUT_SIZE, one tile per blue slice,
/// laid out along X) must match lut_3d.wgsl's texel-index math exactly --
/// covered by lut.rs's pixel tests, not just "does it compile".
fn create_lut_texture(
    context: &GpuContext,
    pass: &EffectPass,
) -> Result<wgpu::Texture, EffectsError> {
    let Some(value) = pass.uniforms.get("u_lut_data") else {
        return Err(EffectsError::MissingUniform {
            shader: pass.shader.clone(),
            uniform: "u_lut_data".to_string(),
        });
    };
    let UniformValue::Vector(data) = value else {
        return Err(EffectsError::InvalidLutData {
            shader: pass.shader.clone(),
            uniform: "u_lut_data".to_string(),
            lut_size: LUT_SIZE,
            expected_length: LUT_DATA_LEN,
            actual_length: 1,
        });
    };
    if data.len() != LUT_DATA_LEN {
        return Err(EffectsError::InvalidLutData {
            shader: pass.shader.clone(),
            uniform: "u_lut_data".to_string(),
            lut_size: LUT_SIZE,
            expected_length: LUT_DATA_LEN,
            actual_length: data.len(),
        });
    }

    let width = (LUT_SIZE * LUT_SIZE) as u32;
    let height = LUT_SIZE as u32;
    let mut bytes = vec![0u8; (width * height * 4) as usize];
    for g in 0..LUT_SIZE {
        for column in 0..(LUT_SIZE * LUT_SIZE) {
            let b = column / LUT_SIZE;
            let r = column % LUT_SIZE;
            let data_index = ((b * LUT_SIZE + g) * LUT_SIZE + r) * 3;
            let texel_index = (g * (LUT_SIZE * LUT_SIZE) + column) * 4;
            bytes[texel_index] = to_unorm_byte(data[data_index]);
            bytes[texel_index + 1] = to_unorm_byte(data[data_index + 1]);
            bytes[texel_index + 2] = to_unorm_byte(data[data_index + 2]);
            bytes[texel_index + 3] = 255;
        }
    }

    let texture = context.device().create_texture(&wgpu::TextureDescriptor {
        label: Some("effects-lut-texture"),
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    context.queue().write_texture(
        wgpu::TexelCopyTextureInfo {
            texture: &texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        &bytes,
        wgpu::TexelCopyBufferLayout {
            offset: 0,
            bytes_per_row: Some(width * 4),
            rows_per_image: Some(height),
        },
        wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
    );

    Ok(texture)
}

fn to_unorm_byte(value: f32) -> u8 {
    (value.clamp(0.0, 1.0) * 255.0).round() as u8
}

fn read_number_uniform(pass: &EffectPass, uniform: &str) -> Result<f32, EffectsError> {
    let Some(value) = pass.uniforms.get(uniform) else {
        return Err(EffectsError::MissingUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
        });
    };
    match value {
        UniformValue::Number(value) => Ok(*value),
        UniformValue::Vector(_) => Err(EffectsError::InvalidNumberUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
        }),
    }
}

fn read_vec2_uniform(pass: &EffectPass, uniform: &str) -> Result<[f32; 2], EffectsError> {
    let Some(value) = pass.uniforms.get(uniform) else {
        return Err(EffectsError::MissingUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
        });
    };
    let UniformValue::Vector(values) = value else {
        return Err(EffectsError::InvalidVectorUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
            expected_length: 2,
        });
    };
    if values.len() != 2 {
        return Err(EffectsError::InvalidVectorUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
            expected_length: 2,
        });
    }
    Ok([values[0], values[1]])
}
