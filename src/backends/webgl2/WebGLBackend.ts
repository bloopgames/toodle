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
  readonly defaultAtlasId = "default";

  #atlases = new Map<string, ITextureAtlas>();
  #gl: WebGL2RenderingContext;
  #canvas: HTMLCanvasElement;

  private constructor(
    gl: WebGL2RenderingContext,
    canvas: HTMLCanvasElement,
    limits: Limits,
  ) {
    this.#gl = gl;
    this.#canvas = canvas;
    this.limits = limits;
    this.atlasSize = {
      width: limits.textureSize,
      height: limits.textureSize,
    };
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

    const backend = new WebGLBackend(gl, canvas, limits);

    // Create the default texture atlas
    backend.createTextureAtlas("default", {
      format: options.format ?? "rgba8unorm",
      layers: limits.textureArrayLayers,
      size: limits.textureSize,
    });

    return backend;
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

  async uploadAtlas(
    atlas: CpuTextureAtlas,
    layerIndex: number,
    atlasId?: string,
  ): Promise<void> {
    const gl = this.#gl;
    const targetAtlas = this.getTextureAtlas(atlasId ?? "default");
    assert(targetAtlas, `Atlas "${atlasId ?? "default"}" not found`);
    const texture = targetAtlas.handle as WebGLTexture;

    gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);

    if (atlas.rg8Bytes) {
      // Upload raw bytes for RG8 format
      gl.texSubImage3D(
        gl.TEXTURE_2D_ARRAY,
        0, // mip level
        0,
        0,
        layerIndex, // x, y, z offset
        targetAtlas.size,
        targetAtlas.size,
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
    return new WebGLQuadShader(
      opts.label,
      this,
      opts.instanceCount,
      opts.userCode,
      opts.atlasId,
    );
  }

  createTextureAtlas(id: string, options?: TextureAtlasOptions): ITextureAtlas {
    if (this.#atlases.has(id)) {
      throw new Error(`Atlas "${id}" already exists`);
    }

    const gl = this.#gl;
    const format: TextureAtlasFormat = options?.format ?? "rgba8unorm";
    const layers = options?.layers ?? this.limits.textureArrayLayers;
    const size = options?.size ?? this.limits.textureSize;

    const texture = gl.createTexture();
    assert(texture, "Failed to create WebGL texture");

    gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);

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
      size,
      size,
      layers,
    );

    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);

    const atlas: ITextureAtlas = { id, format, layers, size, handle: texture };
    this.#atlases.set(id, atlas);
    return atlas;
  }

  getTextureAtlas(id: string): ITextureAtlas | null {
    return this.#atlases.get(id) ?? null;
  }

  destroyTextureAtlas(id: string): void {
    const atlas = this.#atlases.get(id);
    if (atlas) {
      this.#gl.deleteTexture(atlas.handle as WebGLTexture);
      this.#atlases.delete(id);
    }
  }

  /**
   * Get the default texture atlas handle.
   * @deprecated Use getTextureAtlas("default").handle instead
   */
  get textureArrayHandle(): WebGLTexture {
    return this.getTextureAtlas("default")!.handle as WebGLTexture;
  }

  resize(_width: number, _height: number): void {
    // Canvas resize is handled by the application
  }

  destroy(): void {
    const gl = this.#gl;
    // Destroy all atlases
    for (const atlas of this.#atlases.values()) {
      gl.deleteTexture(atlas.handle as WebGLTexture);
    }
    this.#atlases.clear();
  }

  /**
   * Get the WebGL 2 rendering context.
   */
  get gl(): WebGL2RenderingContext {
    return this.#gl;
  }

  /**
   * Get the presentation format (of the default atlas).
   */
  get presentationFormat(): TextureAtlasFormat {
    return this.getTextureAtlas("default")?.format ?? "rgba8unorm";
  }
}
