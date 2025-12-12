import type { Color } from "../../coreTypes/Color";
import type { EngineUniform } from "../../coreTypes/EngineUniform";
import type { Size } from "../../coreTypes/Size";
import type { Limits, LimitsOptions } from "../../limits";
import { DEFAULT_LIMITS } from "../../limits";
import type { CpuTextureAtlas } from "../../textures/types";
import { assert } from "../../utils/assert";
import type { IBackendShader, QuadShaderCreationOpts } from "../IBackendShader";
import type { IRenderBackend } from "../IRenderBackend";
import type {
  ITextureAtlas,
  TextureAtlasFormat,
  TextureAtlasOptions,
} from "../ITextureAtlas";
import type { PostProcess } from "./postprocess/mod";
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
  readonly defaultAtlasId = "default";

  #atlases = new Map<string, ITextureAtlas>();

  #device: GPUDevice;
  #context: GPUCanvasContext;
  #presentationFormat: GPUTextureFormat;
  #encoder: GPUCommandEncoder | null = null;
  #renderPass: GPURenderPassEncoder | null = null;
  #postprocess: PostProcess | null = null;
  #pingpong: [GPUTexture, GPUTexture] | null = null;
  #canvas: HTMLCanvasElement;

  private constructor(
    device: GPUDevice,
    context: GPUCanvasContext,
    presentationFormat: GPUTextureFormat,
    limits: Limits,
    canvas: HTMLCanvasElement,
  ) {
    this.#device = device;
    this.#context = context;
    this.#presentationFormat = presentationFormat;
    this.limits = limits;
    this.atlasSize = {
      width: limits.textureSize,
      height: limits.textureSize,
    };
    this.#canvas = canvas;
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

    const backend = new WebGPUBackend(
      device,
      context,
      presentationFormat,
      limits,
      canvas,
    );

    // Create the default texture atlas
    backend.createTextureAtlas("default", {
      format: options.format ?? "rgba8unorm",
      layers: limits.textureArrayLayers,
      size: limits.textureSize,
    });

    return backend;
  }

  startFrame(clearColor: Color, loadOp: "clear" | "load"): void {
    this.#encoder = this.#device.createCommandEncoder();

    // If postprocessing, render to ping-pong texture; otherwise render to canvas
    const target = this.#postprocess
      ? this.#pingpong![0]
      : this.#context.getCurrentTexture();

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

    // Run postprocessing if set
    if (this.#postprocess && this.#pingpong) {
      this.#postprocess.process(
        this.#device.queue,
        this.#encoder,
        this.#pingpong,
        this.#context.getCurrentTexture(),
      );
    }

    this.#device.queue.submit([this.#encoder.finish()]);

    this.#renderPass = null;
    this.#encoder = null;
  }

  updateEngineUniform(_uniform: EngineUniform): void {
    // Uniforms are updated per-shader in WebGPU, not at the backend level
    // This is handled in WebGPUQuadShader.startFrame
  }

  async uploadAtlas(
    atlas: CpuTextureAtlas,
    layerIndex: number,
    atlasId?: string,
  ): Promise<void> {
    const targetAtlas = this.getTextureAtlas(atlasId ?? "default");
    assert(targetAtlas, `Atlas "${atlasId ?? "default"}" not found`);
    const texture = targetAtlas.handle as GPUTexture;

    if (atlas.rg8Bytes) {
      const w = texture.width;
      const h = texture.height;

      // WebGPU requires 256-byte bytesPerRow
      const rowBytes = w * 2;
      assert(rowBytes % 256 === 0, "rowBytes must be a multiple of 256");

      this.#device.queue.writeTexture(
        {
          texture,
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
          texture,
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
      opts.atlasId,
    );
  }

  createTextureAtlas(id: string, options?: TextureAtlasOptions): ITextureAtlas {
    if (this.#atlases.has(id)) {
      throw new Error(`Atlas "${id}" already exists`);
    }

    const format: TextureAtlasFormat = options?.format ?? "rgba8unorm";
    const layers = options?.layers ?? this.limits.textureArrayLayers;
    const size = options?.size ?? this.limits.textureSize;

    const texture = this.#device.createTexture({
      label: `Toodle Atlas "${id}"`,
      size: [size, size, layers],
      format,
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const atlas: ITextureAtlas = { id, format, layers, size, handle: texture };
    this.#atlases.set(id, atlas);
    return atlas;
  }

  getTextureAtlas(id?: string): ITextureAtlas | null {
    return this.#atlases.get(id ?? "default") ?? null;
  }

  destroyTextureAtlas(id: string): void {
    const atlas = this.#atlases.get(id);
    if (atlas) {
      (atlas.handle as GPUTexture).destroy();
      this.#atlases.delete(id);
    }
  }

  resize(_width: number, _height: number): void {
    // Canvas resize is handled automatically by WebGPU context
    // The presentation size updates on next getCurrentTexture()

    // Recreate ping-pong textures if postprocessing is active
    if (this.#postprocess && this.#pingpong) {
      this.#destroyPingPongTextures();
      this.#createPingPongTextures();
    }
  }

  destroy(): void {
    this.#destroyPingPongTextures();
    // Destroy all atlases
    for (const atlas of this.#atlases.values()) {
      (atlas.handle as GPUTexture).destroy();
    }
    this.#atlases.clear();
    this.#device.destroy();
  }

  /**
   * Set a post-processor for screen effects.
   * Setting a post-processor will cause the main render to go to an offscreen texture.
   * Note: Ping-pong textures are not destroyed when setting to null to avoid
   * race conditions with in-flight command buffers. They are cleaned up on destroy().
   */
  setPostprocess(processor: PostProcess | null): void {
    this.#postprocess = processor;
    if (processor && !this.#pingpong) {
      this.#createPingPongTextures();
    }
    // Don't destroy pingpong textures when setting to null - they may still be
    // referenced by in-flight command buffers. They'll be cleaned up on destroy().
  }

  /**
   * Get the current post-processor.
   */
  getPostprocess(): PostProcess | null {
    return this.#postprocess;
  }

  #createPingPongTextures(): void {
    const width = this.#canvas.width;
    const height = this.#canvas.height;

    const createTexture = (label: string) =>
      this.#device.createTexture({
        label,
        size: [width, height],
        format: this.#presentationFormat,
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_SRC,
      });

    this.#pingpong = [
      createTexture("toodle pingpong 0"),
      createTexture("toodle pingpong 1"),
    ];
  }

  #destroyPingPongTextures(): void {
    if (this.#pingpong) {
      this.#pingpong[0].destroy();
      this.#pingpong[1].destroy();
      this.#pingpong = null;
    }
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

  /**
   * Get the presentation format.
   */
  get presentationFormat(): GPUTextureFormat {
    return this.#presentationFormat;
  }

  /**
   * Get the current render pass encoder.
   * Only available between startFrame() and endFrame().
   */
  get renderPass(): GPURenderPassEncoder {
    assert(
      this.#renderPass,
      "No render pass available - did you call startFrame?",
    );
    return this.#renderPass;
  }
}
