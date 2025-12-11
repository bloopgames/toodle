import { Toodle } from "../src/Toodle";
import type { QuadNode } from "../src/scene/QuadNode";
import { createCanvas } from "./util";

const canvas = createCanvas(window.innerWidth, window.innerHeight);
canvas.style.border = "1px solid black";

const toodle = await Toodle.attach(canvas, { filter: "nearest" });

await toodle.assets.loadTexture(
  "test",
  new URL("/img/MarioIdle.png", import.meta.url),
);

const quad = toodle.Quad("test");
const quad2 = toodle.Quad("test");
const quad3 = toodle.Quad("test");
quad.scale = { x: 2, y: 2 };
quad.color = { r: 1, g: 0, b: 0, a: 1 };
quad2.color = { r: 0, g: 1, b: 0, a: 1 };
quad.position = { x: 400, y: 200 };
quad2.position = { x: -400, y: -200 };
quad3.position = { x: 0, y: 0 };

const quads: QuadNode[] = [];
for (let i = 0; i < 60; i++) {
  const quad = toodle.Quad("test", {
    size: { width: i + 1 + 0.6, height: i + 1 + 0.6 },
  });
  quad.position = { x: i * 10, y: i * 5 };
  quads.push(quad);
}

quad.position = { x: -400, y: -200 };
quad.scale = { x: -2, y: -2 };
quad2.position = { x: 400, y: 200 };
quad2.scale = { x: 2, y: 2 };
quad2.layer = 1;

function frame() {
  toodle.startFrame();

  quad.layer = 0;
  quad2.layer = 1;
  quad3.layer = 302;
  toodle.draw(quad);
  toodle.draw(quad2);
  toodle.draw(quad3);
  for (const q of quads) {
    toodle.draw(q);
  }
  toodle.endFrame();
}
frame();

window.addEventListener("keydown", (e) => {
  switch (e.key) {
    case "i":
      toodle.camera.y += 100;
      break;
    case "k":
      toodle.camera.y -= 100;
      break;
    case "j":
      toodle.camera.x -= 100;
      break;
    case "l":
      toodle.camera.x += 100;
      break;
    case "u":
      toodle.camera.rotation -= 1;
      break;
    case "o":
      toodle.camera.rotation += 1;
      break;
    case "-":
      toodle.camera.zoom -= 0.1 * toodle.camera.zoom;
      break;
    case "=":
      toodle.camera.zoom += 0.1 * toodle.camera.zoom;
      break;
  }
});
