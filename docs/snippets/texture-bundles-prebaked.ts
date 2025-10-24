import { Toodle } from "@bloop.gg/toodle";

const canvas = document.querySelector("canvas")!;
const toodle = await Toodle.attach(canvas, {
  filter: "nearest",
  limits: {
    textureArrayLayers: 5,
  },
});

// const baseUrl = window.location.href;
const baseUrl = "https://toodle.gg";
const basePath = "/prebaked";
await toodle.assets.registerBundle("match_vfx", {
  atlases: [
    {
      // if you don't provide a png, the json file is assumed to be next to the png file
      json: new URL(`${basePath}/match_vfx-0.json`, baseUrl),
    },
    {
      // if you don't provide a json, the png file is assumed to be next to the json file
      png: new URL(`${basePath}/match_vfx-1.png`, baseUrl),
    },
  ],
  autoLoad: true,
});

toodle.clearColor = { r: 0, g: 0, b: 0, a: 1 };

let i = 0;

function frame() {
  toodle.startFrame();
  if (toodle.frameCount % 24 === 0) {
    i++;
    i %= 9;
  }

  toodle.draw(toodle.Quad(`vfx/clock/clockno_w_${i + 1}.png`));

  toodle.endFrame();
  requestAnimationFrame(frame);
}

frame();
