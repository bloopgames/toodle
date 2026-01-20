import { Toodle } from "../src/Toodle";
import { createCanvas } from "./util";

const canvas = createCanvas(window.innerWidth, window.innerHeight);

const toodle = await Toodle.attach(canvas);

toodle.clearColor = { r: 0.5, g: 0.5, b: 0.5, a: 1 };

const rect = toodle.shapes.Rect({
  scale: { x: 100, y: 100 },
  color: { r: 1, g: 0, b: 0, a: 1 },
});

const shader = toodle.QuadShader("additive blend", 1, "", {
  blendMode: {
    color: {
      srcFactor: "one",
      dstFactor: "one",
      operation: "add",
    },
    alpha: {
      srcFactor: "one",
      dstFactor: "one",
      operation: "add",
    },
  }
});

const rect2 = toodle.shapes.Rect({
  rotation: 45,
  position: { x: 50, y: 50 },
  scale: { x: 100, y: 100 },
  shader,
  size: { width: 1, height: 1 },
});
rect2.color = { r: 0, g: 0, b: 1, a: 1 };

const circle = toodle.shapes.Circle({
  position: { x: 30, y: 30 },
  scale: { x: 50, y: 50 },
  radius: .5,
  color: { r: 0, g: 1, b: 1, a: 1 },
});

async function frame() {
  toodle.startFrame();
  toodle.draw(rect);
  toodle.draw(rect2);

  circle.position = {
    x: Math.sin(performance.now() / 1000) * 100,
    y: Math.cos(performance.now() / 1000) * 100,
  };
  toodle.draw(circle);
  toodle.endFrame();
  requestAnimationFrame(frame);
}

frame();

window.addEventListener("keydown", (e) => {
  switch (e.key) {
    case " ":
      rect.scale = { x: Math.random() * 10, y: Math.random() * 10 };
      break;
    case "q":
      rect.rotation += 1;
      break;
    case "e":
      rect.rotation -= 1;
      break;
    case "-":
      toodle.camera.zoom -= 0.1 * toodle.camera.zoom;
      break;
    case "=":
      toodle.camera.zoom += 0.1 * toodle.camera.zoom;
      break;
  }
});
