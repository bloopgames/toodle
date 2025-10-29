import { Toodle } from "../src/Toodle";
import { Colors } from "../src/mod";
import { createCanvas } from "./util";

const canvas = createCanvas(window.innerWidth, window.innerHeight);

const toodle = await Toodle.attach(canvas, { filter: "linear" });

await toodle.assets.loadTexture(
  "mew",
  new URL("/img/MewTransparentExample.png", import.meta.url),
);

const mouse = {
  x: 876,
  y: 138,
};

canvas.addEventListener("mousemove", (e) => {
  mouse.x = e.offsetX;
  mouse.y = e.offsetY;
});

toodle.clearColor = Colors.web.black;

function draw() {
  toodle.startFrame();
  toodle.draw(
    toodle.shapes.Rect({
      idealSize: { width: 100, height: 100 },
      color: Colors.web.whiteSmoke,
      position: toodle.convertSpace(mouse, { from: "screen", to: "world" }),
    }),
  );

  toodle.draw(toodle.Quad("mew"));
  toodle.endFrame();
  // requestAnimationFrame(draw);
}

draw();
