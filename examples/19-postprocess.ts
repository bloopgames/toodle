import { Toodle, Colors, Shaders } from "@bloopjs/toodle";
import { createCanvas } from "./util";

const canvas = createCanvas(window.innerWidth, window.innerHeight);
const toodle = await Toodle.attach(canvas, { filter: "linear" });

//
// desired high level api
//
// const postprocess = toodle.PostProcessor([enginePiece], {
//   process({pipeline, pingpong, screen}) {
//     // toodle.copyBuffer(cpuBuffer, gpuBuffer);

//     const renderPass = toodle.renderPass({
//       from: pingpong[0],
//       to: screen
//     })
//     // handled by top level
//     // renderPass.setPipeline(pipeline)
//     renderPass.draw(4);
//     renderPass.end();
//   },

//   wgsl: /*wgsl*/ `
//     @fragment
//     fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
//       var color = textureSample(tex, samp, uv);
//       color = vec4f(vec3f(1.0 - color.rgb), color.a);
//       return color;
//     }
//   `,

//   // bindings
//   // bindgroups: [],
//   // buffers: [],
//   // textures: [],
//   // samplers: [],

//   // advanced / optional, defaults to the engine ones
//   // vertex:
// })



const bufferDescriptor: GPUBufferDescriptor = {
  label: 'engine uniform buffer',
  size: 16,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
};

const bindGroupLayout = toodle.debug.device.createBindGroupLayout({
  entries: [
    { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
    { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
    { binding: 2, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
  ]
});

const enginePiece = {
  label: 'engine',
  wgsl: /*wgsl*/ `
struct EngineUniform {
  // resolution of the canvas in physical pixels
  resolution: vec2f,
  // random value between 0 and 1
  random: f32,
  // time in seconds since start
  time: f32,
};

@group(0) @binding(0) var tex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> engineUniform: EngineUniform;
`,
  bindgroups: [{
    bind(renderPass: GPURenderPassEncoder, texture: GPUTexture, sampler: GPUSampler, buffer: GPUBuffer): void {
      const bindGroup = device.createBindGroup({
        label: `engine bind group`,
        // todo - cache this and make it available on the bind group for pipeline creation
        layout: bindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: texture.createView(),
          },
          {
            binding: 1,
            resource: sampler,
          },
          {
            binding: 2,
            resource: {
              buffer,
            },
          },
        ],
      });

      renderPass.setBindGroup(0, bindGroup);
    }
  }],

  buffers: [{
    descriptor: bufferDescriptor,
    init(device: GPUDevice): GPUBuffer {
      return device.createBuffer(this.descriptor);
    }
  }],
};

// const vertexPiece = {
//   wgsl: /*wgsl*/ `
// struct VertexOut {
//   @builtin(position) position: vec4<f32>,
//   @location(0) uv: vec2<f32>,
// };

// const enginePosLookup = array(vec2f(-1, 1), vec2f(-1, -1), vec2f(1, 1), vec2f(1, -1));
// const engineUvLookup = array(vec2f(0, 0), vec2f(0, 1), vec2f(1, 0), vec2f(1, 1));

// @vertex
// fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOut {
//   var out: VertexOut;
//   out.position = vec4(enginePosLookup[vertexIndex], 0.0, 1.0);
//   out.uv = engineUvLookup[vertexIndex];
//   return out;
// }
//   `,
//   buffers: [{
//     size: fullscreenQuadVerts.byteLength,
//     usage: GPUBufferUsage.VERTEX,
//     mappedAtCreation: true,
//   }]
// }

const device = toodle.debug.device;
const presentationFormat = toodle.debug.presentationFormat;
const buffers = createBuffers(device);
const sampler = Shaders.PostProcessDefaults.sampler(device);
const pipeline = device.createRenderPipeline({
  ...Shaders.PostProcessDefaults.pipelineDescriptor(device),
  label: "post process - invert colors",
  layout: device.createPipelineLayout({
    label: 'invert colors layout',
    bindGroupLayouts: [bindGroupLayout],
  }),
  fragment: {
    targets: [{ format: presentationFormat }],
    module: device.createShaderModule({
      label: "invert colors",
      code: /*wgsl*/ `
        ${enginePiece.wgsl}

        @fragment
        fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
          var color = textureSample(tex, samp, uv);
          color = vec4f(vec3f(1.0 - color.rgb), color.a);
          return color;
        }
      `,
    }),
  },
});

const postprocess: Shaders.PostProcess = {
  process(queue: GPUQueue, encoder: GPUCommandEncoder, pingpong: [GPUTexture, GPUTexture], screen: GPUTexture) {
    // should be handled by enginePiece
    writeUniform(queue, buffers.engineUniformBuffer, toodle.resolution.width, toodle.resolution.height, performance.now() / 1000);

    const renderPass = encoder.beginRenderPass({
      label: `invert render pass`,
      colorAttachments: [
        {
          view: screen.createView(),
          clearValue: Colors.web.black,
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });

    renderPass.setPipeline(pipeline);

    // should be handled by enginePiece
    renderPass.setVertexBuffer(0, buffers.fullscreenVertexBuffer);
    enginePiece.bindgroups[0].bind(renderPass, pingpong[0], sampler, buffers.engineUniformBuffer);

    renderPass.draw(4);
    renderPass.end();
  }
};

(function frame() {
  toodle.startFrame();
  toodle.draw(toodle.shapes.Circle({
    size: { width: 100, height: 100 },
    color: Colors.web.cornflowerBlue,
    position: { x: Math.sin(performance.now() / 1000) * 150, y: Math.cos(performance.now() / 1000) * 150 },
  }));
  if (toodle.diagnostics.frames % 120 > 60) {
    toodle.postprocess = postprocess;
  } else {
    toodle.postprocess = null;
  }

  toodle.endFrame();
  requestAnimationFrame(frame);
})();


// to extract:

function createBuffers(device: GPUDevice): {fullscreenVertexBuffer: GPUBuffer, engineUniformBuffer: GPUBuffer} {
  // biome-ignore format:it's a matrix
  const fullscreenQuadVerts = new Float32Array([
    -1, -1,  0, 0,
      1, -1,  1, 0,
    -1,  1,  0, 1,
      1,  1,  1, 1,
  ]);
  const fullscreenVertexBuffer = device.createBuffer({
    size: fullscreenQuadVerts.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  new Float32Array(fullscreenVertexBuffer.getMappedRange()).set(fullscreenQuadVerts);
  fullscreenVertexBuffer.unmap();

  const engineUniformBuffer = device.createBuffer({
    label: 'createBuffers buffer',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  return {engineUniformBuffer, fullscreenVertexBuffer};
}

function writeUniform(queue: GPUQueue, buffer: GPUBuffer, width: number, height: number, time: number) {
  const cpu = new Float32Array(4);
  cpu[0] = width;
  cpu[1] = height;
  cpu[2] = Math.random();
  cpu[3] = time;
  queue.writeBuffer(buffer, 0, cpu.buffer);
}