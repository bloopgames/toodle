import type { Color } from "../../coreTypes/Color";

export type ScreenShaderDefinition = {
  pipeline: GPURenderPipeline;
  bindGroups: GPUBindGroup[];
};

export function postProcess(
  encoder: GPUCommandEncoder,
  context: GPUCanvasContext,
  device: GPUDevice,
  clearColor: Color,
  presentationFormat: GPUTextureFormat,
  pingpong: [GPUTexture, GPUTexture],
) {
  const postProcess = encoder.beginRenderPass({
    label: "toodle post process",
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: clearColor,
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  });

  // biome-ignore format:it's a matrix
  const fullscreenQuadVerts = new Float32Array([
    -1, -1,  0, 0,
     1, -1,  1, 0,
    -1,  1,  0, 1,
     1,  1,  1, 1,
  ]);

  const fullscreenVB = device.createBuffer({
    size: fullscreenQuadVerts.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  new Float32Array(fullscreenVB.getMappedRange()).set(fullscreenQuadVerts);
  fullscreenVB.unmap();

  let shader: ScreenShaderDefinition | null = null;

  const params = new URLSearchParams(window.location.search);
  switch (params.get("postprocess")) {
    case "blur":
      shader = blur(device, presentationFormat, pingpong);
      break;
    case "crtScanLines":
      shader = crtScanLines(device, presentationFormat, pingpong);
      break;
    case "colorInversion":
      shader = colorInversion(device, presentationFormat, pingpong);
      break;
    default:
      shader = none(device, presentationFormat, pingpong);
      break;
  }

  if (shader) {
    postProcess.setPipeline(shader.pipeline);
    for (let i = 0; i < shader.bindGroups.length; i++) {
      postProcess.setBindGroup(i, shader.bindGroups[i]);
    }
  }
  postProcess.setVertexBuffer(0, fullscreenVB);
  postProcess.draw(4, 1, 0, 0);

  postProcess.end();
}

function blur(
  device: GPUDevice,
  presentationFormat: GPUTextureFormat,
  pingpong: [GPUTexture, GPUTexture],
): ScreenShaderDefinition {
  const pipeline = device.createRenderPipeline({
    label: "toodle post process - no action",
    layout: "auto",

    primitive: {
      topology: "triangle-strip",
    },

    vertex: {
      buffers: [
        {
          arrayStride: 4 * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x2" }, // position
            { shaderLocation: 1, offset: 0, format: "float32x2" }, // uv
          ],
        },
      ],
      module: defaultVertexShader(device),
    },
    fragment: {
      targets: [{ format: presentationFormat }],
      module: device.createShaderModule({
        label: "toodle post process fragment shader",
        code: /*wgsl*/ `
@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var inputSampler: sampler;
@group(0) @binding(2) var<uniform> engineUniform: EngineUniform;

struct EngineUniform {
  // resolution of the canvas in physical pixels
  resolution: vec2f,
  random: f32,
  time: f32,
};


@fragment
fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let color = textureSample(inputTex, inputSampler, uv);
  // prevent optimization of bind group
  let _nope = engineUniform.time;
  return color;
}
  `,
      }),
    },
  });

  const engineUniform = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM,
    mappedAtCreation: true,
  });

  const engineUniformData = new Float32Array(engineUniform.getMappedRange());
  engineUniformData[0] = pingpong[0].width;
  engineUniformData[1] = pingpong[0].height;
  engineUniformData[2] = Math.random();
  engineUniformData[3] = performance.now() / 1000;
  engineUniform.unmap();

  const bindGroup = device.createBindGroup({
    label: "toodle post process bind group",
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: pingpong[0].createView() },
      { binding: 1, resource: defaultSampler(device) },
      { binding: 2, resource: engineUniform },
    ],
  });

  return {
    pipeline,
    bindGroups: [bindGroup],
  };
}

export function none(
  device: GPUDevice,
  presentationFormat: GPUTextureFormat,
  pingpong: [GPUTexture, GPUTexture],
): ScreenShaderDefinition {
  const pipeline = device.createRenderPipeline({
    label: "toodle post process - no action",
    layout: "auto",

    primitive: {
      topology: "triangle-strip",
    },

    vertex: {
      buffers: [
        {
          arrayStride: 4 * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x2" }, // position
            { shaderLocation: 1, offset: 0, format: "float32x2" }, // uv
          ],
        },
      ],
      module: defaultVertexShader(device),
    },
    fragment: {
      targets: [{ format: presentationFormat }],
      module: device.createShaderModule({
        label: "toodle post process fragment shader",
        code: /*wgsl*/ `
@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var inputSampler: sampler;
@group(0) @binding(2) var<uniform> engineUniform: EngineUniform;

struct EngineUniform {
  // resolution of the canvas in physical pixels
  resolution: vec2f,
  random: f32,
  time: f32,
};


@fragment
fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let color = textureSample(inputTex, inputSampler, uv);
  // prevent optimization of bind group
  let _nope = engineUniform.time;
  return color;
}
  `,
      }),
    },
  });

  const engineUniform = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM,
    mappedAtCreation: true,
  });

  const engineUniformData = new Float32Array(engineUniform.getMappedRange());
  engineUniformData[0] = pingpong[0].width;
  engineUniformData[1] = pingpong[0].height;
  engineUniformData[2] = Math.random();
  engineUniformData[3] = performance.now() / 1000;
  engineUniform.unmap();

  const bindGroup = device.createBindGroup({
    label: "toodle post process bind group",
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: pingpong[0].createView() },
      { binding: 1, resource: defaultSampler(device) },
      { binding: 2, resource: engineUniform },
    ],
  });

  return {
    pipeline,
    bindGroups: [bindGroup],
  };
}

export function crtScanLines(
  device: GPUDevice,
  presentationFormat: GPUTextureFormat,
  pingpong: [GPUTexture, GPUTexture],
): ScreenShaderDefinition {
  const pipeline = device.createRenderPipeline({
    label: "toodle color inversion post process",
    layout: "auto",

    primitive: {
      topology: "triangle-strip",
    },

    vertex: {
      buffers: [
        {
          arrayStride: 4 * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x2" }, // position
            { shaderLocation: 1, offset: 0, format: "float32x2" }, // uv
          ],
        },
      ],
      module: defaultVertexShader(device),
    },
    fragment: {
      targets: [{ format: presentationFormat }],
      module: device.createShaderModule({
        label: "toodle post process fragment shader",
        code: /*wgsl*/ `
@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var inputSampler: sampler;
@group(0) @binding(2) var<uniform> engineUniform: EngineUniform;

struct EngineUniform {
  // resolution of the canvas in physical pixels
  resolution: vec2f,
  random: f32,
  time: f32,
};


@fragment
fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let color = textureSample(inputTex, inputSampler, uv);
  let resolution = engineUniform.resolution;
  let pixelY = floor(uv.y * resolution.y);
  let stripe = floor(pixelY / 10. + engineUniform.time * 3.) % 2.;
  let strength = 0.3;

  let darkened = color.rgb * (1.0 - strength * stripe);

  return vec4f(darkened, color.a);
  // just show uvs
  return vec4f(uv.xy, 0.,1.);
}
  `,
      }),
    },
  });

  const engineUniform = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM,
    mappedAtCreation: true,
  });

  const engineUniformData = new Float32Array(engineUniform.getMappedRange());
  engineUniformData[0] = pingpong[0].width;
  engineUniformData[1] = pingpong[0].height;
  engineUniformData[2] = Math.random();
  engineUniformData[3] = performance.now() / 1000;
  engineUniform.unmap();

  const bindGroup = device.createBindGroup({
    label: "toodle post process bind group",
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: pingpong[0].createView() },
      { binding: 1, resource: defaultSampler(device) },
      { binding: 2, resource: engineUniform },
    ],
  });

  return {
    pipeline,
    bindGroups: [bindGroup],
  };
}

function colorInversion(
  device: GPUDevice,
  presentationFormat: GPUTextureFormat,
  pingpong: [GPUTexture, GPUTexture],
): ScreenShaderDefinition {
  const pipeline = device.createRenderPipeline({
    label: "toodle color inversion post process",
    layout: "auto",

    primitive: {
      topology: "triangle-strip",
    },

    vertex: {
      buffers: [
        {
          arrayStride: 4 * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x2" }, // position
            { shaderLocation: 1, offset: 0, format: "float32x2" }, // uv
          ],
        },
      ],
      module: device.createShaderModule({
        label: "toodle post process vertex shader",
        code: `
struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

const enginePosLookup = array(vec2f(-1, 1), vec2f(-1, -1), vec2f(1, 1), vec2f(1, -1));
const engineUvLookup = array(vec2f(0, 0), vec2f(0, 1), vec2f(1, 0), vec2f(1, 1));

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOut {
  var out: VertexOut;
  out.position = vec4(enginePosLookup[vertexIndex], 0.0, 1.0);
  out.uv = engineUvLookup[vertexIndex];
  return out;
}
  `,
      }),
    },
    fragment: {
      targets: [{ format: presentationFormat }],
      module: device.createShaderModule({
        label: "toodle post process fragment shader",
        code: `
          @group(0) @binding(0) var inputTex: texture_2d<f32>;
          @group(0) @binding(1) var inputSampler: sampler;


          @fragment
          fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
            let color = textureSample(inputTex, inputSampler, uv);
            return vec4f(1. - color.rgb, color.a);
          }
  `,
      }),
    },
  });

  const sampler = device.createSampler({
    label: "toodle post process sampler",
    magFilter: "linear",
    minFilter: "linear",
    mipmapFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  });

  const bindGroup = device.createBindGroup({
    label: "toodle post process bind group",
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: pingpong[0].createView() },
      { binding: 1, resource: sampler },
    ],
  });

  return {
    pipeline,
    bindGroups: [bindGroup],
  };
}

// defaults

function defaultSampler(device: GPUDevice): GPUSampler {
  const sampler = device.createSampler({
    label: "toodle post process sampler",
    magFilter: "linear",
    minFilter: "linear",
    mipmapFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  });

  return sampler;
}

function defaultVertexShader(device: GPUDevice): GPUShaderModule {
  return device.createShaderModule({
    label: "toodle post process vertex shader",
    code: `
struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

const enginePosLookup = array(vec2f(-1, 1), vec2f(-1, -1), vec2f(1, 1), vec2f(1, -1));
const engineUvLookup = array(vec2f(0, 0), vec2f(0, 1), vec2f(1, 0), vec2f(1, 1));

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOut {
  var out: VertexOut;
  out.position = vec4(enginePosLookup[vertexIndex], 0.0, 1.0);
  out.uv = engineUvLookup[vertexIndex];
  return out;
}
    `,
  });
}

// Gaussian function is
// G(x) = exp(-x² / (2σ²))
// where x is the distance from the center and σ is the standard deviation.
function gaussianWeights(radius: number, sigma = radius / 2): number[] {
  const weights = [];
  let sum = 0;

  for (let i = 0; i <= radius; i++) {
    const w = Math.exp(-0.5 * (i / sigma) ** 2);
    weights.push(w);
    sum += i === 0 ? w : w * 2;
  }

  return weights.map((w) => w / sum); // normalize to sum = 1
}
