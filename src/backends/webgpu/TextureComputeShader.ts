import type { TextureWithMetadata } from "../../textures/types";
import computeShader from "./wgsl/pixel-scraping.wgsl";

// Constants
const BOUNDING_BOX_SIZE = 4 * Uint32Array.BYTES_PER_ELEMENT;
const WORKGROUP_SIZE = 8;
const MAX_BOUND = 0xffffffff;
const MIN_BOUND = 0x00000000;

/**
 * The data returned by the compute shader that represents the opaque pixels in a texture.
 * Texel coordinates start at 0,0 in the top-left corner of the texture.
 */
type OpaqueRect = {
  /** The leftmost texel coordinate of the bounding box. */
  texelX: number;
  /** The topmost texel coordinate of the bounding box. */
  texelY: number;
  /** The width of the bounding box in texels. */
  texelWidth: number;
  /** The height of the bounding box in texels. */
  texelHeight: number;
};

/**
 * A GPU-based texture processor that uses compute shaders to:
 * 1. Find the non-transparent bounding box in a texture.
 * 2. Crop the texture to that bounding box.
 * 3. Create a fallback texture if no non-transparent pixels are found.
 */
export class TextureComputeShader {
  #device: GPUDevice;
  #boundingBuffer: GPUBuffer;
  #cropPipeline: GPUComputePipeline;
  #boundPipeline: GPUComputePipeline;
  #missingTexturePipeline: GPUComputePipeline;

  constructor(
    device: GPUDevice,
    cropPipeline: GPUComputePipeline,
    boundPipeline: GPUComputePipeline,
    missingTexturePipeline: GPUComputePipeline,
  ) {
    this.#device = device;
    this.#boundPipeline = boundPipeline;
    this.#cropPipeline = cropPipeline;
    this.#missingTexturePipeline = missingTexturePipeline;

    // Buffer to store the computed bounding box [minX, minY, maxX, maxY]
    this.#boundingBuffer = this.#device.createBuffer({
      size: BOUNDING_BOX_SIZE,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_SRC |
        GPUBufferUsage.COPY_DST,
    });
  }

  /**
   * Factory method to initialize pipelines and return an instance of TextureComputeShader.
   */
  static create(device: GPUDevice) {
    const pipelines = createPipelines(device, "TextureComputeShader");
    return new TextureComputeShader(
      device,
      pipelines.cropPipeline,
      pipelines.boundPipeline,
      pipelines.missingTexturePipeline,
    );
  }

  /**
   * Main entry point to process a texture.
   * Returns a cropped ImageBitmap and metadata.
   */
  async processTexture(
    textureWrapper: TextureWithMetadata,
  ): Promise<TextureWithMetadata> {
    const boundsBindGroup = this.#boundsBindGroup(textureWrapper.texture);

    const commandEncoder = this.#device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();

    const dispatchX = Math.ceil(textureWrapper.texture.width / WORKGROUP_SIZE);
    const dispatchY = Math.ceil(textureWrapper.texture.height / WORKGROUP_SIZE);

    // Initialize bounding box with max/min values
    const boundsInit = new Uint32Array([
      MAX_BOUND,
      MAX_BOUND,
      MIN_BOUND,
      MIN_BOUND,
    ]);
    this.#device.queue.writeBuffer(
      this.#boundingBuffer,
      0,
      boundsInit.buffer,
      0,
      BOUNDING_BOX_SIZE,
    );

    // Run bounds detection compute shader
    passEncoder.setPipeline(this.#boundPipeline);
    passEncoder.setBindGroup(0, boundsBindGroup);
    passEncoder.dispatchWorkgroups(dispatchX, dispatchY);
    passEncoder.end();
    this.#device.queue.submit([commandEncoder.finish()]);

    const { texelX, texelY, texelWidth, texelHeight, computeBuffer } =
      await this.#getBoundingBox();

    // If no non-transparent pixels were found
    if (texelX === MAX_BOUND || texelY === MAX_BOUND) {
      return await this.#createMissingTexture(textureWrapper.texture);
    }

    // Crop the texture to the computed bounds
    const croppedTexture = await this.#cropTexture(
      texelWidth,
      texelHeight,
      computeBuffer,
      textureWrapper.texture,
    );

    const leftCrop = texelX;
    const rightCrop = textureWrapper.originalSize.width - texelX - texelWidth;
    const topCrop = texelY;
    const bottomCrop =
      textureWrapper.originalSize.height - texelY - texelHeight;

    textureWrapper = {
      texture: croppedTexture,
      cropOffset: { x: leftCrop - rightCrop, y: bottomCrop - topCrop },
      originalSize: textureWrapper.originalSize,
    };

    return textureWrapper;
  }

  /**
   * Reads the GPU buffer containing the bounding box.
   */
  async #getBoundingBox(): Promise<
    OpaqueRect & { computeBuffer: Uint32Array }
  > {
    const readBuffer = this.#device.createBuffer({
      label: "AABB Compute Buffer",
      size: BOUNDING_BOX_SIZE,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const copyEncoder = this.#device.createCommandEncoder();
    copyEncoder.copyBufferToBuffer(
      this.#boundingBuffer,
      0,
      readBuffer,
      0,
      BOUNDING_BOX_SIZE,
    );
    this.#device.queue.submit([copyEncoder.finish()]);

    await readBuffer.mapAsync(GPUMapMode.READ);
    const computeBuffer = new Uint32Array(readBuffer.getMappedRange().slice(0));
    readBuffer.unmap();

    const [minX, minY, maxX, maxY] = computeBuffer;
    return {
      texelX: minX,
      texelY: minY,
      texelWidth: maxX - minX + 1,
      texelHeight: maxY - minY + 1,

      computeBuffer,
    };
  }

  /**
   * Crops the original texture to the specified bounds using a compute shader.
   */
  async #cropTexture(
    croppedWidth: number,
    croppedHeight: number,
    computeBuffer: Uint32Array,
    inputTexture: GPUTexture,
  ) {
    const boundsUniform = this.#device.createBuffer({
      label: "Cropping Bounds Uniform Buffer",
      size: BOUNDING_BOX_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.#device.queue.writeBuffer(boundsUniform, 0, computeBuffer);

    const outputTexture = this.#device.createTexture({
      label: "Cropped Texture",
      size: [croppedWidth, croppedHeight],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC,
    });

    const dimensionsOutBuffer = this.#device.createBuffer({
      label: "Cropping Dimensions Output Buffer",
      size: BOUNDING_BOX_SIZE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    const bindGroup = this.#croppingBindGroup(
      inputTexture,
      outputTexture,
      boundsUniform,
      dimensionsOutBuffer,
    );

    const encoder = this.#device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.#cropPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(
      Math.ceil(croppedWidth / WORKGROUP_SIZE),
      Math.ceil(croppedHeight / WORKGROUP_SIZE),
    );
    pass.end();
    this.#device.queue.submit([encoder.finish()]);

    return outputTexture;
  }

  /**
   * Creates a fallback placeholder texture if the input is fully transparent.
   */
  async #createMissingTexture(
    inputTexture: GPUTexture,
  ): Promise<TextureWithMetadata> {
    const placeholder = this.#device.createTexture({
      label: "Missing Placeholder Texture",
      size: [inputTexture.width, inputTexture.height],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING,
    });

    const encoder = this.#device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.#missingTexturePipeline);
    pass.setBindGroup(0, this.#missingTextureBindGroup(placeholder));
    pass.dispatchWorkgroups(placeholder.width / 8, placeholder.height / 8);
    pass.end();
    this.#device.queue.submit([encoder.finish()]);

    return {
      texture: placeholder,
      cropOffset: { x: 0, y: 0 },
      originalSize: { width: inputTexture.width, height: inputTexture.height },
    };
  }

  // Bind group helpers

  #boundsBindGroup(inputTexture: GPUTexture): GPUBindGroup {
    return this.#device.createBindGroup({
      layout: this.#boundPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: inputTexture.createView() },
        { binding: 1, resource: { buffer: this.#boundingBuffer } },
      ],
    });
  }

  #croppingBindGroup(
    inputTexture: GPUTexture,
    outputTexture: GPUTexture,
    boundsUniform: GPUBuffer,
    dimensionsOutBuffer: GPUBuffer,
  ): GPUBindGroup {
    return this.#device.createBindGroup({
      layout: this.#cropPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: inputTexture.createView() },
        { binding: 1, resource: outputTexture.createView() },
        { binding: 2, resource: { buffer: boundsUniform } },
        { binding: 3, resource: { buffer: dimensionsOutBuffer } },
      ],
    });
  }

  #missingTextureBindGroup(outputTexture: GPUTexture): GPUBindGroup {
    return this.#device.createBindGroup({
      layout: this.#missingTexturePipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: outputTexture.createView() }],
    });
  }
}

/**
 * Creates compute pipelines for bounding box detection, cropping, and fallback texture generation.
 */
function createPipelines(device: GPUDevice, label: string) {
  const shader = device.createShaderModule({
    label: `${label} Shader`,
    code: computeShader,
  });

  const findBoundsBindGroupLayout = device.createBindGroupLayout({
    label: "Bounds Detection Layout",
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        texture: { sampleType: "float", viewDimension: "2d" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" },
      },
    ],
  });

  const cropBindGroupLayout = device.createBindGroupLayout({
    label: "Cropping Layout",
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: {} },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          access: "write-only",
          format: "rgba8unorm",
          viewDimension: "2d",
        },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "uniform" },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" },
      },
    ],
  });

  const missingTextureBindGroupLayout = device.createBindGroupLayout({
    label: "Missing Texture Layout",
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          access: "write-only",
          format: "rgba8unorm",
          viewDimension: "2d",
        },
      },
    ],
  });

  return {
    boundPipeline: device.createComputePipeline({
      label: `${label} - Find Bounds Pipeline`,
      layout: device.createPipelineLayout({
        bindGroupLayouts: [findBoundsBindGroupLayout],
      }),
      compute: { module: shader, entryPoint: "find_bounds" },
    }),
    cropPipeline: device.createComputePipeline({
      label: `${label} - Crop Pipeline`,
      layout: device.createPipelineLayout({
        bindGroupLayouts: [cropBindGroupLayout],
      }),
      compute: { module: shader, entryPoint: "crop_and_output" },
    }),
    missingTexturePipeline: device.createComputePipeline({
      label: `${label} - Missing Texture Pipeline`,
      layout: device.createPipelineLayout({
        bindGroupLayouts: [missingTextureBindGroupLayout],
      }),
      compute: { module: shader, entryPoint: "missing_texture" },
    }),
  };
}
