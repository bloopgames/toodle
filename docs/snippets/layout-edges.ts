import { Toodle } from "@bloop.gg/toodle";

const canvas = document.querySelector("canvas")!;
const toodle = await Toodle.attach(canvas, {
  filter: "nearest",
  limits: { textureArrayLayers: 5 },
});

await toodle.assets.registerBundle("items", {
  textures: {
    apple: new URL("https://toodle.gg/img/ItemApple.png"),
    banana: new URL("https://toodle.gg/img/ItemBanana.png"),
    lemon: new URL("https://toodle.gg/img/ItemLemon.png"),
    cherry: new URL("https://toodle.gg/img/ItemCherry.png"),
  },
});

await toodle.assets.loadBundle("items");

const container = toodle.Node({ scale: 2 });
const banana = container.add(toodle.Quad("banana")).setBounds({
  left: -toodle.resolution.width / 2,
  top: toodle.resolution.height / 2,
});
const apple = container.add(toodle.Quad("apple")).setBounds({
  left: banana.bounds.right + 10,
  y: banana.bounds.y,
});
const lemon = container.add(toodle.Quad("lemon")).setBounds({
  top: apple.bounds.bottom - 10,
  x: apple.bounds.x,
});
const cherry = container.add(toodle.Quad("cherry")).setBounds({
  right: lemon.bounds.left - 10,
  y: lemon.bounds.y,
});

toodle.startFrame();
toodle.draw(container);
toodle.endFrame();
