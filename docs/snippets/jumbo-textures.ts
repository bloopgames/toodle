import { Toodle } from "@bloop.gg/toodle";

const canvas = document.querySelector("canvas")!;
const toodle = await Toodle.attach(canvas, {
  limits: { textureArrayLayers: 5 },
});

await toodle.assets.registerBundle("stage", {
  textures: {
    tile0: new URL("/jumbo/stage_0_0.png", "https://toodle.gg"),
    tile1: new URL("/jumbo/stage_4096_0.png", "https://toodle.gg"),
  },
  autoLoad: true,
  cropTransparentPixels: true,
});

// State for demo
const state = {
  showAtlas: false,
  atlasIndex: 0,
};

const atlasPreviewShader = toodle.QuadShader(
  "texture atlas viewer",
  toodle.limits.instanceCount,
  /*wgsl*/ `
  @vertex
  fn vert(
    @builtin(vertex_index) VertexIndex: u32,
    @builtin(instance_index) InstanceIndex: u32,
    instance: InstanceData,
  ) -> VertexOutput {
    var output = default_vertex_shader(VertexIndex, InstanceIndex, instance);
    // set uv coordinates to range the whole atlas texture and not the bounds
    output.engine_uv.x = output.engine_uv.z;
    output.engine_uv.y = output.engine_uv.w;
    return output;
  }

  @fragment
  fn fragment(vertex: VertexOutput) -> @location(0) vec4f {
    let color = default_fragment_shader(vertex, nearestSampler);
    return mix(vec4f(1.0, 0.0, 1.0, 1.0), color, step(0.1, color.a));
  }
`,
);

function frame() {
  toodle.startFrame();
  if (state.showAtlas) {
    toodle.draw(
      toodle.Quad("tile0", {
        shader: atlasPreviewShader,
        idealSize: {
          width: toodle.resolution.width,
          height: toodle.resolution.height,
        },
      }),
    );
    toodle.camera.x = 0;
  } else {
    toodle.draw(
      toodle.JumboQuad("stage", {
        tiles: [
          {
            textureId: "tile0",
            offset: { x: 0, y: 0 },
          },
          {
            textureId: "tile1",
            offset: { x: 4096, y: 0 },
          },
        ],
      }),
    );
    toodle.camera.x = Math.sin(toodle.frameCount / 700) * 2000;
    toodle.camera.zoom = 0.3;
  }
  toodle.endFrame();
  requestAnimationFrame(frame);
}

frame();

//
// UI elements for demo
//

canvas.before(
  makeButton("Show Atlas", (button) => {
    state.showAtlas = !state.showAtlas;
    button.textContent = state.showAtlas ? "Show Atlas" : "Show Texture";
  }),
);

function makeButton(
  text: string,
  onClick: (button: HTMLButtonElement) => void,
) {
  const button = document.createElement("button");
  button.textContent = text;
  button.style.marginRight = "2vw";
  button.style.backgroundColor = "whitesmoke";
  button.style.border = "1px solid grey";
  button.style.padding = "0.4rem";
  button.addEventListener("click", (e) => {
    onClick(e.currentTarget as HTMLButtonElement);
  });
  return button;
}
