import type {
  CpuTextureAtlas,
  TextureRegion,
  TextureWithMetadata,
} from "./types";

export async function getBitmapFromUrl(url: URL): Promise<ImageBitmap> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return await createImageBitmap(blob);
  } catch (e) {
    console.error(`Failed to load texture from ${url.href}`, e);
    throw e;
  }
}

export async function packBitmapsToAtlas(
  images: Map<string, TextureWithMetadata>,
  textureSize: number,
  device: GPUDevice,
): Promise<CpuTextureAtlas[]> {
  const cpuTextureAtlases: CpuTextureAtlas[] = [];
  const packed: PackedTexture[] = [];
  const spaces: Rectangle[] = [
    { x: 0, y: 0, width: textureSize, height: textureSize },
  ];

  let atlasRegionMap = new Map<string, TextureRegion>();

  for (const [id, { texture, cropOffset: offset, originalSize }] of images) {
    // Find best fitting space using guillotine method
    let bestSpace = -1;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let i = 0; i < spaces.length; i++) {
      const space = spaces[i];
      if (texture.width <= space.width && texture.height <= space.height) {
        // Score based on how well it fits (smaller score is better)
        const score = Math.abs(
          space.width * space.height - texture.width * texture.height,
        );
        if (score < bestScore) {
          bestScore = score;
          bestSpace = i;
        }
      }
    }

    if (bestSpace === -1) {
      const tex = await createTextureAtlasTexture(device, packed, textureSize);
      cpuTextureAtlases.push({
        texture: tex,
        textureRegions: atlasRegionMap,
        width: tex.width,
        height: tex.height,
      });

      atlasRegionMap = new Map<string, TextureRegion>();
      packed.length = 0;

      spaces.length = 0;
      spaces.push({
        x: 0,
        y: 0,
        width: textureSize,
        height: textureSize,
      });
      bestSpace = 0;
    }

    const space = spaces[bestSpace];

    // Pack the image
    packed.push(<PackedTexture>{
      texture: await textureToBitmap(
        device,
        texture,
        texture.width,
        texture.height,
      ),
      x: space.x,
      y: space.y,
      width: texture.width,
      height: texture.height,
    });

    texture.destroy();

    // Split remaining space into two new spaces
    spaces.splice(bestSpace, 1);

    if (space.width - texture.width > 0) {
      spaces.push({
        x: space.x + texture.width,
        y: space.y,
        width: space.width - texture.width,
        height: texture.height,
      });
    }

    if (space.height - texture.height > 0) {
      spaces.push({
        x: space.x,
        y: space.y + texture.height,
        width: space.width,
        height: space.height - texture.height,
      });
    }

    // Create atlas coords
    atlasRegionMap.set(id, {
      uvOffset: {
        x: space.x / textureSize,
        y: space.y / textureSize,
      },
      uvScale: {
        width: originalSize.width / textureSize,
        height: originalSize.height / textureSize,
      },
      uvScaleCropped: {
        width: texture.width / textureSize,
        height: texture.height / textureSize,
      },
      cropOffset: offset,
      originalSize,
    });
  }
  const tex = await createTextureAtlasTexture(device, packed, textureSize);

  cpuTextureAtlases.push({
    texture: tex,
    textureRegions: atlasRegionMap,
    width: tex.width,
    height: tex.height,
  });

  return cpuTextureAtlases;
}

async function createTextureAtlasTexture(
  device: GPUDevice,
  packed: PackedTexture[],
  atlasSize: number,
) {
  const encoder: GPUCommandEncoder = device.createCommandEncoder();
  const atlasTexture: GPUTexture = device.createTexture({
    label: "Texture Atlas Texture Holder",
    size: [atlasSize, atlasSize, 1],
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });

  for (const texture of packed) {
    device.queue.copyExternalImageToTexture(
      {
        source: texture.texture,
      },
      {
        texture: atlasTexture,
        origin: [texture.x, texture.y, 0],
      },
      [texture.width, texture.height, 1],
    );
  }
  device.queue.submit([encoder.finish()]);
  const atlasBitmap: ImageBitmap = await textureToBitmap(
    device,
    atlasTexture,
    atlasTexture.width,
    atlasTexture.height,
  );
  atlasTexture.destroy();
  return atlasBitmap;
}

/**
 * Converts a WebGPU GPUTexture into an ImageBitmap.
 *
 * @param {GPUDevice} device - The WebGPU device used to create GPU resources.
 * @param {GPUTexture} texture - The GPUTexture to convert. Must be in `rgba8unorm` format.
 * @param {number} width - The width of the texture in pixels.
 * @param {number} height - The height of the texture in pixels.
 * @returns {Promise<ImageBitmap>} A promise that resolves to an ImageBitmap containing the texture's contents.
 *
 * @example
 * const bitmap = await textureToBitmap(device, queue, myTexture, 256, 256);
 * const canvas = document.createElement("canvas");
 * const ctx = canvas.getContext("2d");
 * ctx.drawImage(bitmap, 0, 0);
 */
async function textureToBitmap(
  device: GPUDevice,
  texture: GPUTexture,
  width: number,
  height: number,
): Promise<ImageBitmap> {
  const bytesPerPixel = 4;
  const bytesPerRow = Math.ceil((width * bytesPerPixel) / 256) * 256;
  const bufferSize = bytesPerRow * height;

  const readBuffer = device.createBuffer({
    size: bufferSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const commandEncoder = device.createCommandEncoder();
  commandEncoder.copyTextureToBuffer(
    { texture: texture },
    {
      buffer: readBuffer,
      bytesPerRow: bytesPerRow,
      rowsPerImage: height,
    },
    {
      width: width,
      height: height,
      depthOrArrayLayers: 1,
    },
  );

  const commands = commandEncoder.finish();
  device.queue.submit([commands]);

  await readBuffer.mapAsync(GPUMapMode.READ);
  const arrayBuffer = readBuffer.getMappedRange();
  const data = new Uint8ClampedArray(arrayBuffer);

  const imageData = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const rowStart = y * bytesPerRow;
    const rowEnd = rowStart + width * 4;
    imageData.set(data.subarray(rowStart, rowEnd), y * width * 4);
  }

  const image = new ImageData(imageData, width, height);
  const bitmap = await createImageBitmap(image);

  readBuffer.unmap();
  return bitmap;
}

type PackedTexture = {
  texture: ImageBitmap;
  x: number;
  y: number;
  width: number;
  height: number;
};

type Rectangle = {
  x: number;
  y: number;
  width: number;
  height: number;
};
