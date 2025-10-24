import { Toodle } from "@bloop.gg/toodle";

const canvas = document.querySelector("canvas")!;
const toodle = await Toodle.attach(canvas, {
  filter: "nearest",
  limits: { textureArrayLayers: 5 },
});

// Here we're going to get an Apple and some Spinach...
const produceTextures = {
  ItemApple: new URL("img/ItemApple.png", "https://toodle.gg"),
  ItemSpinach: new URL("img/ItemSpinach.png", "https://toodle.gg"),
};

// With our pantry textures holding SeaSaltIceCream and the same Spinach that can be found in our produce textures...
const pantryTextures = {
  ItemSeaSaltIceCream: new URL(
    "img/ItemSeaSaltIceCream.png",
    "https://toodle.gg",
  ),
  ItemSpinach: new URL("img/ItemSpinach.png", "https://toodle.gg"),
};

// A little extra ice cream in the freezer...
const freezerTextures = {
  ItemSeaSaltIceCream: new URL(
    "img/ItemSeaSaltIceCream.png",
    "https://toodle.gg",
  ),
};

// Bundles are registered...
await toodle.assets.registerBundle("produce", { textures: produceTextures });
await toodle.assets.registerBundle("pantry", { textures: pantryTextures });
await toodle.assets.registerBundle("freezer", { textures: freezerTextures });

// and loaded...
await toodle.assets.loadBundle("produce");
await toodle.assets.loadBundle("pantry");
await toodle.assets.loadBundle("freezer");

// With the latter then being unloaded...
await toodle.assets.unloadBundle("pantry");

toodle.startFrame();
// But a draw call to `ItemSpinach` or `SeaSaltIceCream` will still work perfectly fine!
toodle.draw(
  toodle.Quad("ItemSpinach", {
    idealSize: { width: 100, height: 100 },
    position: { x: -60, y: 0 },
  }),
);
toodle.draw(
  toodle.Quad("ItemSeaSaltIceCream", {
    idealSize: { width: 100, height: 100 },
    position: { x: 60, y: 0 },
  }),
);
toodle.endFrame();
