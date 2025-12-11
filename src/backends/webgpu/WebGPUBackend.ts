import type { Color } from "../../coreTypes/Color";
import type { EngineUniform } from "../../coreTypes/EngineUniform";
import type { Size } from "../../coreTypes/Size";
import type { Limits, LimitsOptions } from "../../limits";
import { DEFAULT_LIMITS } from "../../limits";
import type { CpuTextureAtlas } from "../../textures/types";
import { assert } from "../../utils/assert";
import type { IBackendShader, QuadShaderCreationOpts } from "../IBackendShader";
import type { IRenderBackend } from "../IRenderBackend";
import { WebGPUQuadShader } from "./WebGPUQuadShader";

export type WebGPUBackendOptions = {
  limits?: LimitsOptions;
  format?: "rgba8unorm" | "rg8unorm";
};

/**
 * WebGPU implementation of the render backend.
 */
export class WebGPUBackend implements IRenderBackend {
  readonly type = "webgpu" as const;
  readonly limits: Limits;
  readonly atlasSize: Size;
  readonly textureArrayHandle: GPUTexture;

  #device: GPUDevice;
  #context: GPUCanvasContext;
  #presentationFormat: GPUTextureFormat;
  #encoder: GPUCommandEncoder | null = null;
  #renderPass: GPURenderPassEncoder | null = null;

  private constructor(
    device: GPUDevice,
    context: GPUCanvasContext,
    presentationFormat: GPUTextureFormat,
    limits: Limits,
    textureAtlas: GPUTexture,
  ) {
    this.#device = device;
    this.#context = context;
    this.#presentationFormat = presentationFormat;
    this.limits = limits;
    this.textureArrayHandle = textureAtlas;
    this.atlasSize = {
      width: textureAtlas.width,
      height: textureAtlas.height,
    };
  }

  /**
   * Create a WebGPU backend attached to a canvas.
   */
  static async create(
    canvas: HTMLCanvasElement,
    options: WebGPUBackendOptions = {},
  ): Promise<WebGPUBackend> {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("WebGPU not supported: no adapter found");
    }

    const device = await adapter.requestDevice();
    device.lost.then((info) => {
      console.error("GPU Device lost", info);
    });

    const context = canvas.getContext("webgpu");
    assert(context, "Could not get WebGPU context from canvas");

    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

    context.configure({
      device,
      format: presentationFormat,
    });

    const limits: Limits = {
      ...DEFAULT_LIMITS,
      ...options.limits,
    };

    const format = options.format ?? "rgba8unorm";
    const textureAtlas = device.createTexture({
      label: "Toodle Atlas Texture",
      size: [limits.textureSize, limits.textureSize, limits.textureArrayLayers],
      format,
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    return new WebGPUBackend(
      device,
      context,
      presentationFormat,
      limits,
      textureAtlas,
    );
  }

  startFrame(clearColor: Color, loadOp: "clear" | "load"): void {
    this.#encoder = this.#device.createCommandEncoder();
    const target = this.#context.getCurrentTexture();

    this.#renderPass = this.#encoder.beginRenderPass({
      label: "toodle frame",
      colorAttachments: [
        {
          view: target.createView(),
          clearValue: clearColor,
          loadOp,
          storeOp: "store",
        },
      ],
    });
  }

  endFrame(): void {
    assert(this.#renderPass, "No render pass - did you call startFrame?");
    assert(this.#encoder, "No encoder - did you call startFrame?");

    this.#renderPass.end();
    this.#device.queue.submit([this.#encoder.finish()]);

    this.#renderPass = null;
    this.#encoder = null;
  }

  updateEngineUniform(_uniform: EngineUniform): void {
    // Uniforms are updated per-shader in WebGPU, not at the backend level
    // This is handled in WebGPUQuadShader.startFrame
  }

  async uploadAtlas(atlas: CpuTextureAtlas, layerIndex: number): Promise<void> {
    if (atlas.rg8Bytes) {
      const w = this.textureArrayHandle.width;
      const h = this.textureArrayHandle.height;

      // WebGPU requires 256-byte bytesPerRow
      const rowBytes = w * 2;
      assert(rowBytes % 256 === 0, "rowBytes must be a multiple of 256");

      this.#device.queue.writeTexture(
        {
          texture: this.textureArrayHandle,
          origin: { x: 0, y: 0, z: layerIndex },
        },
        atlas.rg8Bytes,
        { bytesPerRow: rowBytes, rowsPerImage: h },
        { width: w, height: h, depthOrArrayLayers: 1 },
      );
    } else {
      this.#device.queue.copyExternalImageToTexture(
        {
          source: atlas.texture,
        },
        {
          texture: this.textureArrayHandle,
          origin: [0, 0, layerIndex],
        },
        [atlas.texture.width, atlas.texture.height, 1],
      );
    }
  }

  createQuadShader(opts: QuadShaderCreationOpts): IBackendShader {
    return new WebGPUQuadShader(
      opts.label,
      this,
      opts.instanceCount,
      opts.userCode,
      opts.blendMode,
    );
  }

  resize(_width: number, _height: number): void {
    // Canvas resize is handled automatically by WebGPU context
    // The presentation size updates on next getCurrentTexture()
  }

  destroy(): void {
    this.textureArrayHandle.destroy();
    this.#device.destroy();
  }

  getRenderContext(): GPURenderPassEncoder {
    assert(
      this.#renderPass,
      "No render pass available - did you call startFrame?",
    );
    return this.#renderPass;
  }

  getPresentationFormat(): GPUTextureFormat {
    return this.#presentationFormat;
  }

  getDevice(): GPUDevice {
    return this.#device;
  }

  /**
   * Get the GPU device for advanced operations.
   */
  get device(): GPUDevice {
    return this.#device;
  }

  /**
   * Get the canvas context.
   */
  get context(): GPUCanvasContext {
    return this.#context;
  }
}
