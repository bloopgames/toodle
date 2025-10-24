# Vintage SDK Integration

## Using Toodle exclusively

You can bypass the Vintage SDK WebGpuPainter. This is the recommended path for any new project using the vintage sdk.

**src/toodleAdapter.ts**

```ts
import { Toodle } from "@bloop.gg/toodle";

export function useToodle() {
  if (!(window as any).toodle) {
    throw new Error("Toodle not found");
  }
  return (window as any).toodle as Toodle;
}

export async function initToodle() {
  if (!(window as any).toodle) {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    const toodle = await Toodle.attach(canvas, {
      filter: "nearest",
    });

    // do your asset loading here, eg
    // await toodle.assets.registerBundle('main', {
    //   textures: {
    //     'bg': new URL('/game/assets/dedede.png', import.meta.url)
    //   }
    // });
    // await toodle.assets.loadBundle('main')
    (window as any).toodle = toodle;
  }
  return (window as any).toodle as Toodle;
}

export const toodleStartSystem = {
  paint() {
    const toodle = useToodle();
    toodle.startFrame();
  },
};

export const toodleEndSystem = {
  paint() {
    const toodle = useToodle();
    toodle.endFrame();
  },
};
```

**src/game.ts**

```ts
import { initToodle } from "./toodleAdapter";

//...

// however you instantiate your state object
const state = new State();

const game = new Game(
  state,
  [
    toodleStartSystem,
    // your other systems...
    toodleEndSystem,
  ]
  // systems,
  {
    async preload(_state, context) {
      await initToodle();
      context.painter = new NullPainter();
    }
  }
)
```

**src/mySystem.ts**

```ts
export const mySystem = {
  label: 'My System',
  //...
  paint() {
    const toodle = useToodle();
    toodle.draw(
      toodle.shapes.Rect({idealSize: {width: 100, height: 100}, color: { r: 1, g: 0, b: 0, a: 1 }})
    );
  }
} satisfies System<State>;
```

## Using Toodle on top of the Vintage SDK WebGpuPainter

You can use Toodle to draw on top of the Vintage SDK WebGPU Painter canvas.

::: danger
This path is not recommended for any new projects. It can be valuable if you have an existing Vintage SDK project and want to gradually migrate to Toodle.
:::

Include the same `toodleAdapter.ts` file as above.

**src/game.ts**

```ts
import { initToodle } from "./toodleAdapter";

//your game code...

const originalPaint = game.paint.bind(game);

// share webgpu device and context with toodle
const webGpuPainter = game.context.painter as WebGpuPainter
const toodle = new Toodle(
  webGpuPainter.device,
  webGpuPainter.context,
  (navigator as any).gpu.getPreferredCanvasFormat(),
  game.context.screen,
  { filter: "nearest" } // temporarily we need this for the white pixel primitive - it's a known bug
)

// monkeypatch paint to submit toodle gpu commands after painter commands
// to draw on top
game.paint = (headless) => {
  if (env.toodle !== "off") {
    // grab toodle from the global window object
    toodle.startFrame({ loadOp: "load" })
    originalPaint(headless)
    toodle.endFrame()
  } else {
    originalPaint(headless)
  }
}
```
