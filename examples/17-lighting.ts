import { Toodle } from "../src/Toodle";
import { createCanvas } from "./util";

const canvas = createCanvas(window.innerWidth, window.innerHeight);

const toodle = await Toodle.attach(canvas, { filter: "linear" });

const htmlSelect = document.createElement("select") as HTMLSelectElement;
htmlSelect.innerHTML = `
  <option value="add" selected>Add</option>
  <option value="subtract">Subtract</option>
`;
document.body.appendChild(htmlSelect);

await toodle.assets.loadTexture(
  "mew",
  new URL("/img/MewTransparentExample.png", import.meta.url),
);

const mouse = { x: 0, y: 0 };

canvas.addEventListener("mousemove", (e) => {
  mouse.x = e.offsetX;
  mouse.y = e.offsetY;
});

let shader = makeLightingShader("add");

htmlSelect.addEventListener("change", (e) => {
  if (e.target instanceof HTMLSelectElement) {
    const blendMode = e.target.value as GPUBlendOperation;
    shader = makeLightingShader(blendMode);
  }
});

canvas.style.cursor = "none";

toodle.clearColor = { r: 0, g: 0, b: 0, a: 1 };

function draw() {
  toodle.startFrame();
  toodle.draw(
    toodle.Quad("mew", {
      color: { r: 0.2, g: 0.2, b: 0.2, a: 1 },
    }),
  );
  toodle.draw(
    toodle.shapes.Circle({
      idealSize: { width: 100, height: 100 },
      color: { r: 1, g: 0.8, b: 0.6, a: 1 },
      shader,
      position: toodle.convertSpace(mouse, { from: "screen", to: "world" }),
    }),
  );

  toodle.endFrame();
  requestAnimationFrame(draw);
}

function makeLightingShader(blendOperation: GPUBlendOperation) {
  return toodle.QuadShader(
    "additive blend",
    1,
    /*wgsl*/ `
    @fragment
    fn frag(vertex: VertexOutput) -> @location(0) vec4f {
      let color = default_fragment_shader(vertex, linearSampler);

      let isTransparent = step(0.01, color.a);
      let original_uv = vertex.engine_uv.zw;
      let centerDistance = distance(vec2f(0.5, 0.5), original_uv);
      let light = 1. - centerDistance;

      return vec4f(color.rgb * light * isTransparent, color.a);
    }
  `,
    {
      color: {
        srcFactor: "one",
        dstFactor: "one",
        operation: blendOperation,
      },
      alpha: {
        srcFactor: "one",
        dstFactor: "one",
        operation: blendOperation,
      },
    },
  );
}

draw();
