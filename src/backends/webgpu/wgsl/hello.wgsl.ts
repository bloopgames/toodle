// this is a shader that draws a fullscreen magenta quad
// it can be used to test a pipeline with no vertex buffers or uniforms
export default /*wgsl*/ `

//
// SECTION: Struct Definitions
//

struct InstanceData {}


struct VertexInput {
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
}

struct VertexOutput {
  @builtin(position) engine_clip_position : vec4<f32>,
}

struct FragmentInput {
  @builtin(position) engine_clip_position : vec4<f32>,
}

struct FragmentOutput {
  color: vec4<f32>,
}

//
// SECTION: Base Entrypoints
//

@vertex
fn base_vertex_entrypoint(input: VertexInput) -> VertexOutput {
  return default_vertex_shader(input);
}

@fragment
fn base_fragment_entrypoint(vertex: VertexOutput) -> @location(0) vec4<f32> {
  let output = base_fragment_shader(vertex);
  return output.color;
}

//
// SECTION: Base Shaders
//

const pos = array(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(1, 1));

fn base_vertex_shader(input: VertexInput) -> VertexOutput {
  var output : VertexOutput;
  output.engine_clip_position = vec4f(pos[input.vertexIndex], 0.0, 1.0);
  return output;
}

fn base_fragment_shader(vertex: VertexOutput) -> FragmentOutput {
  var output : FragmentOutput;
  output.color = vec4f(1.0, 0.0, 1.0, 1.0);
  return output;
}

`;
