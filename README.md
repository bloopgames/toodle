# toodle

A portmanteau of "2d" and "doodle", toodle is a simple 2d graphics engine focused on using WebGPU to render textured quads and text.

Full documentation is available at [toodle.gg](https://toodle.gg).

```ts
import { Toodle, Limits } from "@bloop.gg/toodle";

// attach to an html canvas element
const canvas = document.createElement("canvas");
await Toodle.attach(canvas);

// load textures into a webgpu texture atlas
await toodle.assets.loadTexture(
  "test",
  new URL(
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bc/Juvenile_Ragdoll.jpg/440px-Juvenile_Ragdoll.jpg"
  )
);

// reference assets by id and render up to 2048 quads with a single draw call
const quad = toodle.Quad("test", { size: [200, 200] });

toodle.startFrame();
toodle.draw(world);
toodle.endFrame();
```

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run dev
```

---

This project was created using `bun init` in bun v1.1.34. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
