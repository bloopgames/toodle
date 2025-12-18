import type { EngineUniform } from "../../coreTypes/EngineUniform";
import type { SceneNode } from "../../scene/SceneNode";
import type { MsdfFont } from "../../text/MsdfFont";
import type { ITextShader } from "../ITextShader";

/**
 * WebGL text shader that supports font loading for measurement but not rendering.
 *
 * This allows text measurement (via MsdfFont) on WebGL backend, but throws
 * an error if text rendering is attempted. For text rendering, use the WebGPU backend.
 */
export class WebGLTextShader implements ITextShader {
  readonly label = "text";
  readonly font: MsdfFont;
  readonly maxCharCount: number;

  constructor(font: MsdfFont, maxCharCount: number) {
    this.font = font;
    this.maxCharCount = maxCharCount;
  }

  startFrame(_uniform: EngineUniform): void {
    // No-op for measurement-only shader
  }

  processBatch(_nodes: SceneNode[]): number {
    throw new Error(
      "Text rendering is not supported in WebGL mode. Use WebGPU backend for text rendering.",
    );
  }

  endFrame(): void {
    // No-op for measurement-only shader
  }
}
