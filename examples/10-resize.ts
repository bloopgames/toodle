import { Toodle } from "../src/Toodle";
import { createCanvas } from "./util";

const canvas = createCanvas(window.innerWidth, window.innerHeight);

const toodle = await Toodle.attach(canvas, { filter: "nearest" });

await toodle.assets.loadTexture(
  "test",
  new URL("/img/MarioIdle.png", import.meta.url),
);

canvas.style.width = "100vw";
canvas.style.height = "100vh";

const shape = toodle.shapes.Rect({
  size: { width: 100, height: 100 },
  color: { r: 1, g: 0, b: 0, a: 1 },
});

shape.add(
  toodle.shapes.Rect({
    size: { width: 1, height: 1 },
    color: { r: 0, g: 0, b: 0, a: 1 },
  }),
);

function frame() {
  toodle.startFrame();
  // this should take up the whole screen minus one pixel on each side
  toodle.draw(
    toodle.shapes.Rect({
      size: {
        width: toodle.resolution.width - 2,
        height: toodle.resolution.height - 2,
      },
      color: { r: 0.6, g: 0.6, b: 0.6, a: 1 },
    }),
  );

  // this should be a 100x100 red square in the center with a 1x1 black pixel in the middle
  toodle.draw(shape);

  // these should be cyan rects that are at the top left and bottom right of the screen
  toodle.draw(
    toodle.shapes.Rect({
      size: { width: 10, height: 10 },
      color: { r: 0, g: 1, b: 1, a: 1 },
      position: {
        x: -toodle.resolution.width / 2 + 10 / 2 + 1,
        y: toodle.resolution.height / 2 - 10 / 2 - 1,
      },
    }),
  );
  toodle.draw(
    toodle.shapes.Rect({
      size: { width: 10, height: 10 },
      color: { r: 0, g: 1, b: 1, a: 1 },
      position: {
        x: toodle.resolution.width / 2 - 10 / 2 - 1,
        y: -toodle.resolution.height / 2 + 10 / 2 + 1,
      },
    }),
  );

  toodle.endFrame();
  requestAnimationFrame(frame);
}
frame();
