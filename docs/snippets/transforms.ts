import { Toodle } from "@bloop.gg/toodle";

// attach toodle
const canvas = document.querySelector("canvas")!;
const toodle = await Toodle.attach(canvas, {
  filter: "nearest",
  limits: { textureArrayLayers: 5 },
});

toodle.clearColor = { r: 0, g: 0, b: 0, a: 1 };

// load textures
await toodle.assets.loadTextures({
  mario: new URL("https://toodle.gg/img/MarioIdle.png"),
  mushroom: new URL("https://toodle.gg/img/Mushroom.png"),
});

// You can use a node that doesn't draw anything as a parent
const root = toodle.Node({
  position: { x: 40, y: 40 },
});
// Every node has an `add` method that returns the node that was added
const mario = root.add(toodle.Quad("mario"));
const mushroom = mario.add(
  toodle.Quad("mushroom", {
    // children's positions are in local space relative to the parent
    position: { x: 24, y: 0 },
  }),
);

function frame() {
  toodle.startFrame();
  mario.scale = 3 + Math.sin(toodle.frameCount / 30);
  mario.rotation += 1;
  mushroom.rotation += 1;
  toodle.draw(mario);
  toodle.endFrame();
  requestAnimationFrame(frame);
}

frame();
