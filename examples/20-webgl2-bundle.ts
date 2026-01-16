import { Toodle } from "../src/Toodle";
import { createCanvas } from "./util";

async function main() {
  const toodle = await Toodle.attach(
    createCanvas(window.innerWidth, window.innerHeight),
    { filter: "nearest", backend: "webgl2" },
  );

  console.log("Backend:", toodle.backend);

  const textures = {
    ItemApple: new URL("img/ItemApple.png", "https://toodle.gg"),
    ItemBanana: new URL("img/ItemBanana.png", "https://toodle.gg"),
    ItemBroccoli: new URL("img/ItemBroccoli.png", "https://toodle.gg"),
    ItemCherry: new URL("img/ItemCherry.png", "https://toodle.gg"),
    ItemKiwi: new URL("img/ItemKiwi.png", "https://toodle.gg"),
  };

  console.time("registerBundle");
  await toodle.assets.registerBundle("produce", { textures });
  console.timeEnd("registerBundle");

  console.log("Textures loaded:", toodle.assets.textureIds);

  toodle.clearColor = { r: 0.2, g: 0.2, b: 0.3, a: 1 };

  const quads = [
    toodle.Quad("ItemApple", { position: { x: -300, y: 0 } }),
    toodle.Quad("ItemBanana", { position: { x: -150, y: 0 } }),
    toodle.Quad("ItemBroccoli", { position: { x: 0, y: 0 } }),
    toodle.Quad("ItemCherry", { position: { x: 150, y: 0 } }),
    toodle.Quad("ItemKiwi", { position: { x: 300, y: 0 } }),
  ];

  function frame() {
    toodle.startFrame();
    for (const quad of quads) {
      toodle.draw(quad);
    }
    toodle.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main();
