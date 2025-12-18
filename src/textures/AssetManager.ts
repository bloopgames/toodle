import type { IRenderBackend } from "../backends/IRenderBackend";
import type { ITextShader } from "../backends/ITextShader";
import { WebGLTextShader } from "../backends/webgl2/WebGLTextShader";
import { FontPipeline } from "../backends/webgpu/FontPipeline";
import { TextureComputeShader } from "../backends/webgpu/TextureComputeShader";
import type { WebGPUBackend } from "../backends/webgpu/WebGPUBackend";
import { WebGPUTextShader } from "../backends/webgpu/WebGPUTextShader";
import type { Size } from "../coreTypes/Size";
import type { Vec2 } from "../coreTypes/Vec2";
import { JumboQuadNode } from "../scene/JumboQuadNode";
import { QuadNode } from "../scene/QuadNode";
import type { SceneNode } from "../scene/SceneNode";
import { MsdfFont } from "../text/MsdfFont";
import { Bundles } from "./Bundles";
import type {
  AtlasBundleOpts,
  AtlasCoords,
  CpuTextureAtlas,
  TextureBundleOpts,
  TextureWithMetadata,
} from "./types";
import { getBitmapFromUrl, packBitmapsToAtlas } from "./util";

export type TextureId = string;
export type BundleId = string;
export type FontId = string;

export type AssetManagerOptions = {
  /** Existing Bundles instance to use for CPU-side storage. If not provided, a new one is created. */
  bundles?: Bundles;
  /** Which texture atlas to use (default: "default") */
  atlasId?: string;
};

export class AssetManager {
  readonly bundles: Bundles;
  #backend: IRenderBackend;
  #atlasId: string;
  #fonts: Map<string, ITextShader> = new Map();
  #cropComputeShader: TextureComputeShader | null = null;
  #availableIndices: Set<number> = new Set();

  constructor(backend: IRenderBackend, options: AssetManagerOptions = {}) {
    this.#backend = backend;
    this.#atlasId = options.atlasId ?? "default";

    const atlas = backend.getTextureAtlas(this.#atlasId);
    if (!atlas) {
      throw new Error(`Atlas "${this.#atlasId}" not found`);
    }

    this.bundles = options.bundles ?? new Bundles({ atlasSize: atlas.size });

    // Initialize compute shader only for WebGPU backend
    if (backend.type === "webgpu") {
      const device = (backend as WebGPUBackend).device;
      this.#cropComputeShader = TextureComputeShader.create(device);
    }

    this.#availableIndices = new Set(
      Array.from({ length: atlas.layers }, (_, i) => i),
    );
  }

  /**
   * Get the atlas ID this asset manager uses.
   */
  get atlasId(): string {
    return this.#atlasId;
  }

  /**
   * Get the GPU texture atlas. For WebGPU, returns GPUTexture.
   * @deprecated Access via backend.getTextureAtlas(atlasId).handle instead
   */
  get textureAtlas(): GPUTexture {
    return this.#backend.getTextureAtlas(this.#atlasId)!.handle as GPUTexture;
  }

  /**
   * Get the atlas dimensions
   */
  get atlasSize(): Size {
    const atlas = this.#backend.getTextureAtlas(this.#atlasId);
    return { width: atlas!.size, height: atlas!.size };
  }

  /**
   * True dimensions of a loaded texture, prior to any transparent pixel cropping.
   *
   * @param id - The id of the texture to get the size of
   * @returns The size of the texture
   */
  getSize(id: TextureId): Size {
    const coords = this.extra.getAtlasCoords(id);
    const originalScale = coords[0].uvScale;
    // Use atlasSize instead of textureAtlas.width/height for WebGL2 compatibility
    return {
      width: originalScale.width * this.atlasSize.width,
      height: originalScale.height * this.atlasSize.height,
    };
  }

  /**
   * Dimensions of a loaded texture, cropped to a minimal bounding box.
   *
   * @param id - The id of the texture to get the size of
   * @returns The size of the texture
   */
  getCroppedSize(id: TextureId): Size {
    const scaledUvs = this.extra.getAtlasCoords(id)[0].uvScaleCropped;
    if (scaledUvs) {
      // Use atlasSize instead of textureAtlas.width/height for WebGL2 compatibility
      return {
        width: scaledUvs.width * this.atlasSize.width,
        height: scaledUvs.height * this.atlasSize.height,
      };
    }
    return this.getSize(id);
  }

  /**
   * Whether the texture has been cropped for extra transparency.
   *
   * @param id - The id of the texture to be checked
   * @returns Whether the image has been cropped (i.e. if it has uvScaledCropped)
   */
  isCropped(id: TextureId): boolean {
    if (!this.bundles.hasTexture(id)) {
      throw new Error(
        `Texture ${id} not found in atlas. Have you called toodle.loadTextures with this id or toodle.loadBundle with a bundle that contains it?`,
      );
    }

    return this.bundles.getAtlasCoords(id)[0].uvScaleCropped === undefined;
  }

  /**
   * A read-only map of all currently loaded textures.
   */
  get textures() {
    return this.bundles.textures;
  }

  /**
   * A read-only array of all currently loaded texture ids.
   */
  get textureIds() {
    return this.bundles.textureIds;
  }

  /**
   * Debug method to load a set of textures from a record of URLS.
   *
   * @param textures Collection of strings and URLs representing the texture name and target file
   * @param options LoadingOptions used to modify the loading process
   *
   * Note: this will consume one texture atlas per texture.
   * For more efficient loading of multiple textures, consider {@link loadBundle}
   *
   * @example
   *
   * await toodle.assets.loadTextures({
   *   "myImage": new URL("assets/image.png", "https://mywebsite.com"),
   * });
   *
   * @deprecated use {@link registerBundle} instead. or {@link loadTexture} for debugging
   */
  async loadTextures(opts: TextureBundleOpts["textures"]): Promise<void> {
    await Promise.all(
      Object.entries(opts).map(([id, url]) => this.loadTexture(id, url, opts)),
    );
  }

  /**
   * Debug method to load a single texture.
   *
   * @param id ID used to name the texture
   * @param url URL or ImageBitmap target for the image
   * @param options LoadingOptions used to modify the loading process
   *
   * Note: this will consume one texture atlas per texture.
   * For more efficient loading of multiple textures, consider {@link loadBundle}
   *
   * @throws Error if using WebGL backend (use registerBundle instead)
   */
  async loadTexture(
    id: TextureId,
    url: URL | ImageBitmap,
    options?: Partial<TextureBundleOpts>,
  ) {
    if (this.#backend.type !== "webgpu") {
      throw new Error(
        "loadTexture is only supported with WebGPU backend. Use registerBundle with prebaked atlases instead.",
      );
    }

    const bitmap =
      url instanceof ImageBitmap ? url : await getBitmapFromUrl(url);

    let textureWrapper: TextureWithMetadata = this.#wrapBitmapToTexture(
      bitmap,
      id,
    );
    const atlasIndex = this.extra.nextAvailableAtlasIndex();

    if (options?.cropTransparentPixels && this.#cropComputeShader) {
      textureWrapper =
        await this.#cropComputeShader.processTexture(textureWrapper);
    }

    this.#copyTextureToAtlas(textureWrapper.texture, atlasIndex);

    const { width: atlasWidth, height: atlasHeight } = this.atlasSize;
    const coords: AtlasCoords = {
      uvOffset: { x: 0, y: 0 },
      cropOffset: textureWrapper.cropOffset,
      uvScale: {
        width: textureWrapper.texture.width / atlasWidth,
        height: textureWrapper.texture.height / atlasHeight,
      },
      originalSize: textureWrapper.originalSize,
      uvScaleCropped: {
        width: textureWrapper.texture.width / atlasWidth,
        height: textureWrapper.texture.height / atlasHeight,
      },
      atlasIndex,
    };

    this.bundles.addTextureEntry(id, coords);
    this.#availableIndices.delete(atlasIndex);

    textureWrapper.texture.destroy();
    return { id, coords };
  }

  /**
   * Register a bundle of textures.
   *
   * @param bundleId ID used to name the bundle
   * @param bundle Collection of strings and URLs representing the texture name and target file
   * @param options LoadingOptions used to modify the loading process
   *
   * See: https://toodle.gg/f849595b3ed13fc956fc1459a5cb5f0228f9d259/examples/texture-bundles.html
   */
  async registerBundle(
    bundleId: BundleId,
    opts: TextureBundleOpts | AtlasBundleOpts,
  ): Promise<BundleId> {
    if ("textures" in opts) {
      await this.#registerBundleFromTextures(bundleId, opts);
    } else {
      await this.#registerBundleFromAtlases(bundleId, opts);
    }

    const autoLoad = opts.autoLoad ?? true;
    if (autoLoad) {
      await this.loadBundle(bundleId);
    }
    return bundleId;
  }

  /**
   * Load a bundle of textures to the gpu
   *
   * See: https://toodle.gg/f849595b3ed13fc956fc1459a5cb5f0228f9d259/examples/texture-bundles.html
   */
  async loadBundle(bundleId: BundleId) {
    if (!this.bundles.hasBundle(bundleId)) {
      throw new Error(`Bundle ${bundleId} not found`);
    }

    if (this.bundles.isBundleLoaded(bundleId)) {
      console.warn(`Bundle ${bundleId} is already loaded.`);
      return;
    }

    const atlases = this.bundles.getBundleAtlases(bundleId);
    const atlasIndices: number[] = [];

    for (const atlas of atlases) {
      const atlasIndex = await this.extra.loadAtlas(atlas);
      atlasIndices.push(atlasIndex);
    }

    // Use setBundleLoaded (not markBundleLoaded) since loadAtlas already populated textures
    this.bundles.setBundleLoaded(bundleId, atlasIndices);
  }

  /**
   * Unload a bundle of textures from the gpu - this marks the gpu-side texture atlas
   * as available for future texture loading.
   *
   * @param bundleId - The id of the bundle to unload
   */
  async unloadBundle(bundleId: BundleId) {
    if (!this.bundles.hasBundle(bundleId)) {
      throw new Error(`Bundle ${bundleId} not found`);
    }

    if (!this.bundles.isBundleLoaded(bundleId)) {
      console.warn(`Bundle ${bundleId} is not loaded.`);
      return;
    }

    const atlasIndices = this.bundles.getBundleAtlasIndices(bundleId);
    await Promise.all(
      atlasIndices.map((atlasIndex) => this.extra.unloadAtlas(atlasIndex)),
    );

    this.bundles.unloadBundle(bundleId);
  }

  /**
   * Load a font for text rendering (WebGPU) or measurement only (WebGL).
   *
   * @param id - The id of the font to load
   * @param url - The url of the font JSON to load
   * @param fallbackCharacter - The character to use as a fallback if the font does not contain a character to be rendered
   *
   * @remarks
   * On WebGPU backend, loads the full font for rendering.
   * On WebGL backend, loads the font for text measurement only. Attempting to
   * render text on WebGL will throw an error.
   */
  async loadFont(id: string, url: URL, fallbackCharacter = "_") {
    const limits = this.#backend.limits;
    const font = await MsdfFont.create(id, url);
    font.fallbackCharacter = fallbackCharacter;

    if (this.#backend.type === "webgpu") {
      const webgpuBackend = this.#backend as WebGPUBackend;
      const device = webgpuBackend.device;
      const presentationFormat = webgpuBackend.presentationFormat;

      const fontPipeline = await FontPipeline.create(
        device,
        font,
        presentationFormat,
        limits.maxTextLength,
      );

      const textShader = new WebGPUTextShader(
        webgpuBackend,
        fontPipeline,
        font,
        presentationFormat,
        limits.instanceCount,
      );
      this.#fonts.set(id, textShader);
    } else {
      // WebGL: font loaded for measurement, but rendering will throw
      const textShader = new WebGLTextShader(font, limits.maxTextLength);
      this.#fonts.set(id, textShader);
    }

    return id;
  }

  getFont(id: string) {
    if (!this.#fonts.has(id)) {
      throw new Error(
        `Font ${id} not found in atlas. Have you called toodle.loadFont with this id?`,
      );
    }
    return this.#fonts.get(id)!;
  }

  validateTextureReference(node: SceneNode | QuadNode) {
    if (
      !(node instanceof QuadNode) ||
      node.isPrimitive ||
      node instanceof JumboQuadNode
    )
      return;

    if (!this.bundles.hasTexture(node.textureId)) {
      throw new Error(
        `Node ${node.id} references an invalid texture ${node.textureId}.`,
      );
    }

    const coords = this.bundles.getAtlasCoords(node.textureId);
    if (
      coords.find((coord) => coord.atlasIndex === node.atlasCoords.atlasIndex)
    )
      return;

    node.extra.setAtlasCoords(coords[0]);
  }

  /**
   *
   * @param bitmap - `ImageBitmap` to be processed into a `GPUTexture` for storage and manipulation
   * @param name - Used to name the new `GPUTexture` via labeling.
   * @private
   */
  #createTextureFromImageBitmap(bitmap: ImageBitmap, name: string): GPUTexture {
    const device = (this.#backend as WebGPUBackend).device;
    const texture = device.createTexture({
      label: `${name} Intermediary Texture`,
      size: [bitmap.width, bitmap.height],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    device.queue.copyExternalImageToTexture(
      {
        source: bitmap,
      },
      {
        texture,
      },
      [bitmap.width, bitmap.height],
    );
    return texture;
  }

  async #registerBundleFromTextures(
    bundleId: BundleId,
    opts: TextureBundleOpts,
  ) {
    if (this.#backend.type !== "webgpu") {
      throw new Error(
        "Dynamic texture bundle registration is only supported with WebGPU backend. Use prebaked atlases instead.",
      );
    }

    const device = (this.#backend as WebGPUBackend).device;
    const images = new Map<string, TextureWithMetadata>();

    let _networkLoadTime = 0;
    await Promise.all(
      Object.entries(opts.textures).map(async ([id, url]) => {
        const now = performance.now();
        const bitmap = await getBitmapFromUrl(url);
        _networkLoadTime += performance.now() - now;
        let textureWrapper: TextureWithMetadata = this.#wrapBitmapToTexture(
          bitmap,
          id,
        );

        if (opts.cropTransparentPixels && this.#cropComputeShader) {
          textureWrapper =
            await this.#cropComputeShader.processTexture(textureWrapper);
        }
        images.set(id, textureWrapper);
      }),
    );

    const atlases = await packBitmapsToAtlas(
      images,
      this.#backend.limits.textureSize,
      device,
    );

    this.bundles.registerDynamicBundle(bundleId, atlases);
  }

  async #registerBundleFromAtlases(bundleId: BundleId, opts: AtlasBundleOpts) {
    // Delegate to the Bundles instance for atlas parsing
    await this.bundles.registerAtlasBundle(bundleId, opts);
  }

  /**
   * Advanced and niche features
   */
  extra = {
    // Get an array of all currently registered bundle ids.
    getRegisteredBundleIds: (): string[] => {
      return this.bundles.getRegisteredBundleIds();
    },

    // Get an array of all currently loaded bundle ids.
    getLoadedBundleIds: (): string[] => {
      return this.bundles.getLoadedBundleIds();
    },

    /**
     * Set the atlas coordinates for a texture.
     *
     * This should not be necessary for most use cases. This allows for UV precision
     *
     * @param id - The id of the texture to set the atlas coordinates for
     * @param coords - The atlas coordinates to set
     */
    setAtlasCoords: (id: TextureId, coords: AtlasCoords) => {
      this.bundles.setAtlasCoords(id, coords);
    },

    /**
     * Get the atlas coordinates for a texture.
     *
     * @param id - The id of the texture to get the atlas coordinates for
     * @returns An array of the atlas coordinates for the texture
     */
    getAtlasCoords: (id: TextureId): AtlasCoords[] => {
      return this.bundles.getAtlasCoords(id);
    },

    /**
     * Get the texture default offset
     *
     * @param id - The id of the texture to get the atlas coordinates for
     * @returns Point of the texture's associated X,Y offset
     */
    getTextureOffset: (id: TextureId): Vec2 => {
      return this.bundles.getTextureOffset(id);
    },

    /**
     * Get diagnostics on texture atlas usage
     *
     * @returns Usage stats for texture atlases
     */
    getAtlasUsage: () => {
      const atlas = this.#backend.getTextureAtlas(this.#atlasId);
      const totalLayers = atlas?.layers ?? 0;
      return {
        /**
         * The number of texture atlases that are currently unused
         * and available to load textures into.
         */
        available: this.#availableIndices.size,
        /**
         * The number of texture atlases that are currently in use.
         */
        used: totalLayers - this.#availableIndices.size,
        /**
         * The total number of texture atlases that can be loaded.
         */
        total: totalLayers,
      };
    },

    /**
     * Consume the next available atlas index.
     *
     */
    nextAvailableAtlasIndex: () => {
      const atlas = this.#backend.getTextureAtlas(this.#atlasId);
      const totalLayers = atlas?.layers ?? 0;
      for (let i = 0; i < totalLayers; i++) {
        if (this.#availableIndices.has(i)) {
          this.#availableIndices.delete(i);
          return i;
        }
      }
      throw new Error("Texture atlas is full - too many textures loaded.");
    },

    /**
     * Load a texture atlas from a CpuTextureAtlas.
     *
     * @param atlas - The texture atlas to load
     * @returns The index of the atlas
     */
    loadAtlas: async (atlas: CpuTextureAtlas) => {
      const atlasIndex = this.extra.nextAvailableAtlasIndex();

      // Delegate to backend for actual GPU upload
      await this.#backend.uploadAtlas(atlas, atlasIndex, this.#atlasId);

      for (const [id, region] of atlas.textureRegions) {
        this.bundles.addTextureEntry(id, { ...region, atlasIndex });
      }
      return atlasIndex;
    },

    /**
     * Unload an atlas from the texture atlas.
     *
     * @param atlasIndex - The index of the atlas to unload
     */
    unloadAtlas: async (atlasIndex: number) => {
      this.#availableIndices.add(atlasIndex);
      this.bundles.removeTextureEntriesForAtlas(atlasIndex);
    },
  };

  #wrapBitmapToTexture(
    bitmap: ImageBitmap,
    name = "Unknown",
  ): TextureWithMetadata {
    const texture: GPUTexture = this.#createTextureFromImageBitmap(
      bitmap,
      name,
    );
    return {
      texture,
      cropOffset: { x: 0, y: 0 },
      originalSize: { width: texture.width, height: texture.height },
    };
  }

  #copyTextureToAtlas(texture: GPUTexture, atlasIndex: number) {
    const device = (this.#backend as WebGPUBackend).device;
    const copyEncoder: GPUCommandEncoder = device.createCommandEncoder();
    copyEncoder.copyTextureToTexture(
      {
        texture: texture,
        mipLevel: 0,
        origin: [0, 0, 0],
      },
      {
        texture: this.textureAtlas,
        mipLevel: 0,
        origin: [0, 0, atlasIndex],
      },
      [texture.width, texture.height, 1],
    );

    device.queue.submit([copyEncoder.finish()]);
  }

  /**
   * Destroy the texture atlas. This should free up ~4gb of gpu memory (and make all draw calls fail)
   */
  destroy() {
    this.#backend.destroy();
  }
}
