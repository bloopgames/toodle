import { Toodle } from "../src/Toodle";
import { createCanvas } from "./util";

const canvas = createCanvas(window.innerWidth, window.innerHeight);

const toodle = await Toodle.attach(canvas, { filter: "nearest" });

await toodle.assets.loadTexture(
  "test",
  new URL("/img/MarioIdle.png", import.meta.url),
);

const quad = toodle.Quad("test");

function frame() {
  toodle.startFrame();
  quad.rotation += 1;
  quad.scale = {
    x: 3 + Math.sin(performance.now() / 1000) * 2,
    y: 3 + Math.sin(performance.now() / 1000) * 2,
  };
  quad.position = {
    x: Math.sin(performance.now() / 1000) * 100,
    y: Math.cos(performance.now() / 1000) * 100,
  };
  toodle.draw(quad);
  toodle.endFrame();
  requestAnimationFrame(frame);
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
