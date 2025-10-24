# Default Shader

::: warning Unstable API

The API for defining shaders is likely to change as we get usage feedback.

Areas that are likely to change:

- Function signature for custom vertex shaders
- How you define, write and read vertex data and custom uniforms
- How you compose wgsl

:::

Quads use the default shader if no shader is specified, and extend the default shader when you create a custom shader.

You can always log the full shader source generated with

```ts
console.log(shader.code);
```

{toodle=snippets/shader-default.ts width=400px height=400px}

<<< @/snippets/shader-default.ts

If you're new to writing shaders, reading the default shader code will **not** be a friendly introduction to wgsl and we recommend looking at examples of custom shaders instead.

If you're familiar with graphics programming and would like to know what is happening under the hood of Toodle, this is the shader code:

```wgsl
struct InstanceData {
  // location 0-2 are the model matrix for this instanced quad
  @location(0) model0: vec4<f32>,
  @location(1) model1: vec4<f32>,
  @location(2) model2: vec4<f32>,
  // location 3 is the tint - the color will be multiplied by the texture color to determine the pixel color
  @location(3) engine_tint: vec4<f32>,
  // location 4 are the uv offset and scale used to sample the texture atlas
  @location(4) uvOffsetAndScale: vec4<f32>,
  // location 5 is the atlas index
  @location(5) atlasIndex: u32,
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
  let modelMatrix = mat3x3(instance.model0.xyz, instance.model1.xyz, instance.model2.xyz);
  let worldPosition = modelMatrix * vec3f(enginePosLookup[VertexIndex], 1.0);
  let clipPosition = engineUniform.viewProjection * worldPosition;

  output.engine_clip_position = vec4f(clipPosition, 1.0);
  output.engine_tint = instance.engine_tint;
  output.engine_atlasIndex = u32(instance.atlasIndex);
  let original_uv = engineUvLookup[VertexIndex];
  let atlas_uv = original_uv * instance.uvOffsetAndScale.zw + instance.uvOffsetAndScale.xy;
  output.engine_uv = vec4f(atlas_uv, original_uv);
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
    return vec4f(1,1,1,1) * vertex.engine_tint;
  } else if (vertex.engine_atlasIndex == 1001u) {
    // circle:
    // edge width is 4 pixels
    let edgeWidth = 4. / max(engineUniform.resolution.x, engineUniform.resolution.y);
    // distance from center of the quad ranging from [0,1]
    let centerDistance = 2 * distance(vec2f(0.5, 0.5), original_uv);
    // alpha is 1 before edgeWidth and 0 after edgeWidth
    let alpha = 1. - smoothstep(1. - edgeWidth, 1. + edgeWidth, centerDistance);
    return vec4f(vertex.engine_tint.rgb, alpha);
  } else {
    return color * vertex.engine_tint;
  }
}

//==========
// this is where our vertex shader and fragment shader entrypoints get appended

@vertex fn vert( @builtin(vertex_index) VertexIndex: u32, @builtin(instance_index) InstanceIndex: u32, instance: InstanceData, ) -> VertexOutput {
  var vertex = default_vertex_shader(VertexIndex, InstanceIndex,instance);
  return vertex;
}

@fragment fn frag(vertex: VertexOutput) -> @location(0) vec4f {
  let color = default_fragment_shader(vertex, nearestSampler);
  return color;
}
```
