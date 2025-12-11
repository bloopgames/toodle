/**
 * Bundles - A renderer-agnostic class for managing texture bundles and atlas coordinates.
 *
 * This class can be used standalone (without WebGPU) for:
 * - Registering pre-baked texture atlases (Pixi/AssetPack format)
 * - Looking up texture regions and UV coordinates
 * - Managing bundle state
 *
 * For WebGPU rendering, use AssetManager which wraps this class and handles GPU operations.
 */

import type { Size } from "../coreTypes/Size";
import type { Vec2 } from "../coreTypes/Vec2";
import type {
  AtlasBundleOpts,
  AtlasCoords,
  CpuTextureAtlas,
  PixiRegion,
  TextureRegion,
} from "./types";

export type TextureId = string;
export type BundleId = string;

type CpuBundle = {
  atlases: CpuTextureAtlas[];
  isLoaded: boolean;
  atlasIndices: number[];
};

/**
 * Options for creating a Bundles instance
 */
export type BundlesOptions = {
  /** The size of the texture atlas (default: 4096) */
  atlasSize?: number;
};

/**
 * Bundles manages texture bundle registration and atlas coordinate lookups.
 *
 * This is a pure TypeScript class with no WebGPU dependencies, suitable for
 * use with custom renderers (e.g., WebGL fallbacks).
 */
export class Bundles {
  #bundles: Map<BundleId, CpuBundle> = new Map();
  #textures: Map<TextureId, AtlasCoords[]> = new Map();
  #atlasSize: number;

  constructor(options: BundlesOptions = {}) {
    this.#atlasSize = options.atlasSize ?? 4096;
  }

  /**
   * Register a bundle of pre-baked texture atlases.
   *
   * @param bundleId - Unique identifier for this bundle
   * @param opts - Atlas bundle options containing atlas definitions
   * @returns The bundle ID
   */
  async registerAtlasBundle(
    bundleId: BundleId,
    opts: AtlasBundleOpts,
  ): Promise<BundleId> {
    const atlases: CpuTextureAtlas[] = [];

    for (const atlas of opts.atlases) {
      const jsonUrl =
        atlas.json ??
        new URL(
          atlas.png!.toString().replace(".png", ".json"),
          atlas.png!.origin,
        );
      const pngUrl =
        atlas.png ??
        new URL(
          atlas.json!.toString().replace(".json", ".png"),
          atlas.json!.origin,
        );

      const atlasDef = await (await fetch(jsonUrl)).json();

      // For CPU-only usage, we may not need the actual bitmap
      // but we fetch it for compatibility and to get dimensions
      const bitmap = !opts.rg8
        ? await this.#getBitmapFromUrl(pngUrl)
        : await createImageBitmap(new ImageData(1, 1)); // placeholder if using rg8

      let rg8Bytes: Uint8Array<ArrayBuffer> | undefined;
      if (opts.rg8) {
        const rg8url = new URL(
          pngUrl.toString().replace(".png", ".rg8.gz"),
          pngUrl.origin,
        );
        rg8Bytes = await this.#fetchRg8Bytes(rg8url);
      }

      const cpuTextureAtlas: CpuTextureAtlas = {
        texture: bitmap,
        rg8Bytes,
        textureRegions: new Map(),
        width: opts.rg8 ? this.#atlasSize : bitmap.width,
        height: opts.rg8 ? this.#atlasSize : bitmap.height,
      };

      // Parse Pixi JSON format into TextureRegions
      for (const [assetId, frame] of Object.entries(atlasDef.frames) as [
        string,
        PixiRegion,
      ][]) {
        const textureRegion = this.#parsePixiFrame(
          frame,
          cpuTextureAtlas.width,
          cpuTextureAtlas.height,
        );
        cpuTextureAtlas.textureRegions.set(assetId, textureRegion);
      }

      atlases.push(cpuTextureAtlas);
    }

    this.#bundles.set(bundleId, {
      atlases,
      atlasIndices: [],
      isLoaded: false,
    });

    return bundleId;
  }

  /**
   * Register a bundle with pre-built CPU texture atlases.
   * Used internally by AssetManager for texture bundles that require GPU packing.
   *
   * @param bundleId - Unique identifier for this bundle
   * @param atlases - Pre-built CPU texture atlases
   */
  registerRawBundle(bundleId: BundleId, atlases: CpuTextureAtlas[]): void {
    this.#bundles.set(bundleId, {
      atlases,
      atlasIndices: [],
      isLoaded: false,
    });
  }

  /**
   * Check if a bundle is registered.
   *
   * @param bundleId - The bundle ID to check
   */
  hasBundle(bundleId: BundleId): boolean {
    return this.#bundles.has(bundleId);
  }

  /**
   * Check if a bundle is loaded.
   *
   * @param bundleId - The bundle ID to check
   */
  isBundleLoaded(bundleId: BundleId): boolean {
    const bundle = this.#bundles.get(bundleId);
    return bundle?.isLoaded ?? false;
  }

  /**
   * Get the atlas indices for a loaded bundle.
   *
   * @param bundleId - The bundle ID
   * @returns Array of atlas indices, or empty array if not loaded
   */
  getBundleAtlasIndices(bundleId: BundleId): number[] {
    const bundle = this.#bundles.get(bundleId);
    return bundle?.atlasIndices ?? [];
  }

  /**
   * Mark a bundle as loaded without populating texture lookups.
   * Used when texture lookups are already populated via loadAtlas.
   *
   * @param bundleId - The bundle to mark as loaded
   * @param atlasIndices - Array of atlas indices, one per atlas
   */
  setBundleLoaded(bundleId: BundleId, atlasIndices: number[]): void {
    const bundle = this.#bundles.get(bundleId);
    if (!bundle) {
      throw new Error(`Bundle ${bundleId} not found`);
    }
    bundle.atlasIndices = atlasIndices;
    bundle.isLoaded = true;
  }

  /**
   * Mark a bundle as loaded and populate texture lookups.
   * For standalone usage (without AssetManager).
   *
   * @param bundleId - The bundle to mark as loaded
   * @param atlasIndices - Array of atlas indices, one per atlas. If not provided, indices are auto-assigned sequentially.
   */
  markBundleLoaded(bundleId: BundleId, atlasIndices?: number[]): void {
    const bundle = this.#bundles.get(bundleId);
    if (!bundle) {
      throw new Error(`Bundle ${bundleId} not found`);
    }

    if (bundle.isLoaded) {
      console.warn(`Bundle ${bundleId} is already loaded.`);
      return;
    }

    // Use provided indices or auto-assign sequential ones
    const indices =
      atlasIndices ?? bundle.atlases.map(() => this.#getNextAtlasIndex());

    if (indices.length !== bundle.atlases.length) {
      throw new Error(
        `Expected ${bundle.atlases.length} atlas indices, got ${indices.length}`,
      );
    }

    for (let i = 0; i < bundle.atlases.length; i++) {
      const atlas = bundle.atlases[i];
      const atlasIndex = indices[i];
      bundle.atlasIndices.push(atlasIndex);

      for (const [id, region] of atlas.textureRegions) {
        const coords: AtlasCoords = { ...region, atlasIndex };
        const existing = this.#textures.get(id);
        if (existing) {
          existing.push(coords);
        } else {
          this.#textures.set(id, [coords]);
        }
      }
    }

    bundle.isLoaded = true;
  }

  /**
   * Unmark a bundle as loaded and remove texture lookups.
   *
   * @param bundleId - The bundle to unload
   */
  unloadBundle(bundleId: BundleId): void {
    const bundle = this.#bundles.get(bundleId);
    if (!bundle) {
      throw new Error(`Bundle ${bundleId} not found`);
    }

    if (!bundle.isLoaded) {
      console.warn(`Bundle ${bundleId} is not loaded.`);
      return;
    }

    // Remove texture entries for this bundle's atlas indices
    for (const atlasIndex of bundle.atlasIndices) {
      for (const [id, coords] of this.#textures.entries()) {
        const indexToRemove = coords.findIndex(
          (coord) => coord.atlasIndex === atlasIndex,
        );
        if (indexToRemove !== -1) {
          coords.splice(indexToRemove, 1);
        }
        if (!coords.length) {
          this.#textures.delete(id);
        }
      }
    }

    bundle.isLoaded = false;
    bundle.atlasIndices = [];
  }

  /**
   * A read-only map of all currently loaded textures.
   */
  get textures(): ReadonlyMap<TextureId, AtlasCoords[]> {
    return this.#textures;
  }

  /**
   * A read-only array of all currently loaded texture ids.
   */
  get textureIds(): TextureId[] {
    return Array.from(this.#textures.keys());
  }

  /**
   * Get the atlas coordinates for a texture.
   *
   * @param id - The texture ID
   * @returns Array of atlas coordinates (may have multiple if texture exists in multiple atlases)
   */
  getAtlasCoords(id: TextureId): AtlasCoords[] {
    const coords = this.#textures.get(id);
    if (!coords) {
      throw new Error(
        `Texture ${id} not found. Have you registered and loaded a bundle containing this texture?`,
      );
    }
    return coords;
  }

  /**
   * Set the atlas coordinates for a texture.
   * This allows for UV precision adjustments.
   *
   * @param id - The texture ID
   * @param coords - The atlas coordinates to set
   */
  setAtlasCoords(id: TextureId, coords: AtlasCoords): void {
    const oldCoords = this.#textures.get(id);
    if (!oldCoords) return;
    const indexToModify = oldCoords.findIndex(
      (coord) => coord.atlasIndex === coords.atlasIndex,
    );
    if (indexToModify === -1) return;
    oldCoords[indexToModify] = coords;
    this.#textures.set(id, oldCoords);
  }

  /**
   * Add atlas coordinates for a texture entry.
   * Used by AssetManager.loadAtlas for textures loaded outside of bundles.
   *
   * @param id - The texture ID
   * @param coords - The atlas coordinates to add
   */
  addTextureEntry(id: TextureId, coords: AtlasCoords): void {
    const existing = this.#textures.get(id);
    if (existing) {
      existing.push(coords);
    } else {
      this.#textures.set(id, [coords]);
    }
  }

  /**
   * Remove texture entries for a specific atlas index.
   * Used by AssetManager.unloadAtlas.
   *
   * @param atlasIndex - The atlas index to remove entries for
   */
  removeTextureEntriesForAtlas(atlasIndex: number): void {
    for (const [id, coords] of this.#textures.entries()) {
      const indexToRemove = coords.findIndex(
        (coord) => coord.atlasIndex === atlasIndex,
      );
      if (indexToRemove !== -1) {
        coords.splice(indexToRemove, 1);
      }
      if (!coords.length) {
        this.#textures.delete(id);
      }
    }
  }

  /**
   * Get the texture region (without atlas index) for a texture.
   *
   * @param id - The texture ID
   * @returns The texture region, or undefined if not found
   */
  getTextureRegion(id: TextureId): TextureRegion | undefined {
    const coords = this.#textures.get(id);
    if (!coords || coords.length === 0) return undefined;

    const { atlasIndex: _, ...region } = coords[0];
    return region;
  }

  /**
   * Get the crop offset for a texture.
   *
   * @param id - The texture ID
   * @returns The crop offset vector
   */
  getTextureOffset(id: TextureId): Vec2 {
    const coords = this.#textures.get(id);
    if (!coords) {
      throw new Error(
        `Texture ${id} not found. Have you registered and loaded a bundle containing this texture?`,
      );
    }
    return coords[0].cropOffset;
  }

  /**
   * Get the original (uncropped) size of a texture.
   *
   * @param id - The texture ID
   * @returns The original size in pixels
   */
  getSize(id: TextureId): Size {
    const coords = this.getAtlasCoords(id);
    const uvScale = coords[0].uvScale;
    return {
      width: uvScale.width * this.#atlasSize,
      height: uvScale.height * this.#atlasSize,
    };
  }

  /**
   * Get the cropped size of a texture.
   *
   * @param id - The texture ID
   * @returns The cropped size in pixels
   */
  getCroppedSize(id: TextureId): Size {
    const coords = this.getAtlasCoords(id);
    const uvScaleCropped = coords[0].uvScaleCropped;
    if (uvScaleCropped) {
      return {
        width: uvScaleCropped.width * this.#atlasSize,
        height: uvScaleCropped.height * this.#atlasSize,
      };
    }
    return this.getSize(id);
  }

  /**
   * Check if a texture exists.
   *
   * @param id - The texture ID
   * @returns True if the texture is registered
   */
  hasTexture(id: TextureId): boolean {
    return this.#textures.has(id);
  }

  /**
   * Get all registered bundle IDs.
   */
  getRegisteredBundleIds(): BundleId[] {
    return Array.from(this.#bundles.keys());
  }

  /**
   * Get all loaded bundle IDs.
   */
  getLoadedBundleIds(): BundleId[] {
    return Array.from(this.#bundles.entries())
      .filter(([, bundle]) => bundle.isLoaded)
      .map(([id]) => id);
  }

  /**
   * Get the CPU-side atlas data for a bundle.
   * Useful for custom renderers that need access to the raw atlas data.
   *
   * @param bundleId - The bundle ID
   * @returns Array of CPU texture atlases
   */
  getBundleAtlases(bundleId: BundleId): CpuTextureAtlas[] {
    const bundle = this.#bundles.get(bundleId);
    if (!bundle) {
      throw new Error(`Bundle ${bundleId} not found`);
    }
    return bundle.atlases;
  }

  /**
   * The atlas size used for coordinate calculations.
   */
  get atlasSize(): number {
    return this.#atlasSize;
  }

  // --- Private helpers ---

  #parsePixiFrame(
    frame: PixiRegion,
    atlasWidth: number,
    atlasHeight: number,
  ): TextureRegion {
    const leftCrop = frame.spriteSourceSize.x;
    const rightCrop =
      frame.sourceSize.w - frame.spriteSourceSize.x - frame.spriteSourceSize.w;
    const topCrop = frame.spriteSourceSize.y;
    const bottomCrop =
      frame.sourceSize.h - frame.spriteSourceSize.y - frame.spriteSourceSize.h;

    return {
      cropOffset: {
        x: leftCrop - rightCrop,
        y: bottomCrop - topCrop,
      },
      originalSize: {
        width: frame.sourceSize.w,
        height: frame.sourceSize.h,
      },
      uvOffset: {
        x: frame.frame.x / atlasWidth,
        y: frame.frame.y / atlasHeight,
      },
      uvScale: {
        width: frame.sourceSize.w / atlasWidth,
        height: frame.sourceSize.h / atlasHeight,
      },
      uvScaleCropped: {
        width: frame.frame.w / atlasWidth,
        height: frame.frame.h / atlasHeight,
      },
    };
  }

  async #getBitmapFromUrl(url: URL): Promise<ImageBitmap> {
    const response = await fetch(url);
    const blob = await response.blob();
    return createImageBitmap(blob);
  }

  async #fetchRg8Bytes(url: URL): Promise<Uint8Array<ArrayBuffer>> {
    const response = await fetch(url);
    const enc = (response.headers.get("content-encoding") || "").toLowerCase();

    // If server/CDN already set Content-Encoding, Fetch returns decompressed bytes
    if (enc.includes("gzip") || enc.includes("br") || enc.includes("deflate")) {
      return new Uint8Array(await response.arrayBuffer());
    }

    if (!response.body) {
      throw new Error("Response body of rg8 file is null");
    }

    const ds = new DecompressionStream("gzip");
    const ab = await new Response(response.body.pipeThrough(ds)).arrayBuffer();
    return new Uint8Array(ab);
  }

  #getNextAtlasIndex(): number {
    // Find the highest used atlas index and return the next one
    let maxIndex = -1;
    for (const bundle of this.#bundles.values()) {
      for (const idx of bundle.atlasIndices) {
        if (idx > maxIndex) maxIndex = idx;
      }
    }
    return maxIndex + 1;
  }
}
