import { Toodle } from "@bloop.gg/toodle";

const canvas = document.querySelector("canvas")!;
const toodle = await Toodle.attach(canvas, {
  limits: { textureArrayLayers: 5 },
});

const shader = toodle.QuadShader(
  "line custom shader",
  1,
  /*wgsl*/ `

  @fragment
  fn frag(vertex: VertexOutput) -> @location(0) vec4f {
    let color = default_fragment_shader(vertex, nearestSampler);
    let uv = vertex.engine_uv.zw;
    return vec4f(uv.x, uv.y, 1, 1);
  }
    `,
);

function frame() {
  const thickness = 5;

  // basic line
  const basicLine = toodle.shapes.Line({
    start: { x: 0, y: 0 },
    end: { x: 0, y: 75 },
    thickness,
    color: { r: 1, g: 0, b: 1, a: 1 },
  });

  // line with custom shader
  const fancyLine = toodle.shapes.Line({
    start: { x: 0, y: 0 },
    end: {
      x: Math.sin(performance.now() / 1000) * 100,
      y: Math.cos(performance.now() / 1000) * 100,
    },
    thickness,
    color: { r: 1, g: 0, b: 1, a: 1 },
    shader,
  });

  const circle = toodle.shapes.Circle({
    color: { r: 0.9, g: 0.9, b: 0.9, a: 1 },
    idealSize: { width: 200, height: 200 },
  });

  const rectangle = toodle.shapes.Rect({
    idealSize: { width: 500, height: 120 },
    color: { r: 0.8, g: 0.8, b: 0.8, a: 1 },
  });

  toodle.startFrame();
  toodle.draw(rectangle);
  toodle.draw(circle);
  toodle.draw(basicLine);
  toodle.draw(fancyLine);
  toodle.endFrame();
  requestAnimationFrame(frame);
}

frame();
