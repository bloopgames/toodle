import { Toodle } from "@bloop.gg/toodle";

const canvas = document.querySelector("canvas")!;
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

function frame() {
  toodle.startFrame();
  text.rotation += 1;
  toodle.draw(text);
  toodle.endFrame();

  requestAnimationFrame(frame);
}

frame();
