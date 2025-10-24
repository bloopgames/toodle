import { Toodle } from "@bloop.gg/toodle";

const canvas = document.querySelector("canvas")!;

const toodle = await Toodle.attach(canvas, {
  filter: "linear",
  limits: { textureArrayLayers: 5 },
});

await toodle.assets.registerBundle("chain", {
  textures: {
    chain: new URL("img/chain.png", "https://toodle.gg"),
  },
  autoLoad: true,
});

const shader = toodle.QuadShader(
  // this is a label for debugging
  "fill",
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
struct Fill {
  percent: f32,
}

// specifying a fragment entrypoint will override the default fragment shader
@fragment
fn frag(vertex: VertexOutput) -> @location(0) vec4f {
  // default_fragment_shader will return the color of the pixel as sampled from the texture.
  // linearSampler is a sampler that uses linear filtering, you can also use nearestSampler
  let color = default_fragment_shader(vertex, linearSampler);

  // engine_uv contains a vec4f:
  // engine_uv.xy = uv coordinates in the atlas. these are used to sample the texture.
  // engine_uv.zw = normalized uv coordinates. these range from 0,0 at the bottom left to 1,1 at the top right.
  let uv = vertex.engine_uv.zw;
  if (uv.x > vertex.fill_percent) {
    discard;
    // uncomment to visualize uvs
    // return vec4f(uv.x, 0., 0., 1.);
  }

  return color;
}
  `,
);

const intrinsicSize = toodle.assets.getSize("chain");
const quad = toodle.Quad("chain", {
  idealSize: {
    width: toodle.resolution.width,
    height:
      (toodle.resolution.width * intrinsicSize.height) / intrinsicSize.width,
  },
  shader,
  writeInstance: (array, offset) => {
    // this is how you write data to the instance buffer.
    // there is not yet a semantic way to map to the struct you defined above,
    // so you'll have to do some low-level math to get the data in the right place for now.
    const fillPercent = (Math.sin(toodle.diagnostics.frames / 100) + 1) / 2;

    // offset - 3 is a bug! this may be fixed in the future.
    // it seems that writeInstance assumes the first value of the struct will be a vec4f
    // and sets the offset to the wrong place if the first value is 4 bytes instead of 16.
    array.set([fillPercent], offset - 3);
  },
});

async function frame() {
  toodle.startFrame();
  toodle.draw(quad);
  toodle.endFrame();
  requestAnimationFrame(frame);
}

frame();
