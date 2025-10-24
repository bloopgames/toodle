import { Toodle } from "@bloop.gg/toodle";
import { createCanvas } from "./util";

const canvas = createCanvas(window.innerWidth, window.innerHeight);
const toodle = await Toodle.attach(canvas, {
  limits: { textureArrayLayers: 5 },
});

const fontId = await toodle.assets.loadFont(
  "ComicNeue",
  new URL("https://toodle.gg/fonts/ComicNeue-Regular-msdf.json"),
);

const text = toodle.Text("ComicNeue", "Hello World", {
  fontSize: 16,
  color: { r: 0, g: 0, b: 0, a: 1 },
});

const text2 = toodle.Text("ComicNeue", "nice", {
  fontSize: 16,
  color: { r: 0, g: 0, b: 0, a: 1 },
  layer: 1,
  position: { x: 100, y: 100 },
});

function frame() {
  toodle.startFrame();
  toodle.draw(text);
  toodle.draw(text2);
  toodle.endFrame();

  requestAnimationFrame(frame);
}

frame();
