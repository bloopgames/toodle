import type { MsdfFont } from "../../text/MsdfFont";
import msdfShader from "./wgsl/text.wgsl";

/**
 * A webgpu pipeline for rendering blocks of text with a given font.
 */
export class FontPipeline {
  constructor(
    public pipeline: GPURenderPipeline,
    public font: MsdfFont,
    public fontBindGroup: GPUBindGroup,
    public maxCharCount: number,
  ) {}

  static async create(
    device: GPUDevice,
    font: MsdfFont,
    colorFormat: GPUTextureFormat,
    maxCharCount: number,
  ): Promise<FontPipeline> {
    const pipeline = await pipelinePromise(device, colorFormat, font.name);
    const texture = device.createTexture({
      label: `MSDF font ${font.name}`,
      size: [font.imageBitmap.width, font.imageBitmap.height, 1],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    device.queue.copyExternalImageToTexture(
      { source: font.imageBitmap },
      { texture },
      [font.imageBitmap.width, font.imageBitmap.height],
    );

    const charsGpuBuffer = device.createBuffer({
      label: `MSDF font ${font.name} character layout buffer`,
      size: font.charCount * Float32Array.BYTES_PER_ELEMENT * 8,
      usage: GPUBufferUsage.STORAGE,
      mappedAtCreation: true,
    });

    const charsArray = new Float32Array(charsGpuBuffer.getMappedRange());
    // todo: don't double copy this
    charsArray.set(font.charBuffer, 0);
    charsGpuBuffer.unmap();

    const fontDataBuffer = device.createBuffer({
      label: `MSDF font ${font.name} metadata buffer`,
      size: Float32Array.BYTES_PER_ELEMENT * 4,
      usage: GPUBufferUsage.UNIFORM,
      mappedAtCreation: true,
    });
    const fontDataArray = new Float32Array(fontDataBuffer.getMappedRange());
    fontDataArray[0] = font.lineHeight;
    fontDataBuffer.unmap();

    // create a texture view
    const fontBindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        // msdf texture
        {
          binding: 0,
          resource: texture.createView(),
        },
        // msdf texture sampler
        {
          binding: 1,
          resource: device.createSampler(sampler),
        },
        // buffer of character uv and offset data
        {
          binding: 2,
          resource: {
            buffer: charsGpuBuffer,
          },
        },
        // buffer of font metadata, e.g. line height
        {
          binding: 3,
          resource: {
            buffer: fontDataBuffer,
          },
        },
      ],
    });
    return new FontPipeline(pipeline, font, fontBindGroup, maxCharCount);
  }
}

export function pipelinePromise(
  device: GPUDevice,
  colorFormat: GPUTextureFormat,
  label: string,
) {
  const shader = device.createShaderModule({
    label: `${label} shader`,
    code: msdfShader,
  });

  return device.createRenderPipelineAsync({
    label: `${label} pipeline`,
    layout: device.createPipelineLayout({
      bindGroupLayouts: [
        device.createBindGroupLayout(fontBindGroupLayout),
        device.createBindGroupLayout(textUniformBindGroupLayout),
        device.createBindGroupLayout(engineUniformBindGroupLayout),
      ],
    }),
    vertex: {
      module: shader,
      entryPoint: "vertexMain",
    },
    fragment: {
      module: shader,
      entryPoint: "fragmentMain",
      targets: [
        {
          format: colorFormat,
          blend: {
            color: {
              srcFactor: "src-alpha",
              dstFactor: "one-minus-src-alpha",
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one",
            },
          },
        },
      ],
    },
    primitive: {
      topology: "triangle-strip",
      stripIndexFormat: "uint32",
    },
  });
}

if (typeof GPUShaderStage === "undefined") {
  // polyfill GPUShaderStage so that toodle can be imported in non-browser environments
  // eg for automated testing
  globalThis.GPUShaderStage = {
    VERTEX: 1,
    FRAGMENT: 2,
    COMPUTE: 4,
  };
}

const fontBindGroupLayout: GPUBindGroupLayoutDescriptor = {
  label: "MSDF font group layout",
  entries: [
    {
      binding: 0,
      visibility: GPUShaderStage.FRAGMENT,
      texture: {},
    },
    {
      binding: 1,
      visibility: GPUShaderStage.FRAGMENT,
      sampler: {},
    },
    {
      binding: 2,
      visibility: GPUShaderStage.VERTEX,
      buffer: { type: "read-only-storage" },
    },
    {
      binding: 3,
      visibility: GPUShaderStage.VERTEX,
      buffer: {},
    },
  ],
};

const engineUniformBindGroupLayout: GPUBindGroupLayoutDescriptor = {
  label: "Uniform bind group",
  entries: [
    {
      binding: 0,
      visibility: GPUShaderStage.VERTEX,
      buffer: {},
    },
  ],
};

const sampler: GPUSamplerDescriptor = {
  label: "MSDF text sampler",
  minFilter: "linear",
  magFilter: "linear",
  mipmapFilter: "linear",
  maxAnisotropy: 16,
};

const textUniformBindGroupLayout: GPUBindGroupLayoutDescriptor = {
  label: "MSDF text block uniform",
  entries: [
    {
      // text data - matrix, color, font size, characters
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: "read-only-storage" },
    },
    {
      binding: 1,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: "read-only-storage" },
    },
  ],
};
