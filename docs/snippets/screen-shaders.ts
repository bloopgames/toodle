import { Toodle, Colors } from "@bloop.gg/toodle";

const canvas = document.querySelector("canvas")!;
const toodle = await Toodle.attach(canvas, { filter: "linear" });

// biome-ignore format:it's a matrix
const fullscreenQuadVerts = new Float32Array([
  -1, -1,  0, 0,
    1, -1,  1, 0,
  -1,  1,  0, 1,
    1,  1,  1, 1,
]);

// const invertColors = toodle.ScreenShader({
//   fragment: /* wgsl */ `
//     @group(0) @binding(0) var mySampler: sampler;
//     @group(0) @binding(1) var myTexture: texture_2d<f32>;
//   `
// });
// toodle.postprocess = invertColors;

toodle.startFrame();
toodle.draw(toodle.shapes.Circle({
  idealSize: { width: 100, height: 100 },
  color: Colors.web.cornflowerBlue,
}));
toodle.endFrame();

function createBuffers(device: GPUDevice): {fullscreenVertex: GPUBuffer, engineUniform: GPUBuffer} {

}