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
  "color flash",
  // this is the number of instances that can use this shader.
  // note that if you are defining your own data, defining the shader will
  // allocate the worst case number of instances up front.
  3,
  // this is the wgsl code for the shader.
  // we recommend adding https://marketplace.cursorapi.com/items?itemName=ggsimm.wgsl-literal
  // for syntax highlighting.
  /*wgsl*/ `

// the first struct you specify will be defined as instance data in the vertex instance buffer
// and passed through from the vertex shader to the fragment shader
struct Flash {
  color: vec4f,
  intensity: f32
}

// specifying a fragment entrypoint will override the default fragment shader
@fragment
fn frag(vertex: VertexOutput) -> @location(0) vec4f {
  // default_fragment_shader will return the color of the pixel as sampled from the texture.
  // nearestSampler is a sampler that uses nearest neighbor filtering, you can also use linearSampler
  let color = default_fragment_shader(vertex, nearestSampler);
  // mix is a function that linearly interpolates between two values.
  // here we are interpolating between the color of the pixel and the flash color
  // based on the flash intensity.
  // notice that flash_intensity is defined in the struct above and passed along as vertex instance data.
  let flashColor = mix(color.rgb, vertex.flash_color.rgb, vertex.flash_intensity);
  // return the flash color with the original alpha value.
  return vec4f(flashColor, color.a);
}
  `,
);

const quad = toodle.Quad("mushroom", {
  scale: { x: 4, y: 4 },
  position: { x: 10, y: 10 },
  shader,
  writeInstance: (array, offset) => {
    // this is how you write data to the instance buffer.
    // there is not yet a semantic way to map to the struct you defined above,
    // so you'll have to do some low-level math to get the data in the right place for now.
    const intensity = Math.sin(toodle.diagnostics.frames / 100);
    array.set([1, 0, 1, 1], offset);
    array.set([intensity], offset + 4);
  },
});

async function frame() {
  toodle.startFrame();
  toodle.draw(quad);
  toodle.endFrame();
  requestAnimationFrame(frame);
}

frame();
