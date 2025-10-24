import { Toodle } from "@bloop.gg/toodle";

const canvas = document.querySelector("canvas")!;
const toodle = await Toodle.attach(canvas, {
  filter: "linear",
  limits: { textureArrayLayers: 5 },
});
toodle.clearColor = { r: 0.5, g: 0.5, b: 0.5, a: 1 };

await toodle.assets.loadTextures({
  apple: new URL("https://toodle.gg/img/ItemApple.png"),
  vectorApple: new URL("https://toodle.gg/img/VectorApple.jpg"),
});

const vectorApple = toodle.Quad("vectorApple", {
  scale: 2,
  position: { x: 125, y: 0 },
});

const apple = toodle.Quad("apple", {
  scale: 6,
  position: { x: -125, y: 0 },
});

toodle.startFrame();
toodle.draw(vectorApple);
toodle.draw(apple);
toodle.endFrame();
