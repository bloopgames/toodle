import { Toodle } from "@bloop.gg/toodle";

const canvas = document.querySelector("canvas")!;
const toodle = await Toodle.attach(canvas, {
  filter: "nearest",
  limits: { textureArrayLayers: 5 },
});

const produceTextures = {
  ItemApple: new URL("img/ItemApple.png", "https://toodle.gg"),
  ItemBanana: new URL("img/ItemBanana.png", "https://toodle.gg"),
  ItemBroccoli: new URL("img/ItemBroccoli.png", "https://toodle.gg"),
  ItemCherry: new URL("img/ItemCherry.png", "https://toodle.gg"),
  ItemKiwi: new URL("img/ItemKiwi.png", "https://toodle.gg"),
  ItemLemon: new URL("img/ItemLemon.png", "https://toodle.gg"),
  ItemOnion: new URL("img/ItemOnion.png", "https://toodle.gg"),
  ItemPea: new URL("img/ItemPea.png", "https://toodle.gg"),
  ItemPeach: new URL("img/ItemPeach.png", "https://toodle.gg"),
  ItemPumpkin: new URL("img/ItemPumpkin.png", "https://toodle.gg"),
  ItemRadish: new URL("img/ItemRadish.png", "https://toodle.gg"),
  ItemSpinach: new URL("img/ItemSpinach.png", "https://toodle.gg"),
  ItemTomato: new URL("img/ItemTomato.png", "https://toodle.gg"),
};

const pantryTextures = {
  ItemBaguette: new URL("img/ItemBaguette.png", "https://toodle.gg"),
  ItemCheese: new URL("img/ItemCheese.png", "https://toodle.gg"),
  ItemCoffee: new URL("img/ItemCoffee.png", "https://toodle.gg"),
  ItemButterscotchCinnamonPie: new URL(
    "img/ItemButterscotchCinnamonPie.png",
    "https://toodle.gg",
  ),
  ItemChilidog: new URL("img/ItemChilidog.png", "https://toodle.gg"),
  ItemSeaSaltIceCream: new URL(
    "img/ItemSeaSaltIceCream.png",
    "https://toodle.gg",
  ),
  ItemTurkeyLeg: new URL("img/ItemTurkeyLeg.png", "https://toodle.gg"),
};

await toodle.assets.registerBundle("produce", { textures: produceTextures });
await toodle.assets.registerBundle("pantry", { textures: pantryTextures });

await toodle.assets.loadBundle("produce");
await toodle.assets.loadBundle("pantry");

{
  const usage = toodle.assets.extra.getAtlasUsage();
  console.log("used", usage.used, "available", usage.available);
}
await toodle.assets.unloadBundle("pantry");

{
  const usage = toodle.assets.extra.getAtlasUsage();
  console.log("used", usage.used, "available", usage.available);
}

await toodle.assets.loadBundle("pantry");

toodle.startFrame();
toodle.draw(
  toodle.Quad("ItemPumpkin", {
    idealSize: { width: 100, height: 100 },
    position: { x: -60, y: 0 },
  }),
);
toodle.draw(
  toodle.Quad("ItemTurkeyLeg", {
    idealSize: { width: 100, height: 100 },
    position: { x: 60, y: 0 },
  }),
);
toodle.endFrame();
