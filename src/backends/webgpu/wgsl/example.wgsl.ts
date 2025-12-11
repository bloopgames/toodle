// this is an example custom quad shader that returns defaults, tinting the red channel

export default /*wgsl*/ `
struct MyStuff {
  red: f32,
}

@vertex
fn vert(
  @builtin(vertex_index) VertexIndex: u32,
  @builtin(instance_index) InstanceIndex: u32,
  instance: InstanceData
) -> VertexOutput {
  var output = default_vertex_shader(VertexIndex, InstanceIndex, instance);
  return output;
}

@fragment
fn frag(vertex: VertexOutput) -> @location(0) vec4f {
  let color = default_fragment_shader(vertex);
  color.r = vertex.myStuff_red;
  return color;
}
`;
