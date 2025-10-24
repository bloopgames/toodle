import { type Mat3, mat3 } from "wgpu-matrix";
import type { Size } from "../coreTypes/Size";
import type { Vec2 } from "../coreTypes/Vec2";
import type { TextureId } from "../textures/AssetManager";
import type { AtlasCoords } from "../textures/types";
import { assert } from "../utils/assert";
import type { Pool } from "../utils/pool";
import { QuadNode, type QuadOptions } from "./QuadNode";
import type { SceneNode } from "./SceneNode";

const MAT3_SIZE = 12;
const VEC4F_SIZE = 4;

export type JumboTileDef = Required<JumboTileOptions>;

export type JumboTileOptions = {
  /** Texture id of the tile */
  textureId: TextureId;
  /** The offset of this tile in texels from the top left of the full texture */
  offset: Vec2;
  /** The size of the tile in texels. If not provided, the size will be inferred from the texture atlas. */
  size?: Size;
  /** The coordinates of the tile in the texture atlas. If not provided, the size will be read from the loaded texture. */
  atlasCoords?: AtlasCoords;
};

export type JumboQuadOptions = Omit<QuadOptions, "atlasCoords"> & {
  tiles: JumboTileOptions[];
};

export class JumboQuadNode extends QuadNode {
  #tiles: Required<JumboTileOptions>[];
  #matrixPool: Pool<Mat3>;

  constructor(options: JumboQuadOptions, matrixPool: Pool<Mat3>) {
    assert(
      options.shader,
      "JumboQuadNode requires a shader to be explicitly provided",
    );

    assert(
      options.tiles && options.tiles.length > 0,
      "JumboQuadNode requires at least one tile to be provided",
    );

    options.render ??= {
      shader: options.shader,
      writeInstance: writeJumboQuadInstance,
    };

    super(
      {
        ...options,
        atlasCoords: options.tiles[0].atlasCoords,
      },
      matrixPool,
    );

    this.#matrixPool = matrixPool;

    this.#tiles = [];

    for (const tile of options.tiles) {
      assert(
        tile.atlasCoords,
        "JumboQuadNode requires atlas coords to be provided",
      );

      assert(tile.size, "JumboQuadNode requires a size to be provided");

      this.#tiles.push({
        textureId: tile.textureId,
        offset: tile.offset,
        size: tile.size,
        atlasCoords: tile.atlasCoords,
      });
    }
  }

  get atlasCoords(): AtlasCoords {
    throw new Error("JumboQuadNode does not have a single atlas coords");
  }

  get tiles(): JumboTileDef[] {
    return this.#tiles;
  }

  getTileMatrix(tile: JumboTileDef) {
    const matrix = mat3.clone(this.matrix, this.#matrixPool.get());

    // Find maximum dimensions across all tiles
    const originalSize = {
      width: Math.max(...this.#tiles.map((t) => t.offset.x + t.size.width)),
      height: Math.max(...this.#tiles.map((t) => t.offset.y + t.size.height)),
    };

    const proportionalSize = {
      width: this.size.width / originalSize.width,
      height: this.size.height / originalSize.height,
    };

    // Apply translation
    // calculate the offset of the tile's center from the center of the jumbo quad
    // eg if the tile is at (0,0) in texels and is 4000x4000 and the whole texture is 5000x5000 this would give us
    // (2000 - 2500) / 2 = -250, -(2000 - 2500) / 2 = 250
    const centerOffset = {
      x: tile.offset.x + tile.size.width / 2 - originalSize.width / 2,
      y: -(tile.offset.y + tile.size.height / 2 - originalSize.height / 2),
    };
    mat3.translate(
      matrix,
      [
        centerOffset.x * proportionalSize.width,
        centerOffset.y * proportionalSize.height,
      ],
      matrix,
    );

    // Scale proportionally by size of the jumbo quad
    mat3.scale(
      matrix,
      [
        tile.size.width * proportionalSize.width * (this.flipX ? -1 : 1),
        tile.size.height * proportionalSize.height * (this.flipY ? -1 : 1),
      ],
      matrix,
    );

    return matrix;
  }
}

function writeJumboQuadInstance(
  node: SceneNode,
  array: Float32Array,
  offset: number,
): number {
  if (!(node instanceof JumboQuadNode)) {
    throw new Error(
      "JumboQuadNode.writeJumboQuadInstance can only be called on JumboQuadNodes",
    );
  }

  // Initialize the local offset for each tile to render...
  let tileOffset = 0;

  // Iterate through each AtlasCoords found in the coords...
  for (const tile of node.tiles) {
    const coord = tile.atlasCoords;

    // write model matrix
    const matrix = node.getTileMatrix(tile);
    array.set(matrix, offset + tileOffset);
    tileOffset += MAT3_SIZE;

    // write tint color
    array.set(
      [node.color.r, node.color.g, node.color.b, node.color.a],
      offset + tileOffset,
    );
    //...increment the local offset by the size of our color vector
    tileOffset += VEC4F_SIZE;

    // write uv offset and scale
    // location 4 are the uv offset and scale used to sample the texture atlas. these are in normalized texel coordinates.
    // @location(4) uvOffsetAndScale: vec4<f32>,
    array.set(
      [
        coord.uvOffset.x,
        coord.uvOffset.y,
        coord.uvScale.width,
        coord.uvScale.height,
      ],
      offset + tileOffset,
    );
    tileOffset += VEC4F_SIZE;

    const cropRatio = !coord.uvScaleCropped
      ? { width: 1, height: 1 }
      : {
          width: coord.uvScaleCropped.width / coord.uvScale.width,
          height: coord.uvScaleCropped.height / coord.uvScale.height,
        };
    // write crop offset and scale
    // location 5 is the crop offset from center and scale. These are ratios applied to the unit quad.
    // @location(5) cropOffsetAndScale: vec4<f32>,
    array.set(
      [
        // convert the offset in world space to the offset in the local space of the quad
        // this offset is applied to the unit quad _before_ the model matrix is applied
        // we divide by 2 because we want the center of the remaining region and not the full shift.
        // for example, if we crop the leftmost 90px of a 100px wide texture
        // we want the offset to be 45px and not 90px
        tile.atlasCoords.cropOffset.x /
          2 /
          (tile.atlasCoords.originalSize.width || 1),
        tile.atlasCoords.cropOffset.y /
          2 /
          (tile.atlasCoords.originalSize.height || 1),
        cropRatio.width,
        cropRatio.height,
      ],
      offset + tileOffset,
    );
    tileOffset += VEC4F_SIZE;

    // write atlas index
    new DataView(array.buffer).setUint32(
      array.byteOffset + (offset + tileOffset) * Float32Array.BYTES_PER_ELEMENT,
      coord.atlasIndex,
      true,
    );
    tileOffset += VEC4F_SIZE;
  }

  // Write our instance and return the number of sprites added to the buffer...
  node.writeInstance?.(array, offset + tileOffset);
  return node.tiles.length;
}
