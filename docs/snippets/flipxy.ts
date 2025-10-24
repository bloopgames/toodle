import { Toodle } from "@bloop.gg/toodle";

const canvas = document.querySelector("canvas")!;
const toodle = await Toodle.attach(canvas, { filter: "nearest" });

await toodle.assets.loadTextures({
  apple: new URL("https://toodle.gg/img/ItemApple.png"),
  banana: new URL("https://toodle.gg/img/ItemBanana.png"),
});

// Declare our first apple quad with an inverted scale on both the x and y axis...
const scaleApple = toodle.Quad("apple", {
  position: { x: -100, y: 0 },
  scale: { x: -1, y: -1 },
});
scaleApple.add(
  toodle.Quad("banana", {
    position: { x: 25, y: 25 },
  }),
);

//Declare our second apple quad with the flipX and flipY values set to true...
const flipApple = toodle.Quad("apple", {
  position: { x: 100, y: 0 },
  flipX: true,
  flipY: true,
});
flipApple.add(
  toodle.Quad("banana", {
    position: { x: 25, y: 25 },
  }),
);

toodle.startFrame();
toodle.draw(scaleApple);
toodle.draw(flipApple);
toodle.endFrame();
