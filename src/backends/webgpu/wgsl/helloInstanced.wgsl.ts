// this is a shader that can be used to test a pipeline with a vertex buffer with a step mode of instance

export default /*wgsl*/ `
// const pos = array(vec2f(-0.5, -0.5), vec2f(0.5, -0.5), vec2f(-0.5, 0.5), vec2f(0.5, 0.5));
const pos = array(vec2f(-0.5, 0.5), vec2f(-0.5, -0.5), vec2f(0.5, 0.5), vec2f(0.5, -0.5));

struct InstanceData {
  @location(0) model0: vec4<f32>,
  @location(1) model1: vec4<f32>,
  @location(2) model2: vec4<f32>,
  @location(3) color: vec4<f32>,
}
struct VertexOutput {
  @builtin(position) engine_clip_position : vec4<f32>,
  @location(0) @interpolate(flat) color: vec4<f32>,
}

struct EngineUniform {
  viewProjection: mat3x3<f32>,
};

@group(0) @binding(0) var<uniform> engineUniform: EngineUniform;


// this is the vertex shader
@vertex
fn vs(
  @builtin(vertex_index) VertexIndex : u32,
  @builtin(instance_index) InstanceIndex: u32,  // Instance ID for each instance
  instanceData: InstanceData,
) -> VertexOutput {
  var output : VertexOutput;
  let modelMatrix = mat3x3(instanceData.model0.xyz, instanceData.model1.xyz, instanceData.model2.xyz);
  let worldPosition = engineUniform.viewProjection * modelMatrix * vec3f(pos[VertexIndex], 1.0);

  output.engine_clip_position = vec4f(worldPosition, 1.0);
  output.color = instanceData.color;
  return output;
}

// this is the fragment shader
@fragment
fn fs(vertex: VertexOutput) -> @location(0) vec4<f32> {
  return vertex.color;
}
`;
