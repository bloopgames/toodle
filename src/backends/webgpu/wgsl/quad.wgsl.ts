export default /*wgsl*/ `
struct InstanceData {
  // location 0-2 are the model matrix for this instanced quad
  @location(0) model0: vec4<f32>,
  @location(1) model1: vec4<f32>,
  @location(2) model2: vec4<f32>,
  // location 3 is the tint - the color will be multiplied by the texture color to determine the pixel color
  @location(3) engine_tint: vec4<f32>,
  // location 4 are the uv offset and scale used to sample the texture atlas. these are in normalized texel coordinates.
  @location(4) uvOffsetAndScale: vec4<f32>,
  // location 5 is the crop offset from center and scale. These are ratios applied to the unit quad.
  @location(5) cropOffsetAndScale: vec4<f32>,
  // location 6 is the atlas index
  @location(6) atlasIndex: u32,
  // @INSTANCE_DATA SNIPPET
}

struct VertexInput {
  @builtin(vertex_index) VertexIndex: u32,
  @builtin(instance_index) InstanceIndex: u32,
  instance: InstanceData
}

struct VertexOutput {
  @builtin(position) engine_clip_position : vec4<f32>,
  // uv coordinates are stored as two vec2s:
  // [0,1] = atlas uv coords
  // [2,3] = uv scale
  @location(0) engine_uv: vec4<f32>,
  @location(1) @interpolate(flat) engine_tint: vec4<f32>,
  @location(2) @interpolate(flat) engine_atlasIndex: u32,
  // @VERTEX_OUTPUT SNIPPET
}

struct EngineUniform {
  viewProjection: mat3x3<f32>,
  resolution: vec2f,
};

// we can't divide by 2 in the projection matrix because
// it will affect the positioning as well as the geometry scale
// so we need to divide by 2 for the initial position scale.
// for eg a 10x10 quad in the top left of a 100x100 logical canvas with a 200x200 natural size
// will be passed in as
// position=[-45, 45]
// scale=[10,10]
// so the top left corner will be: (-0.5 * 10 - 45) * 2 / 100 = -1
// if the top left vertex was -1, it would be: (-1 * 10 - 45) * 2 / 100 = -1.1
const enginePosLookup = array(vec2f(-0.5, 0.5), vec2f(-0.5, -0.5), vec2f(0.5, 0.5), vec2f(0.5, -0.5));
const engineUvLookup = array(vec2f(0, 0), vec2f(0, 1), vec2f(1, 0), vec2f(1, 1));

@group(0) @binding(0) var<uniform> engineUniform: EngineUniform;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var nearestSampler: sampler;

@group(1) @binding(0) var textureArray: texture_2d_array<f32>;

@vertex
fn engine_vs(
  @builtin(vertex_index) VertexIndex: u32,
  @builtin(instance_index) InstanceIndex: u32,
  instance: InstanceData
) -> VertexOutput {
  var output = default_vertex_shader(VertexIndex, InstanceIndex,instance);
  return output;
}

@fragment
fn engine_fs(vertex: VertexOutput) -> @location(0) vec4<f32> {
  return default_fragment_shader(vertex, nearestSampler);
}

fn default_vertex_shader(
  VertexIndex: u32,
  InstanceIndex: u32,
  instance: InstanceData
) -> VertexOutput {
  var output : VertexOutput;
  output.engine_tint = instance.engine_tint;

  // reconstruct the model matrix from the instance data
  // bc we can't pass a mat3x3 as instance data
  let modelMatrix = mat3x3(instance.model0.xyz, instance.model1.xyz, instance.model2.xyz);

  // transform the vertex position
  let localPosition = enginePosLookup[VertexIndex];
  let cropOffset = instance.cropOffsetAndScale.xy;
  let cropScale = instance.cropOffsetAndScale.zw;
  let croppedPosition = localPosition * cropScale + cropOffset;
  let worldPosition = modelMatrix * vec3f(croppedPosition, 1.0);
  let clipPosition = engineUniform.viewProjection * worldPosition;
  output.engine_clip_position = vec4f(clipPosition, 1.0);

  // set the uv coordinates in the texture atlas.
  let original_uv = engineUvLookup[VertexIndex];
  // uvOffsetAndScale is a vec4 with the following values:
  // [0,1] = uv offset
  // [2,3] = uv scale
  let atlas_uv = original_uv * instance.uvOffsetAndScale.zw * cropScale + instance.uvOffsetAndScale.xy;
  // we also pack the original uv coordinates in the w and z components
  // since these can be useful in the fragment shader
  output.engine_uv = vec4f(atlas_uv, original_uv);
  output.engine_atlasIndex = u32(instance.atlasIndex);
  // @PASSTHROUGH_SNIPPET

  return output;
}

fn default_fragment_shader(vertex: VertexOutput, samp: sampler) -> vec4<f32> {
  let atlas_uv = vertex.engine_uv.xy;
  let original_uv = vertex.engine_uv.zw;

  // Force both samplers to be referenced without assignment
  // This prevents WGSLReflect from optimizing them away
  var nope: bool = false;
  if (nope) {
    _ = linearSampler;
    _ = nearestSampler;
  }

  let color = textureSample(textureArray, samp, atlas_uv, vertex.engine_atlasIndex);

  if (vertex.engine_atlasIndex == 1000u) {
    // rectangle - return a solid color
    return vec4f(1,1,1,1) * vertex.engine_tint;
  } else if (vertex.engine_atlasIndex == 1001u) {
    // circle:
    // edge width is 4 logical pixels
    let edgeWidth = 4. / max(engineUniform.resolution.x, engineUniform.resolution.y);
    // distance from center of the quad ranging from [0,1]
    let centerDistance = 2 * distance(vec2f(0.5, 0.5), original_uv);
    // alpha is 1 before edgeWidth and 0 after edgeWidth
    let alpha = 1. - smoothstep(1. - edgeWidth, 1. + edgeWidth, centerDistance);
    return vec4f(vertex.engine_tint.rgb, alpha * vertex.engine_tint.a);
  } else {
    // texture:
    return color * vertex.engine_tint;
  }
}
`;
