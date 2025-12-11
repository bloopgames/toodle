import { Toodle } from "../src/Toodle";
import { Palette, createCanvas } from "./util";

const canvas = createCanvas(window.innerWidth, window.innerHeight);
const toodle = await Toodle.attach(canvas);

toodle.clearColor = Palette.LIGHT_STEEL_BLUE;

await toodle.assets.loadFont(
  "ComicNeue",
  new URL("/fonts/ComicNeue-Regular-msdf.json", window.location.href),
);

const fontShader = toodle.assets.getFont("ComicNeue");
const msdfFont = fontShader.font;

toodle.clearColor = Palette.LIGHT_STEEL_BLUE;

const alignmentTexts = [
  toodle.Text("ComicNeue", "Left align single line", {
    position: { x: 0, y: 16 },
    fontSize: 16,
    align: "left",
  }),
  toodle.Text("ComicNeue", "Center align single line", {
    position: { x: 0, y: 0 },
    fontSize: 16,
    align: "center",
  }),
  toodle.Text("ComicNeue", "Right align single line", {
    position: { x: 0, y: -16 },
    fontSize: 16,
    align: "right",
  }),
];

const screen = {
  width: window.innerWidth,
  height: window.innerHeight,
};

const textBlockSize = {
  width: 300,
  height: 200,
};

const padding = 20;

const nodes = [
  toodle.Node({
    size: textBlockSize,
    position: {
      x: padding + -screen.width / 2 + textBlockSize.width / 2,
      y: -padding + screen.height / 2 - textBlockSize.height / 2,
    },
  }),
  toodle.Node({
    size: textBlockSize,
    position: {
      x: 0,
      y: -padding + screen.height / 2 - textBlockSize.height / 2,
    },
  }),
  toodle.Node({
    size: textBlockSize,
    position: {
      x: screen.width / 2 - textBlockSize.width / 2 - padding,
      y: -padding + screen.height / 2 - textBlockSize.height / 2,
    },
  }),
];

nodes[0].add(
  toodle.shapes.Rect({
    size: textBlockSize,
    color: Palette.HOT_PINK,
    layer: -1,
  }),
);

nodes[1].add(
  toodle.shapes.Rect({
    size: textBlockSize,
    color: Palette.HOT_PINK,
    layer: -1,
  }),
);

nodes[2].add(
  toodle.shapes.Rect({
    size: textBlockSize,
    color: Palette.HOT_PINK,
    layer: -1,
  }),
);

nodes[0].add(
  toodle.Text(
    "ComicNeue",
    "Left align\nmultiple lines\nworks really well I guess",
    {
      align: "left",
      rotation: 0,
      fontSize: 14,
      size: textBlockSize,
    },
  ),
);

nodes[1].add(
  toodle.Text(
    "ComicNeue",
    "Center align\nmultiple lines\nworks really well I guess",
    {
      align: "center",
      size: textBlockSize,
    },
  ),
);

nodes[2].add(
  toodle.Text(
    "ComicNeue",
    "Right align\nmultiple lines\nworks really well I guess",
    {
      align: "right",
      size: textBlockSize,
      fontSize: 16,
    },
  ),
);

let frameNumber = 0;

const shouldAnimate =
  new URLSearchParams(window.location.search).get("shouldAnimate") !== null;

function frame() {
  toodle.startFrame();
  for (const node of nodes) {
    if (shouldAnimate) {
      // node.kids[1].rotation += 1;
      node.rotation += 1;
    }
    toodle.draw(node);
  }

  for (const text of alignmentTexts) {
    if (shouldAnimate) {
      text.rotation += 1;
    }
    toodle.draw(text);
  }
  toodle.endFrame();

  frameNumber++;
  if (shouldAnimate) {
    requestAnimationFrame(frame);
  }
}

frame();
