import { Toodle } from "@bloop.gg/toodle";

const canvas = document.querySelector("canvas")!;
const toodle = await Toodle.attach(canvas, {
  filter: "nearest",
  limits: { textureArrayLayers: 5 },
});

await toodle.assets.loadTextures({
  apple: new URL("https://toodle.gg/img/ItemApple.png"),
});

const parent = toodle.Quad("apple", {
  position: { x: 0, y: 100 },
});

const childOne = toodle.Quad("apple", {
  position: { x: -100, y: -50 },
});
const childTwo = toodle.Quad("apple", {
  position: { x: 100, y: -50 },
});
const grandChildOneOne = toodle.Quad("apple", {
  position: { x: -50, y: -50 },
});
const grandChildOneTwo = toodle.Quad("apple", {
  position: { x: 50, y: -50 },
});
const grandChildTwoOne = toodle.Quad("apple", {
  position: { x: -50, y: -50 },
});
const grandChildTwoTwo = toodle.Quad("apple", {
  position: { x: 50, y: -50 },
});

parent.add(childOne);
parent.add(childTwo);
childOne.add(grandChildOneOne);
childOne.add(grandChildOneTwo);
childTwo.add(grandChildTwoOne);
childTwo.add(grandChildTwoTwo);

// delete will remove childTwo and all its children from its parent
childTwo.delete();

function frame() {
  toodle.startFrame();
  toodle.draw(parent);
  toodle.endFrame();
}

frame();
