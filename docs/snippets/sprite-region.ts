import { Toodle } from "@bloop.gg/toodle";

const canvas = document.querySelector("canvas")!;

const toodle = await Toodle.attach(canvas, { filter: "nearest" });

await toodle.assets.registerBundle("goombird", {
  textures: {
    goombird: new URL("/img/goombird.png", "https://toodle.gg"),
  },
  autoLoad: true,
});
await toodle.assets.loadFont(
  "ComicNeue",
  new URL("https://toodle.gg/fonts/ComicNeue-Regular-msdf.json"),
);

const spriteSheet = toodle.Quad("goombird", {
  position: { x: 0, y: -48 },
});

const animatedQuad = toodle.Quad("goombird", {
  idealSize: {
    width: 48,
    height: 48,
  },
  region: {
    x: 0,
    y: 0,
    width: 48,
    height: 48,
  },
  scale: 5,
});

const spritesheetSize = toodle.assets.getSize("goombird");

toodle.camera.zoom = 1.5;

const frameCount = spritesheetSize.width / 48;
let frame = 0;

let acc = performance.now();
function paint() {
  toodle.startFrame();

  // run the animation at 12fps
  if (performance.now() - acc > (12 * 1000) / 60) {
    acc = performance.now();
    frame++;
    frame %= frameCount;
  }

  toodle.draw(spriteSheet);
  toodle.draw(animatedQuad);
  animatedQuad.region.x = frame * 48;

  // draw a debug rect of the current region
  toodle.draw(
    toodle.shapes
      .Rect({
        idealSize: {
          width: 48,
          height: 48,
        },
        color: {
          r: 1,
          g: 0,
          b: 0,
          a: 0.2,
        },
      })
      .setBounds({
        left: -spritesheetSize.width / 2 + animatedQuad.region.x,
        y: spriteSheet.bounds.y,
      }),
  );

  // draw debug text
  toodle.draw(
    toodle.Text(
      "ComicNeue",
      [
        `Frame: ${frame}`,
        `Region: ${JSON.stringify(animatedQuad.region)}`,
      ].join("\n"),
      {
        position: { x: 0, y: 50 },
        fontSize: 16,
        color: { r: 0, g: 0, b: 0, a: 1 },
      },
    ),
  );
  toodle.endFrame();
  requestAnimationFrame(paint);
}
paint();
