import { Toodle } from "@bloop.gg/toodle";

const canvas = document.querySelector("canvas")!;
const toodle = await Toodle.attach(canvas, {
  limits: { textureArrayLayers: 5 },
});
await toodle.assets.loadFont(
  "ComicNeue",
  new URL("https://toodle.gg/fonts/ComicNeue-Regular-msdf.json"),
);

const black = { r: 0, g: 0, b: 0, a: 1 };

const nodes = [
  toodle.Node({
    position: { x: -200, y: 50 },
    kids: [
      toodle.Text("ComicNeue", "Left aligned\nbased on line widths", {
        color: black,
        fontSize: 14,
        align: "left",
      }),
    ],
  }),
  toodle.Node({
    position: { x: 0, y: 50 },
    kids: [
      toodle.Text("ComicNeue", "Center aligned\nbased on line widths", {
        color: black,
        fontSize: 14,
        align: "center",
      }),
    ],
  }),
  toodle.Node({
    position: { x: 200, y: 50 },
    kids: [
      toodle.Text("ComicNeue", "Right aligned\nbased on line widths", {
        color: black,
        fontSize: 14,
        align: "right",
      }),
    ],
  }),
];

toodle.startFrame();

for (const node of nodes) {
  toodle.draw(node);
}

toodle.draw(
  toodle.Text("ComicNeue", "No effect without bounding box (l)", {
    color: black,
    position: { x: 0, y: -14 },
    fontSize: 14,
    align: "left",
  }),
);

toodle.draw(
  toodle.Text("ComicNeue", "No effect without bounding box (c)", {
    color: black,
    position: { x: 0, y: -28 },
    fontSize: 14,
    align: "center",
  }),
);

toodle.draw(
  toodle.Text("ComicNeue", "No effect without bounding box (r)", {
    color: black,
    position: { x: 0, y: -42 },
    fontSize: 14,
    align: "right",
  }),
);

toodle.endFrame();
