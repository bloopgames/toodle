import { Toodle } from "@bloop.gg/toodle";

const canvas = document.querySelector("canvas")!;

const toodle = await Toodle.attach(canvas, {
  filter: "nearest",
  limits: { textureArrayLayers: 5 },
});

await toodle.assets.loadTextures({
  mushroom: new URL("https://toodle.gg/img/Mushroom.png"),
});

const shader = toodle.QuadShader(
  // this is a label for debugging
  "default extended",
  // this is the number of instances that can use this shader.
  // note that this will allocate buffers up front when the shader is defined.
  1,
  // this is the wgsl code for the shader.
  // we recommend adding https://marketplace.cursorapi.com/items?itemName=ggsimm.wgsl-literal
  // for syntax highlighting.
  /*wgsl*/ `
@vertex
fn vert(
  @builtin(vertex_index) VertexIndex: u32,
  @builtin(instance_index) InstanceIndex: u32,
  instance: InstanceData,
) -> VertexOutput {
  var vertex = default_vertex_shader(VertexIndex, InstanceIndex,instance);
  return vertex;
}

@fragment
fn frag(vertex: VertexOutput) -> @location(0) vec4f {
  let color = default_fragment_shader(vertex, nearestSampler);
  return color;
}
  `,
);

toodle.clearColor = { r: 0.7, g: 0.7, b: 0.7, a: 1 };
const quad = toodle.Quad("mushroom", {
  scale: { x: 4, y: 4 },
  position: { x: -100, y: 0 },
});

const quadWithShader = toodle.Quad("mushroom", {
  scale: { x: 4, y: 4 },
  position: { x: 100, y: 0 },
  shader,
});

console.log(shader.code);

async function frame() {
  toodle.startFrame();
  toodle.draw(quad);
  toodle.draw(quadWithShader);
  toodle.endFrame();
  requestAnimationFrame(frame);
}

frame();
