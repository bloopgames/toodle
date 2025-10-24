import type { Size } from "../coreTypes/Size";
import type { Vec2 } from "../coreTypes/Vec2";
import type { Limits } from "../limits";
import { JumboQuadNode } from "../scene/JumboQuadNode";
import { QuadNode } from "../scene/QuadNode";
import type { SceneNode } from "../scene/SceneNode";
import { FontPipeline } from "../text/FontPipeline";
import { MsdfFont } from "../text/MsdfFont";
import { TextShader } from "../text/TextShader";
import { TextureComputeShader } from "./TextureComputeShader";
import type {
  AtlasBundleOpts,
  AtlasCoords,
  CpuTextureAtlas,
  PixiRegion,
  TextureBundleOpts,
  TextureRegion,
  TextureWithMetadata,
} from "./types";
import { getBitmapFromUrl, packBitmapsToAtlas } from "./util";

export type TextureId = string;
export type BundleId = string;
export type FontId = string;

type Bundle = {
  atlases: CpuTextureAtlas[];
  isLoaded: boolean;
  atlasIndices: number[];
};

export class AssetManager {
  readonly textureAtlas: GPUTexture;
  #device: GPUDevice;
  #presentationFormat: GPUTextureFormat;
  #bundles: Map<BundleId, Bundle> = new Map();
  #textures: Map<string, AtlasCoords[]> = new Map();
  #fonts: Map<string, TextShader> = new Map();
  #cropComputeShader: TextureComputeShader;
  #limits: Limits;
  #availableIndices: Set<number> = new Set();

  constructor(
    device: GPUDevice,
    presentationFormat: GPUTextureFormat,
    limits: Limits,
  ) {
    this.#device = device;
    this.#presentationFormat = presentationFormat;
    this.#limits = limits;
    this.textureAtlas = device.createTexture({
      label: "Asset Manager Atlas Texture",
      size: [
        this.#limits.textureSize,
        this.#limits.textureSize,
        this.#limits.textureArrayLayers,
      ],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.#cropComputeShader = TextureComputeShader.create(device);
    this.#availableIndices = new Set(
      Array.from({ length: limits.textureArrayLayers }, (_, i) => i),
    );
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
    return {
      width: originalScale.width * this.textureAtlas.width,
      height: originalScale.height * this.textureAtlas.height,
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
      return {
        width: scaledUvs.width * this.textureAtlas.width,
        height: scaledUvs.height * this.textureAtlas.height,
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
    if (!this.#textures.has(id)) {
      throw new Error(
        `Texture ${id} not found in atlas. Have you called toodle.loadTextures with this id or toodle.loadBundle with a bundle that contains it?`,
      );
    }

    return this.#textures.get(id)![0].uvScaleCropped === undefined;
  }

  /**
   * A read-only map of all currently loaded textures.
   */
  get textures() {
    return this.#textures;
  }

  /**
   * A read-only array of all currently loaded texture ids.
   */
  get textureIds() {
    return Array.from(this.#textures.keys());
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
   */
  async loadTexture(
    id: TextureId,
    url: URL | ImageBitmap,
    options?: Partial<TextureBundleOpts>,
  ) {
    const bitmap =
      url instanceof ImageBitmap ? url : await getBitmapFromUrl(url);

    let textureWrapper: TextureWithMetadata = this.#wrapBitmapToTexture(
      bitmap,
      id,
    );
    const atlasIndex = this.extra.nextAvailableAtlasIndex();

    if (options?.cropTransparentPixels) {
      textureWrapper =
        await this.#cropComputeShader.processTexture(textureWrapper);
    }

    this.#copyTextureToAtlas(textureWrapper.texture, atlasIndex);

    const coords: AtlasCoords = {
      uvOffset: { x: 0, y: 0 },
      cropOffset: textureWrapper.cropOffset,
      uvScale: {
        width: textureWrapper.texture.width / this.textureAtlas.width,
        height: textureWrapper.texture.height / this.textureAtlas.height,
      },
      originalSize: textureWrapper.originalSize,
      uvScaleCropped: {
        width: textureWrapper.texture.width / this.textureAtlas.width,
        height: textureWrapper.texture.height / this.textureAtlas.height,
      },
      atlasIndex,
    };

    this.#textures.set(id, [coords]);
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

    if (opts.autoLoad) {
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
    const bundle = this.#bundles.get(bundleId);
    if (!bundle) {
      throw new Error(`Bundle ${bundleId} not found`);
    }

    if (bundle.isLoaded) {
      console.warn(`Bundle ${bundleId} is already loaded.`);
      return;
    }

    for (const atlas of bundle.atlases) {
      const atlasIndex = await this.extra.loadAtlas(atlas);
      bundle.atlasIndices.push(atlasIndex);
    }

    bundle.isLoaded = true;
  }

  /**
   * Unload a bundle of textures from the gpu - this marks the gpu-side texture atlas
   * as available for future texture loading.
   *
   * @param bundleId - The id of the bundle to unload
   */
  async unloadBundle(bundleId: BundleId) {
    const bundle = this.#bundles.get(bundleId);
    if (!bundle) {
      throw new Error(`Bundle ${bundleId} not found`);
    }

    if (!bundle.isLoaded) {
      console.warn(`Bundle ${bundleId} is not loaded.`);
      return;
    }

    await Promise.all(
      bundle.atlasIndices.map((atlasIndex) =>
        this.extra.unloadAtlas(atlasIndex),
      ),
    );

    bundle.isLoaded = false;
    bundle.atlasIndices = [];
  }

  /**
   * Load a font to the gpu
   *
   * @param id - The id of the font to load
   * @param url - The url of the font to load
   * @param fallbackCharacter - The character to use as a fallback if the font does not contain a character to be rendererd
   */
  async loadFont(id: string, url: URL, fallbackCharacter = "_") {
    const font = await MsdfFont.create(id, url);
    font.fallbackCharacter = fallbackCharacter;
    const fontPipeline = await FontPipeline.create(
      this.#device,
      font,
      this.#presentationFormat,
      this.#limits.maxTextLength,
    );

    const textShader = new TextShader(
      this.#device,
      fontPipeline,
      font,
      this.#presentationFormat,
      this.#limits.instanceCount,
    );
    this.#fonts.set(id, textShader);
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

    const coords: AtlasCoords[] | undefined = this.#textures.get(
      node.textureId,
    );
    if (!coords || !coords.length) {
      throw new Error(
        `Node ${node.id} references an invalid texture ${node.textureId}.`,
      );
    }

    if (
      coords.find((coord) => coord.atlasIndex === node.atlasCoords.atlasIndex)
    )
      return;

    node.extra.setAtlasCoords(coords[0]);
  }

  /**
   * Sets a designated texture ID to the corresponding `AtlasRegion` built from a `TextureRegion` and `numerical atlas index.
   * @param id - `String` representing the texture name. I.e. "PlayerSprite"
   * @param textureRegion - `TextureRegion` corresponding the uv and texture offsets
   * @param atlasIndex - `number` of the atlas that the texture will live in.
   * @private
   */
  #addTexture(id: string, textureRegion: TextureRegion, atlasIndex: number) {
    this.#textures.set(id, [
      {
        ...textureRegion,
        atlasIndex,
      },
    ]);
  }

  /**
   *
   * @param bitmap - `ImageBitmap` to be processed into a `GPUTexture` for storage and manipulation
   * @param name - Used to name the new `GPUTexture` via labeling.
   * @private
   */
  #createTextureFromImageBitmap(bitmap: ImageBitmap, name: string): GPUTexture {
    const texture = this.#device.createTexture({
      label: `${name} Intermediary Texture`,
      size: [bitmap.width, bitmap.height],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.#device.queue.copyExternalImageToTexture(
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
    const images = new Map<string, TextureWithMetadata>();

    let networkLoadTime = 0;
    await Promise.all(
      Object.entries(opts.textures).map(async ([id, url]) => {
        const now = performance.now();
        const bitmap = await getBitmapFromUrl(url);
        networkLoadTime += performance.now() - now;
        let textureWrapper: TextureWithMetadata = this.#wrapBitmapToTexture(
          bitmap,
          id,
        );

        if (opts.cropTransparentPixels) {
          textureWrapper =
            await this.#cropComputeShader.processTexture(textureWrapper);
        }
        images.set(id, textureWrapper);
      }),
    );

    const atlases = await packBitmapsToAtlas(
      images,
      this.#limits.textureSize,
      this.#device,
    );

    this.#bundles.set(bundleId, {
      atlases,
      atlasIndices: [],
      isLoaded: false,
    });
  }

  async #registerBundleFromAtlases(bundleId: BundleId, opts: AtlasBundleOpts) {
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
      const bitmap = await getBitmapFromUrl(pngUrl);

      const cpuTextureAtlas: CpuTextureAtlas = {
        texture: bitmap,
        textureRegions: new Map(),
      };

      for (const [assetId, frame] of Object.entries(atlasDef.frames) as [
        string,
        PixiRegion,
      ][]) {
        const leftCrop = frame.spriteSourceSize.x;
        const rightCrop =
          frame.sourceSize.w -
          frame.spriteSourceSize.x -
          frame.spriteSourceSize.w;
        const topCrop = frame.spriteSourceSize.y;
        const bottomCrop =
          frame.sourceSize.h -
          frame.spriteSourceSize.y -
          frame.spriteSourceSize.h;

        cpuTextureAtlas.textureRegions.set(assetId, {
          cropOffset: {
            x: leftCrop - rightCrop,
            y: bottomCrop - topCrop,
          },
          originalSize: {
            width: frame.sourceSize.w,
            height: frame.sourceSize.h,
          },
          uvOffset: {
            x: frame.frame.x / bitmap.width,
            y: frame.frame.y / bitmap.height,
          },
          uvScale: {
            width: frame.sourceSize.w / bitmap.width,
            height: frame.sourceSize.h / bitmap.height,
          },
          uvScaleCropped: {
            width: frame.frame.w / bitmap.width,
            height: frame.frame.h / bitmap.height,
          },
        });
      }

      atlases.push(cpuTextureAtlas);
    }

    this.#bundles.set(bundleId, {
      atlases,
      atlasIndices: [],
      isLoaded: false,
    });
  }

  /**
   * Advanced and niche features
   */
  extra = {
    // Get an array of all currently registered bundle ids.
    getRegisteredBundleIds: (): string[] => {
      return this.#bundles ? Array.from(this.#bundles.keys()) : [];
    },

    // Get an array of all currently loaded bundle ids.
    getLoadedBundleIds: (): string[] => {
      return Array.from(this.#bundles.entries())
        .filter(([, value]) => value.isLoaded)
        .map(([key]) => key);
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
      const oldCoords: AtlasCoords[] | undefined = this.#textures.get(id);
      if (!oldCoords) return;
      const indexToModify = oldCoords.findIndex(
        (coord) => coord.atlasIndex === coords.atlasIndex,
      );
      if (indexToModify === -1) return;
      oldCoords[indexToModify] = coords;
      this.#textures.set(id, oldCoords);
    },

    /**
     * Get the atlas coordinates for a texture.
     *
     * @param id - The id of the texture to get the atlas coordinates for
     * @returns An array of the atlas coordinates for the texture
     */
    getAtlasCoords: (id: TextureId): AtlasCoords[] => {
      if (!this.#textures.has(id)) {
        throw new Error(
          `Texture ${id} not found in atlas. Have you called toodle.loadBundle with a bundle that contains this id (or toodle.loadTextures with this id as a key)?`,
        );
      }
      return this.#textures.get(id) ?? [];
    },

    /**
     * Get the texture default offset
     *
     * @param id - The id of the texture to get the atlas coordinates for
     * @returns Point of the texture's associated X,Y offset
     */
    getTextureOffset: (id: TextureId): Vec2 => {
      const texture: AtlasCoords[] | undefined = this.#textures.get(id);
      if (!texture) {
        throw new Error(
          `Texture ${id} not found in atlas. Have you called toodle.loadTextures with this id or toodle.loadBundle with a bundle that contains it?`,
        );
      }
      return texture[0].cropOffset;
    },

    /**
     * Get diagnostics on texture atlas usage
     *
     * @returns Usage stats for texture atlases
     */
    getAtlasUsage: () => {
      return {
        /**
         * The number of texture atlases that are currently unused
         * and available to load textures into.
         */
        available: this.#availableIndices.size,
        /**
         * The number of texture atlases that are currently in use.
         */
        used: this.#limits.textureArrayLayers - this.#availableIndices.size,
        /**
         * The total number of texture atlases that can be loaded.
         */
        total: this.#limits.textureArrayLayers,
      };
    },

    /**
     * Consume the next available atlas index.
     *
     */
    nextAvailableAtlasIndex: () => {
      for (let i = 0; i < this.#limits.textureArrayLayers; i++) {
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
      this.#device.queue.copyExternalImageToTexture(
        {
          source: atlas.texture,
        },
        {
          texture: this.textureAtlas,
          origin: [0, 0, atlasIndex],
        },
        [atlas.texture.width, atlas.texture.height, 1],
      );

      for (const [id, region] of atlas.textureRegions) {
        const existing = this.#textures.get(id);
        if (existing) {
          existing.push({ ...region, atlasIndex });
        } else this.#addTexture(id, region, atlasIndex);
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
      for (const [id, coords] of this.#textures.entries()) {
        const indexToModify = coords.findIndex(
          (coord) => coord.atlasIndex === atlasIndex,
        );
        if (indexToModify !== -1) {
          coords.splice(indexToModify, 1);
        }
        if (!coords.length) {
          this.#textures.delete(id);
        }
      }
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
    const copyEncoder: GPUCommandEncoder = this.#device.createCommandEncoder();
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

    this.#device.queue.submit([copyEncoder.finish()]);
  }
  /**
   * Destroy the texture atlas. This should free up ~4gb of gpu memory (and make all draw calls fail)
   */
  destroy() {
    this.textureAtlas.destroy();
  }
}
