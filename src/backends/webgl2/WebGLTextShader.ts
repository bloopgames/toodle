import type { EngineUniform } from "../../coreTypes/EngineUniform";
import type { SceneNode } from "../../scene/SceneNode";
import { DEFAULT_FONT_SIZE, TextNode } from "../../scene/TextNode";
import type { MsdfFont } from "../../text/MsdfFont";
import {
  findLargestFontSize,
  measureText,
  shapeText,
} from "../../text/shaping";
import { assert } from "../../utils/assert";
import type { ITextShader } from "../ITextShader";
import { fragmentShader, vertexShader } from "./glsl/text.glsl";
import type { WebGLBackend } from "./WebGLBackend";
import type { WebGLFontPipeline } from "./WebGLFontPipeline";

/**
 * WebGL 2 text shader for MSDF font rendering.
 *
 * Unlike WebGPU which batches all text into storage buffers, WebGL renders
 * each TextNode separately since WebGL2 doesn't support firstInstance.
 */
export class WebGLTextShader implements ITextShader {
  readonly label = "text";
  readonly font: MsdfFont;
  readonly maxCharCount: number;

  #backend: WebGLBackend;
  #pipeline: WebGLFontPipeline;
  #program: WebGLProgram;
  #cpuTextBuffer: Float32Array;
  #cachedUniform: EngineUniform | null = null;

  // Uniform locations
  #uViewProjection: WebGLUniformLocation | null = null;
  #uTextTransform: WebGLUniformLocation | null = null;
  #uTextColor: WebGLUniformLocation | null = null;
  #uFontSize: WebGLUniformLocation | null = null;
  #uBlockWidth: WebGLUniformLocation | null = null;
  #uBlockHeight: WebGLUniformLocation | null = null;
  #uLineHeight: WebGLUniformLocation | null = null;
  #uCharData: WebGLUniformLocation | null = null;
  #uTextBuffer: WebGLUniformLocation | null = null;
  #uFontTexture: WebGLUniformLocation | null = null;

  constructor(backend: WebGLBackend, pipeline: WebGLFontPipeline) {
    this.#backend = backend;
    this.#pipeline = pipeline;
    this.font = pipeline.font;
    this.maxCharCount = pipeline.maxCharCount;

    const gl = backend.gl;

    // Compile shaders
    const vs = this.#compileShader(gl, gl.VERTEX_SHADER, vertexShader);
    const fs = this.#compileShader(gl, gl.FRAGMENT_SHADER, fragmentShader);

    // Create program
    const program = gl.createProgram();
    assert(program, "Failed to create WebGL program");
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      throw new Error(`Failed to link text shader program: ${info}`);
    }

    this.#program = program;

    // Get uniform locations
    this.#uViewProjection = gl.getUniformLocation(program, "u_viewProjection");
    this.#uTextTransform = gl.getUniformLocation(program, "u_textTransform");
    this.#uTextColor = gl.getUniformLocation(program, "u_textColor");
    this.#uFontSize = gl.getUniformLocation(program, "u_fontSize");
    this.#uBlockWidth = gl.getUniformLocation(program, "u_blockWidth");
    this.#uBlockHeight = gl.getUniformLocation(program, "u_blockHeight");
    this.#uLineHeight = gl.getUniformLocation(program, "u_lineHeight");
    this.#uCharData = gl.getUniformLocation(program, "u_charData");
    this.#uTextBuffer = gl.getUniformLocation(program, "u_textBuffer");
    this.#uFontTexture = gl.getUniformLocation(program, "u_fontTexture");

    // Allocate CPU buffer for text shaping
    this.#cpuTextBuffer = new Float32Array(this.maxCharCount * 4);

    // Cleanup shaders
    gl.deleteShader(vs);
    gl.deleteShader(fs);
  }

  startFrame(uniform: EngineUniform): void {
    this.#cachedUniform = uniform;
  }

  processBatch(nodes: SceneNode[]): number {
    if (nodes.length === 0) return 0;

    const gl = this.#backend.gl;
    const uniform = this.#cachedUniform;
    if (!uniform) {
      throw new Error("Tried to process batch but engine uniform is not set");
    }

    gl.useProgram(this.#program);

    // Set view projection matrix (extract 9 floats from padded mat3)
    if (this.#uViewProjection) {
      const m = uniform.viewProjectionMatrix;
      const mat3x3 = new Float32Array([
        m[0],
        m[1],
        m[2], // column 0
        m[4],
        m[5],
        m[6], // column 1
        m[8],
        m[9],
        m[10], // column 2
      ]);
      gl.uniformMatrix3fv(this.#uViewProjection, false, mat3x3);
    }

    // Set line height uniform
    if (this.#uLineHeight) {
      gl.uniform1f(this.#uLineHeight, this.#pipeline.lineHeight);
    }

    // Bind textures
    // Texture unit 0: font atlas
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.#pipeline.fontTexture);
    if (this.#uFontTexture) {
      gl.uniform1i(this.#uFontTexture, 0);
    }

    // Texture unit 1: character data
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.#pipeline.charDataTexture);
    if (this.#uCharData) {
      gl.uniform1i(this.#uCharData, 1);
    }

    // Texture unit 2: text buffer
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.#pipeline.textBufferTexture);
    if (this.#uTextBuffer) {
      gl.uniform1i(this.#uTextBuffer, 2);
    }

    // Render each TextNode separately
    for (const node of nodes) {
      if (!(node instanceof TextNode)) {
        console.error(node);
        throw new Error(
          `Tried to use WebGLTextShader on something that isn't a TextNode: ${node}`,
        );
      }

      const text = node.text;
      const formatting = node.formatting;
      const measurements = measureText(this.font, text, formatting.wordWrap);

      // Calculate font size
      const size = node.size ?? measurements;
      const fontSize = formatting.shrinkToFit
        ? findLargestFontSize(this.font, text, size, formatting)
        : formatting.fontSize;
      const actualFontSize = fontSize || DEFAULT_FONT_SIZE;

      // Shape text into buffer
      shapeText(
        this.font,
        text,
        size,
        actualFontSize,
        formatting,
        this.#cpuTextBuffer,
        0,
      );

      // Upload glyph data to text buffer texture
      this.#pipeline.updateTextBuffer(
        this.#cpuTextBuffer,
        measurements.printedCharCount,
      );

      // Set per-text uniforms
      if (this.#uTextTransform) {
        const m = node.matrix;
        const mat3x3 = new Float32Array([
          m[0],
          m[1],
          m[2], // column 0
          m[4],
          m[5],
          m[6], // column 1
          m[8],
          m[9],
          m[10], // column 2
        ]);
        gl.uniformMatrix3fv(this.#uTextTransform, false, mat3x3);
      }

      if (this.#uTextColor) {
        const tint = node.tint;
        gl.uniform4f(this.#uTextColor, tint.r, tint.g, tint.b, tint.a);
      }

      if (this.#uFontSize) {
        gl.uniform1f(this.#uFontSize, actualFontSize);
      }

      if (this.#uBlockWidth) {
        gl.uniform1f(
          this.#uBlockWidth,
          formatting.align === "center" ? 0 : measurements.width,
        );
      }

      if (this.#uBlockHeight) {
        gl.uniform1f(this.#uBlockHeight, measurements.height);
      }

      // Draw instanced: 4 vertices per glyph, one instance per character
      gl.drawArraysInstanced(
        gl.TRIANGLE_STRIP,
        0,
        4,
        measurements.printedCharCount,
      );
    }

    return nodes.length;
  }

  endFrame(): void {
    // No cleanup needed
  }

  #compileShader(
    gl: WebGL2RenderingContext,
    type: number,
    source: string,
  ): WebGLShader {
    const shader = gl.createShader(type);
    assert(shader, "Failed to create WebGL shader");

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      const typeStr = type === gl.VERTEX_SHADER ? "vertex" : "fragment";
      gl.deleteShader(shader);
      throw new Error(`Failed to compile ${typeStr} shader: ${info}`);
    }

    return shader;
  }

  destroy(): void {
    const gl = this.#backend.gl;
    gl.deleteProgram(this.#program);
    this.#pipeline.destroy();
  }
}
