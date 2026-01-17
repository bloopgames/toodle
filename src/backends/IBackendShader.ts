import type { EngineUniform } from "../coreTypes/EngineUniform";
import type { SceneNode } from "../scene/SceneNode";
import type { BlendMode } from "./IRenderBackend";

/**
 * Options for creating a quad shader.
 */
export type QuadShaderCreationOpts = {
  /** Debug label for the shader */
  label: string;
  /** Maximum number of instances this shader can process per frame */
  instanceCount: number;
  /** User-defined shader code (WGSL for WebGPU, GLSL for WebGL) */
  userCode?: string;
  /** Blend mode for alpha compositing */
  blendMode?: BlendMode;
  /** Which texture atlas to bind (default: "default") */
  atlasId?: string;
};

/**
 * Backend-agnostic shader interface.
 *
 * This interface abstracts the differences between WebGPU and WebGL shaders.
 * Each backend provides its own implementation.
 */
export interface IBackendShader {
  /** Debug label for the shader */
  readonly label: string;

  /** The final compiled shader code (for debugging) */
  readonly code: string;

  /**
   * Prepare for a new frame.
   * Called once per frame before any processBatch calls.
   *
   * @param uniform - Engine uniforms (view-projection, resolution)
   */
  startFrame(uniform: EngineUniform): void;

  /**
   * Process a batch of nodes and issue draw calls.
   *
   * @param nodes - The nodes to render
   * @returns Number of draw calls issued
   */
  processBatch(nodes: SceneNode[]): number;

  /**
   * Cleanup after frame.
   * Called once per frame after all processBatch calls.
   */
  endFrame(): void;
}
