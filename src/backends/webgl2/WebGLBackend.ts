import type { Color } from "../../coreTypes/Color";
import type { EngineUniform } from "../../coreTypes/EngineUniform";
import type { Size } from "../../coreTypes/Size";
import type { Limits, LimitsOptions } from "../../limits";
import { DEFAULT_LIMITS } from "../../limits";
import type { CpuTextureAtlas } from "../../textures/types";
import { assert } from "../../utils/assert";
import type { IBackendShader, QuadShaderCreationOpts } from "../IBackendShader";
import type { IRenderBackend } from "../IRenderBackend";
import { WebGLQuadShader } from "./WebGLQuadShader";

export type WebGLBackendOptions = {
  limits?: LimitsOptions;
  format?: "rgba8unorm" | "rg8unorm";
};

/**
 * WebGL 2 implementation of the render backend.
 */
export class WebGLBackend implements IRenderBackend {
  readonly type = "webgl2" as const;
  readonly limits: Limits;
  readonly atlasSize: Size;
  readonly textureArrayHandle: WebGLTexture;

  #gl: WebGL2RenderingContext;
  #canvas: HTMLCanvasElement;
  #format: "rgba8unorm" | "rg8unorm";

  private constructor(
    gl: WebGL2RenderingContext,
    canvas: HTMLCanvasElement,
    limits: Limits,
    textureArray: WebGLTexture,
    format: "rgba8unorm" | "rg8unorm",
  ) {
    this.#gl = gl;
    this.#canvas = canvas;
    this.limits = limits;
    this.textureArrayHandle = textureArray;
    this.atlasSize = {
      width: limits.textureSize,
      height: limits.textureSize,
    };
    this.#format = format;
  }

  /**
   * Create a WebGL 2 backend attached to a canvas.
   */
  static async create(
    canvas: HTMLCanvasElement,
    options: WebGLBackendOptions = {},
  ): Promise<WebGLBackend> {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
    });

    if (!gl) {
      throw new Error("WebGL 2 not supported");
    }

    const limits: Limits = {
      ...DEFAULT_LIMITS,
      ...options.limits,
    };

    const format = options.format ?? "rgba8unorm";

    // Create texture array
    const textureArray = gl.createTexture();
    assert(textureArray, "Failed to create WebGL texture");

    gl.bindTexture(gl.TEXTURE_2D_ARRAY, textureArray);

    // Configure texture parameters
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Allocate storage for texture array
    const internalFormat = format === "rg8unorm" ? gl.RG8 : gl.RGBA8;

    gl.texStorage3D(
      gl.TEXTURE_2D_ARRAY,
      1, // mip levels
      internalFormat,
      limits.textureSize,
      limits.textureSize,
      limits.textureArrayLayers,
    );

    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);

    return new WebGLBackend(gl, canvas, limits, textureArray, format);
  }

  startFrame(clearColor: Color, loadOp: "clear" | "load"): void {
    const gl = this.#gl;

    // Set viewport to canvas size
    gl.viewport(0, 0, this.#canvas.width, this.#canvas.height);

    if (loadOp === "clear") {
      gl.clearColor(clearColor.r, clearColor.g, clearColor.b, clearColor.a);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    // Enable blending
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(
      gl.SRC_ALPHA,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA,
    );
  }

  endFrame(): void {
    const gl = this.#gl;
    gl.flush();
  }

  updateEngineUniform(_uniform: EngineUniform): void {
    // Uniforms are updated per-shader in WebGL, not at the backend level
  }

  async uploadAtlas(atlas: CpuTextureAtlas, layerIndex: number): Promise<void> {
    const gl = this.#gl;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.textureArrayHandle);

    if (atlas.rg8Bytes) {
      // Upload raw bytes for RG8 format
      gl.texSubImage3D(
        gl.TEXTURE_2D_ARRAY,
        0, // mip level
        0,
        0,
        layerIndex, // x, y, z offset
        this.atlasSize.width,
        this.atlasSize.height,
        1, // width, height, depth
        gl.RG,
        gl.UNSIGNED_BYTE,
        atlas.rg8Bytes,
      );
    } else {
      // Upload ImageBitmap for RGBA format
      gl.texSubImage3D(
        gl.TEXTURE_2D_ARRAY,
        0,
        0,
        0,
        layerIndex,
        atlas.texture.width,
        atlas.texture.height,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        atlas.texture,
      );
    }

    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
  }

  createQuadShader(opts: QuadShaderCreationOpts): IBackendShader {
    return new WebGLQuadShader(opts.label, this, opts.instanceCount);
  }

  resize(_width: number, _height: number): void {
    // Canvas resize is handled by the application
  }

  destroy(): void {
    const gl = this.#gl;
    gl.deleteTexture(this.textureArrayHandle);
  }

  getRenderContext(): WebGL2RenderingContext {
    return this.#gl;
  }

  getPresentationFormat(): string {
    return this.#format;
  }

  getDevice(): WebGL2RenderingContext {
    return this.#gl;
  }

  /**
   * Get the WebGL 2 rendering context.
   */
  get gl(): WebGL2RenderingContext {
    return this.#gl;
  }
}
