import { Toodle } from "@bloop.gg/toodle";

const canvas = document.querySelector("canvas")!;
const toodle = await Toodle.attach(canvas, {
  limits: { textureArrayLayers: 5 },
});

const fontId = await toodle.assets.loadFont(
  "ComicNeue",
  new URL("https://toodle.gg/fonts/ComicNeue-Regular-msdf.json"),
);

const black = { r: 0, g: 0, b: 0, a: 1 };

const em2px = 14 / toodle.assets.getFont(fontId).font.lineHeight;
const emWidth = 120;

const characterWrapText = toodle.Text(
  "ComicNeue",
  "This is a long sentence that wraps at the character level.",
  {
    color: black,
    fontSize: 14,
    position: { x: -200, y: 0 },
    align: "center",
    // maxLineWidth in ems
    wordWrap: {
      emWidth,
      breakOn: "character",
    },
  },
);

const wordWrapText = toodle.Text(
  "ComicNeue",
  "This is a long sentence that wraps at the word level.",
  {
    color: black,
    fontSize: 14,
    position: { x: 200, y: 0 },
    align: "center",
    wordWrap: {
      emWidth,
      breakOn: "word",
    },
  },
);

const backgrounds = toodle.Node({
  kids: [
    toodle.shapes.Rect({
      idealSize: { width: emWidth * em2px, height: 225 },
      position: { x: -200, y: 0 },
      color: { r: 1, g: 0, b: 0, a: 0.2 },
    }),
    toodle.shapes.Rect({
      idealSize: { width: emWidth * em2px, height: 225 },
      position: { x: 200, y: 0 },
      color: { r: 1, g: 0, b: 0, a: 0.2 },
    }),
  ],
});

toodle.startFrame();
toodle.draw(characterWrapText);
toodle.draw(wordWrapText);
toodle.draw(backgrounds);
toodle.endFrame();
