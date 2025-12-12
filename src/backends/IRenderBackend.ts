import type { Color } from "../coreTypes/Color";
import type { EngineUniform } from "../coreTypes/EngineUniform";
import type { Size } from "../coreTypes/Size";
import type { Limits } from "../limits";
import type { CpuTextureAtlas } from "../textures/types";
import type { IBackendShader, QuadShaderCreationOpts } from "./IBackendShader";
import type { ITextureAtlas, TextureAtlasOptions } from "./ITextureAtlas";

export type BackendType = "webgpu" | "webgl2";

export type BlendFactor =
  | "one"
  | "zero"
  | "src-alpha"
  | "one-minus-src-alpha"
  | "dst-alpha"
  | "one-minus-dst-alpha";
export type BlendOperation = "add" | "subtract" | "reverse-subtract";

export type BlendMode = {
  color: {
    srcFactor: BlendFactor;
    dstFactor: BlendFactor;
    operation: BlendOperation;
  };
  alpha: {
    srcFactor: BlendFactor;
    dstFactor: BlendFactor;
    operation: BlendOperation;
  };
};

/**
 * The render backend interface abstracts WebGPU and WebGL differences.
 *
 * Implementations handle GPU-specific operations like texture management,
 * shader creation, and frame lifecycle.
 */
export interface IRenderBackend {
  /** The type of backend ("webgpu" or "webgl2") */
  readonly type: BackendType;

  /** Engine limits (texture size, instance count, etc.) */
  readonly limits: Limits;

  /** Size of the default texture atlas */
  readonly atlasSize: Size;

  /** Default atlas ID (always "default") */
  readonly defaultAtlasId: string;

  /**
   * Begin a new frame.
   * WebGPU: Creates command encoder and render pass
   * WebGL: Clears the canvas if loadOp is "clear"
   */
  startFrame(clearColor: Color, loadOp: "clear" | "load"): void;

  /**
   * End the current frame and submit to GPU.
   * WebGPU: Ends render pass and submits command buffer
   * WebGL: Flushes pending operations
   */
  endFrame(): void;

  /**
   * Update engine uniforms (view-projection matrix, resolution).
   * Called once per frame before shader processing.
   */
  updateEngineUniform(uniform: EngineUniform): void;

  /**
   * Upload a CPU texture atlas to a GPU texture array layer.
   * @param atlas - The CPU-side atlas data to upload
   * @param layerIndex - Which layer in the texture array to upload to
   * @param atlasId - Which atlas to upload to (default: "default")
   */
  uploadAtlas(
    atlas: CpuTextureAtlas,
    layerIndex: number,
    atlasId?: string,
  ): Promise<void>;

  /**
   * Create a new texture atlas.
   * @param id - Unique identifier for this atlas
   * @param options - Atlas configuration (format, layers, size)
   */
  createTextureAtlas(id: string, options?: TextureAtlasOptions): ITextureAtlas;

  /**
   * Get a texture atlas by ID.
   * @param id - Atlas identifier or defaults to "default"
   * @returns The atlas, or null if not found
   */
  getTextureAtlas(id?: string): ITextureAtlas | null;

  /**
   * Destroy a texture atlas and free GPU resources.
   * @param id - Atlas identifier
   */
  destroyTextureAtlas(id: string): void;

  /**
   * Create a quad shader for instanced rendering.
   */
  createQuadShader(opts: QuadShaderCreationOpts): IBackendShader;

  /**
   * Handle canvas resize.
   */
  resize(width: number, height: number): void;

  /**
   * Clean up GPU resources.
   */
  destroy(): void;
}
