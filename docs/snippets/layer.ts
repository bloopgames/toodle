import { Toodle } from "@bloop.gg/toodle";

const canvas = document.querySelector("canvas")!;
const toodle = await Toodle.attach(canvas, {
  filter: "nearest",
  limits: { textureArrayLayers: 5 },
});

await toodle.assets.loadTextures({
  apple: new URL("https://toodle.gg/img/ItemApple.png"),
  banana: new URL("https://toodle.gg/img/ItemBanana.png"),
  lemon: new URL("https://toodle.gg/img/ItemLemon.png"),
});

const container = toodle.Node({ scale: 3 });
const banana = container.add(
  toodle.Quad("banana", {
    position: { x: -12, y: -12 },
  }),
);
const apple = container.add(
  toodle.Quad("apple", {
    position: { x: 0, y: 0 },
  }),
);
const lemon = container.add(
  toodle.Quad("lemon", {
    position: { x: 12, y: 12 },
  }),
);

// by default, children are drawn in the order they are added
// but you can change the layer property to change the draw order
banana.layer = 1;
apple.layer = -1;

toodle.startFrame();
toodle.draw(container);
toodle.endFrame();
