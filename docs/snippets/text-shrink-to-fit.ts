import { Toodle } from "@bloopjs/toodle";

const canvas = document.querySelector("canvas")!;
const toodle = await Toodle.attach(canvas, {
  limits: { textureArrayLayers: 5 },
});

await toodle.assets.loadFont(
  "ComicNeue",
  new URL("https://toodle.gg/fonts/ComicNeue-Regular-msdf.json"),
);

const white = { r: 1, g: 1, b: 1, a: 1 };
const blue = { r: 0, g: 0, b: 1, a: 1 };

const background = toodle.shapes.Rect({
  size: { width: 400, height: 400 },
  color: blue,
});

const text = background.add(
  toodle.Text("ComicNeue", "This text should be shrunk to fit.", {
    color: white,
    fontSize: 1000,
    align: "center",
    shrinkToFit: {
      padding: 0.1,
      minFontSize: 10,
      maxFontSize: 100,
      maxLines: 10,
    },
    size: background.size,
  }),
);

function frame() {
  toodle.startFrame();
  toodle.draw(background);
  const width = 200 + Math.sin(performance.now() / 1000) * 200;
  background.size = { width, height: background.size.height };
  text.size = {
    width,
    height: background.size.height,
  };
  toodle.endFrame();
  requestAnimationFrame(frame);
}

frame();
