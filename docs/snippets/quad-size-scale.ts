import { Toodle } from "@bloop.gg/toodle";

const canvas = document.querySelector("canvas")!;
const toodle = await Toodle.attach(canvas, {
  filter: "nearest",
  limits: { textureArrayLayers: 5 },
});

await toodle.assets.loadTextures({
  apple: new URL("https://toodle.gg/img/ItemApple.png"),
  banana: new URL("https://toodle.gg/img/ItemBanana.png"),
});

const apple = toodle.Quad("apple");
apple.add(
  toodle.Quad("banana", {
    position: { x: 16, y: 16 },
  }),
);

const appleWithSizeChange = toodle.Quad("apple", {
  idealSize: {
    width: 100,
    height: 100,
  },
  position: { x: -100, y: 0 },
});
appleWithSizeChange.add(
  toodle.Quad("banana", {
    position: { x: 16, y: 16 },
  }),
);

const appleWithScaleChange = toodle.Quad("apple", {
  scale: { x: 3, y: 3 },
  position: { x: 100, y: 0 },
});
appleWithScaleChange.add(
  toodle.Quad("banana", {
    position: { x: 16, y: 16 },
  }),
);

toodle.startFrame();
toodle.draw(apple);
toodle.draw(appleWithSizeChange);
toodle.draw(appleWithScaleChange);
toodle.endFrame();
