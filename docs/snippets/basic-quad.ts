import { Toodle } from "@bloop.gg/toodle";

const canvas = document.querySelector("canvas")!;
const toodle = await Toodle.attach(canvas, {
  filter: "nearest",
  limits: { textureArrayLayers: 5 },
});

await toodle.assets.loadTextures({
  apple: new URL("https://toodle.gg/img/ItemApple.png"),
});

const tintedQuad = toodle.Quad("apple", {
  color: { r: 0, g: 1, b: 0, a: 1 },
});

const transformedQuad = toodle.Quad("apple", {
  position: { x: 100, y: 100 },
  // rotation is in degrees. there is also `rotationRadians` which accepts and returns radians
  rotation: 45,
  scale: { x: 2, y: 2 },
});

const flippedQuad = toodle.Quad("apple");
flippedQuad.x -= 100;
flippedQuad.y -= 100;
flippedQuad.flipX = true;

toodle.startFrame();
toodle.draw(tintedQuad);
toodle.draw(transformedQuad);
toodle.draw(flippedQuad);
toodle.endFrame();
