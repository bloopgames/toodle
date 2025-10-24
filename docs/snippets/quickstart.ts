import { Toodle } from "@bloop.gg/toodle";

const canvas = document.querySelector("canvas")!;
const toodle = await Toodle.attach(canvas, {
  limits: { textureArrayLayers: 5 },
});

await toodle.assets.loadTexture(
  "kitten",
  new URL(
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bc/Juvenile_Ragdoll.jpg/440px-Juvenile_Ragdoll.jpg",
  ),
);

const quad = toodle.Quad("kitten", {
  idealSize: {
    width: 100,
    height: 100,
  },
});

toodle.startFrame();
toodle.draw(quad);
toodle.endFrame();
