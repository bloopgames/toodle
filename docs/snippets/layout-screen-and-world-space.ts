import { Toodle } from "@bloop.gg/toodle";

const canvas = document.querySelector("canvas")!;
const toodle = await Toodle.attach(canvas, {
  filter: "nearest",
  limits: { textureArrayLayers: 1 },
});

await toodle.assets.loadFont(
  "Comic",
  new URL("https://toodle.gg/fonts/ComicNeue-Regular-msdf.json"),
);

let screenCoords = { x: 0, y: 0 };
canvas.addEventListener("mousemove", (ev) => {
  // get the screen coordinates of the mouse
  // accounting for the canvas's position in the document
  // and any viewport scrolling or css transforms
  const rect = canvas.getBoundingClientRect();
  screenCoords = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
});

const rect = toodle.shapes.Rect({
  idealSize: {
    width: 100,
    height: 100,
  },
});

function frame() {
  toodle.startFrame();

  // convert mouse screen coordinates to world space
  const worldCoords = toodle.convertSpace(screenCoords, {
    from: "screen",
    to: "world",
  });

  // Axis-Aligned Bounding Box check for containment
  const isHovering =
    worldCoords.x >= rect.bounds.left &&
    worldCoords.x <= rect.bounds.right &&
    worldCoords.y >= rect.bounds.bottom &&
    worldCoords.y <= rect.bounds.top;

  rect.color = isHovering
    ? { r: 1, g: 0, b: 0, a: 1 }
    : { r: 0, g: 0, b: 0, a: 1 };

  const hudTopLeft = toodle.convertSpace(
    { x: 0, y: 0 },
    {
      from: "screen",
      to: "world",
    },
  );

  toodle.draw(
    toodle
      .Text(
        "Comic",
        `screen x=${Math.round(screenCoords.x)} y=${Math.round(screenCoords.y)}\nworld x=${Math.round(worldCoords.x)} y=${Math.round(worldCoords.y)}`,
        {
          position: { x: 100, y: -100 },
          color: { r: 0, g: 0, b: 0, a: 1 },
          idealSize: { width: 100, height: 35 },
        },
      )
      .setBounds({
        left: hudTopLeft.x,
        top: hudTopLeft.y,
      }),
  );

  toodle.draw(rect);
  toodle.endFrame();
  requestAnimationFrame(frame);
}

frame();
