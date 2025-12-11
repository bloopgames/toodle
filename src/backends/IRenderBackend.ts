import type { Color } from "../coreTypes/Color";
import type { EngineUniform } from "../coreTypes/EngineUniform";
import type { Size } from "../coreTypes/Size";
import type { Limits } from "../limits";
import type { CpuTextureAtlas } from "../textures/types";
import type { IBackendShader, QuadShaderCreationOpts } from "./IBackendShader";

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

  /** Size of the texture atlas */
  readonly atlasSize: Size;

  /** The GPU texture array handle (GPUTexture for WebGPU, WebGLTexture for WebGL) */
  readonly textureArrayHandle: unknown;

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
   */
  uploadAtlas(atlas: CpuTextureAtlas, layerIndex: number): Promise<void>;

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

  /**
   * Get the render context for shader batch processing.
   * Returns backend-specific context (GPURenderPassEncoder or WebGL2RenderingContext).
   */
  getRenderContext(): unknown;

  /**
   * Get the presentation format used by this backend.
   */
  getPresentationFormat(): unknown;

  /**
   * Get the underlying device (GPUDevice for WebGPU, WebGL2RenderingContext for WebGL).
   */
  getDevice(): unknown;
}
