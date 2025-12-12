/**
 * Supported texture atlas formats.
 */
export type TextureAtlasFormat = "rgba8unorm" | "rg8unorm";

/**
 * Options for creating a texture atlas.
 */
export type TextureAtlasOptions = {
  /** Texture format (default: "rgba8unorm") */
  format?: TextureAtlasFormat;
  /** Number of array layers (default: limits.textureArrayLayers) */
  layers?: number;
  /** Atlas size in pixels (default: limits.textureSize) */
  size?: number;
};

/**
 * Backend-agnostic texture atlas interface.
 *
 * Texture atlases are GPU texture arrays that store multiple textures.
 * Each backend manages its atlases and provides this common interface.
 */
export interface ITextureAtlas {
  /** Unique identifier for this atlas */
  readonly id: string;
  /** Texture format */
  readonly format: TextureAtlasFormat;
  /** Number of array layers */
  readonly layers: number;
  /** Size in pixels (width = height) */
  readonly size: number;
  /** Underlying GPU handle (GPUTexture for WebGPU, WebGLTexture for WebGL) */
  readonly handle: unknown;
}
