import { Toodle } from "../src/Toodle";
import { Limits } from "../src/limits";
import { createCanvas } from "./util";

const canvas = createCanvas(window.innerWidth, window.innerHeight);

const toodle = await Toodle.attach(canvas, { filter: "nearest" });

await toodle.assets.loadTexture(
  "mario",
  new URL("/img/MarioIdle.png", window.location.href),
);
await toodle.assets.loadTexture(
  "mushroom",
  new URL("/img/Mushroom.png", window.location.href),
);

const shader = toodle.QuadShader(
  "color flash",
  3,
  /*wgsl*/ `
struct Flash {
  color: vec4f,
  intensity: f32
}

@fragment
fn frag(vertex: VertexOutput) -> @location(0) vec4f {
  let color = default_fragment_shader(vertex, nearestSampler);
  let flashColor = mix(color.rgb, vertex.flash_color.rgb, vertex.flash_intensity);
  return vec4f(flashColor, color.a);
}
  `,
);

const quad = toodle.Quad("mushroom", {
  scale: { x: 4, y: 4 },
  position: { x: 10, y: 10 },
  shader,
  writeInstance: (array, offset) => {
    array.set([1, 1, 0, 1], offset);
    array.set([0.9], offset + 4);
  },
});

const quad2 = toodle.Quad("mushroom", {
  position: { x: 1, y: -1 },
  shader,
  writeInstance: (array, offset) => {
    array.set([1, 0, 1, 1], offset);
    array.set([0.5], offset + 4);
  },
});
quad2.layer = -1;
quad.add(quad2);

async function frame() {
  toodle.startFrame();
  toodle.draw(quad);
  quad2.layer = Math.round(toodle.diagnostics.frames / 100) % 2 === 0 ? -1 : 1;
  toodle.endFrame();
  requestAnimationFrame(frame);
}

frame();
