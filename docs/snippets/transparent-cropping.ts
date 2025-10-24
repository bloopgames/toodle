import { Toodle } from "@bloop.gg/toodle";

const canvas = document.querySelector("canvas")!;
const toodle = await Toodle.attach(canvas, {
  limits: { textureArrayLayers: 5 },
});

const baseUrl = "https://toodle.gg";

// State for demo
const state = {
  useOptimized: true,
  showAtlas: false,
};

const texturesToCrop = {
  Mew: new URL("/img/MewTransparentExample.png", baseUrl),
  Mew1: new URL("/img/MewTransparentExample.png", baseUrl),
  Mew2: new URL("/img/MewTransparentExample.png", baseUrl),
  Mew3: new URL("/img/MewTransparentExample.png", baseUrl),
  Mew4: new URL("/img/MewTransparentExample.png", baseUrl),
  Mew5: new URL("/img/MewTransparentExample.png", baseUrl),
  Mew6: new URL("/img/MewTransparentExample.png", baseUrl),
  Mew7: new URL("/img/MewTransparentExample.png", baseUrl),
  Mew8: new URL("/img/MewTransparentExample.png", baseUrl),
  Mew9: new URL("/img/MewTransparentExample.png", baseUrl),
  Mew10: new URL("/img/MewTransparentExample.png", baseUrl),
};

const texturesUncropped = {
  MewTwo: new URL("/img/MewTransparentExample.png", baseUrl),
  MewTwo2: new URL("/img/MewTransparentExample.png", baseUrl),
  MewTwo3: new URL("/img/MewTransparentExample.png", baseUrl),
  MewTwo4: new URL("/img/MewTransparentExample.png", baseUrl),
  MewTwo5: new URL("/img/MewTransparentExample.png", baseUrl),
};

// Cropping of extra alpha pixels is opt-in for now
await toodle.assets.registerBundle("croppedTextures", {
  textures: texturesToCrop,
  cropTransparentPixels: true,
  autoLoad: true,
});

// By default, we will not crop the extra alpha pixels
// this may change in the future once cropping is well-tested
await toodle.assets.registerBundle("baseTextures", {
  textures: texturesUncropped,
  autoLoad: true,
});

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

const showTransparentPixelsShader = toodle.QuadShader(
  "show transparent pixels",
  toodle.limits.instanceCount,
  /*wgsl*/ `
@fragment
fn fragment(vertex: VertexOutput) -> @location(0) vec4f {
  let color = default_fragment_shader(vertex, nearestSampler);
  return mix(vec4f(1.0, 0.0, 1.0, 0.2), color, step(0.1, color.a));
}
  `,
);

function frame() {
  toodle.startFrame();

  if (!state.showAtlas) {
    const textureId = state.useOptimized ? "Mew" : "MewTwo";

    toodle.draw(
      toodle.Quad(textureId, { shader: showTransparentPixelsShader }),
    );
    toodle.draw(
      toodle
        .Quad(textureId, {
          shader: showTransparentPixelsShader,
          scale: 0.15,
        })
        .setBounds({
          left: -toodle.resolution.width / 2,
          top: toodle.resolution.height / 2,
        }),
    );

    toodle.draw(
      toodle
        .Quad(textureId, {
          shader: showTransparentPixelsShader,
          scale: 0.18,
        })
        .setBounds({
          right: toodle.resolution.width / 2,
          bottom: -toodle.resolution.height / 2,
        }),
    );

    toodle.draw(
      toodle
        .Quad(textureId, {
          shader: showTransparentPixelsShader,
          idealSize: { width: 50, height: 50 },
        })
        .setBounds({
          left: -toodle.resolution.width / 2,
          bottom: -toodle.resolution.height / 2,
        }),
    );

    toodle.draw(
      toodle
        .Quad(textureId, {
          shader: showTransparentPixelsShader,
          idealSize: { width: 50, height: 50 },
          rotation: 45,
        })
        .setBounds({
          right: toodle.resolution.width / 2,
          top: toodle.resolution.height / 2,
        }),
    );
  } else {
    if (state.useOptimized) {
      toodle.draw(
        toodle.Quad("Mew", {
          idealSize: { width: 400, height: 400 },
          shader: atlasPreviewShader,
        }),
      );
    } else {
      toodle.draw(
        toodle.Quad("MewTwo", {
          idealSize: { width: 400, height: 400 },
          shader: atlasPreviewShader,
        }),
      );
    }
  }

  toodle.endFrame();

  requestAnimationFrame(frame);
}

frame();

//
// UI elements for demo
//

canvas.before(
  makeButton("Cropped", (button) => {
    state.useOptimized = !state.useOptimized;
    button.textContent = state.useOptimized ? "Cropped" : "Uncropped";
  }),
);

canvas.before("<br />");

canvas.before(
  makeButton("Scene", (button) => {
    state.showAtlas = !state.showAtlas;
    button.textContent = state.showAtlas ? "Atlas" : "Scene";
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
