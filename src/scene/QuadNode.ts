import { type Mat3, mat3 } from "wgpu-matrix";
import type { Color } from "../coreTypes/Color";
import type { Size } from "../coreTypes/Size";
import type { Vec2 } from "../coreTypes/Vec2";
import type { IShader } from "../shaders/IShader";
import type { Toodle } from "../Toodle";
import type { TextureId } from "../textures/AssetManager";
import type { AtlasCoords, TexelRegion } from "../textures/types";
import { assert } from "../utils/assert";
import type { Pool } from "../utils/pool";
import { type NodeOptions, SceneNode } from "./SceneNode";

const PRIMITIVE_TEXTURE = "__primitive__";
const RESERVED_PRIMITIVE_INDEX_START = 1000;
// this must match the circle index in the default fragment shader of quad.wgsl.ts
const CIRCLE_INDEX = 1001;

// a default region used for shapes
const DEFAULT_REGION: TexelRegion = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
};

/**
 * A node in the scene graph that renders a textured quad.
 *
 * This is a base class and is fairly low level. You will probably want to interact with
 * the wrapper class {@link Toodle.Quad} instead.
 */
export class QuadNode extends SceneNode {
  #color: Color;
  #atlasCoords: AtlasCoords;
  #region: TexelRegion;
  #matrixPool: Pool<Mat3>;
  #flip: Vec2;
  /**
   * The offset of the cropped texture from the original texture
   * If uncropped, this will be 0,0
   */
  #cropOffset: Vec2;
  /**
   * The ratio of the cropped texture width and height to the original texture width and height
   * If uncropped, this will be 1,1
   */
  #cropRatio: Size;
  #atlasSize: Size;

  #textureId: TextureId;
  #writeInstance?: (array: Float32Array, offset: number) => void;

  constructor(options: QuadOptions, matrixPool: Pool<Mat3>) {
    assert(
      options.shader,
      "QuadNode requires a shader to be explicitly provided",
    );
    assert(
      options.idealSize,
      "QuadNode requires an ideal size to be explicitly provided",
    );

    assert(
      options.atlasCoords,
      "QuadNode requires atlas coords to be explicitly provided",
    );

    options.render ??= {
      shader: options.shader,
      writeInstance: writeQuadInstance,
    };

    super(options);

    if (
      options.atlasCoords &&
      options.atlasCoords.atlasIndex >= RESERVED_PRIMITIVE_INDEX_START
    ) {
      this.#textureId = PRIMITIVE_TEXTURE;
      this.#region = DEFAULT_REGION;
      this.#atlasSize = DEFAULT_REGION;
    } else {
      assert(
        options.textureId,
        "QuadNode requires texture id to be explicitly provided",
      );
      this.#textureId = options.textureId;

      assert(
        options.region,
        "QuadNode requires a region to be explicitly provided",
      );
      this.#region = options.region;

      assert(
        options.atlasSize,
        "QuadNode requires atlas size to be explicitly provided",
      );
      this.#atlasSize = options.atlasSize;
    }

    this.#atlasCoords = options.atlasCoords;
    this.#color = options.color ?? { r: 1, g: 1, b: 1, a: 1 };
    this.#matrixPool = matrixPool;
    this.#flip = { x: options.flipX ? -1 : 1, y: options.flipY ? -1 : 1 };
    this.#cropOffset = options.cropOffset ?? { x: 0, y: 0 };
    this.#cropRatio = !this.#atlasCoords.uvScaleCropped
      ? { width: 1, height: 1 }
      : {
          width:
            this.#atlasCoords.uvScaleCropped.width /
            this.#atlasCoords.uvScale.width,
          height:
            this.#atlasCoords.uvScaleCropped.height /
            this.#atlasCoords.uvScale.height,
        };
    this.#writeInstance = options.writeInstance;
  }

  /**
   * The tint color of the quad.
   * When drawing shapes, this will be the fill color.
   * When drawing textures, this will be the color multiplier by default.
   * You can also use this value in fragment shaders by referencing `vertex.engine_tint`
   */
  get color() {
    return this.#color;
  }

  set color(value: Color) {
    this.#color = value;
  }

  /**
   * The size of the quad. See https://toodle.gg/f849595b3ed13fc956fc1459a5cb5f0228f9d259/examples/quad-size-scale.html
   */
  get size() {
    const size = super.size;
    if (!size) {
      throw new Error("QuadNode requires a size");
    }
    return size;
  }

  /**
   * This is the final model matrix used to render the quad, which
   * may differ from the matrix passed down to the node's children.
   * Properties like `flipX` and `flipY` or `size` are applied here but not inherited by children.
   */
  get matrixWithSize() {
    const matrix = mat3.clone(this.matrix, this.#matrixPool.get());
    mat3.scale(
      matrix,
      [this.size.width * this.#flip.x, this.size.height * this.#flip.y],
      matrix,
    );

    return matrix;
  }

  /**
   * The atlas coordinates for the quad. These determine the region in the texture atlas
   * that is sampled for rendering in normalized uv space.
   */
  get atlasCoords() {
    return this.#atlasCoords;
  }

  /**
   * A subregion of the texture to render.
   * This is useful for rendering a single sprite from a spritesheet for instance.
   * It defaults to the full texture.
   */
  get region() {
    return this.#region;
  }

  get writeInstance() {
    return this.#writeInstance;
  }

  /**
   * Whether the image is mirrored horizontally.
   *
   * `true` means the image is mirrored (equivalent to a scale.x of -1),
   * `false` means it is not mirrored.
   */
  get flipX(): boolean {
    return this.#flip.x === -1;
  }

  /**
   * Sets whether the image is mirrored horizontally.
   *
   * `true` mirrors the image (equivalent to a scale.x of -1),
   * `false` restores normal orientation.
   */
  set flipX(value: boolean) {
    this.#flip.x = value ? -1 : 1;
    this.setDirty();
  }

  /**
   * Whether the image is mirrored vertically.
   *
   * `true` means the image is mirrored (equivalent to a scale.y of -1),
   * `false` means it is not mirrored.
   */
  get flipY(): boolean {
    return this.#flip.y === -1;
  }

  /**
   * Sets whether the image is mirrored vertically.
   *
   * `true` mirrors the image (equivalent to a scale.y of -1),
   * `false` restores normal orientation.
   */
  set flipY(value: boolean) {
    this.#flip.y = value ? -1 : 1;
    this.setDirty();
  }

  /**
   * The drawing offset of the texture.
   * This can be used to offset the texture from the origin of the quad.
   */
  get cropOffset(): Vec2 {
    return this.#cropOffset;
  }

  /**
   * The drawing offset of the texture.
   * This can be used to offset the texture from the origin of the quad.
   */
  set cropOffset(value: Vec2) {
    this.#cropOffset = value;
  }

  get textureId() {
    return this.#textureId;
  }

  /**
   * Whether this quad is rendering a primitive shape like a line or a circle/rect.
   */
  get isPrimitive() {
    return this.#textureId === PRIMITIVE_TEXTURE;
  }

  /**
   * Whether this quad is rendering a circle.
   */
  get isCircle() {
    return this.#atlasCoords.atlasIndex === CIRCLE_INDEX;
  }

  extra = {
    /**
     * Sets the atlas coords for the quad. This is for advanced use cases and by default these are
     * set automatically to reference the right texture atlas region.
     * @param value - The new atlas coords.
     */
    setAtlasCoords: (value: AtlasCoords) => {
      this.#atlasCoords = value;
    },

    /**
     * Returns the crop ratio for the quad. This is the relative difference in size
     * between the cropped and uncropped texture, and will be 1 if the quad has no transparent pixels
     * or if it is loaded without cropping..
     */
    cropRatio: () => {
      return this.#cropRatio;
    },

    /**
     * Returns the size of the texture atlas in texels, by default this is 4096x4096
     */
    atlasSize: () => {
      return this.#atlasSize;
    },
  };
}

export type QuadOptions = NodeOptions & {
  textureId?: TextureId;
  /**
   * A subregion of the texture to render.
   * This is useful for rendering a single sprite from a spritesheet for instance.
   * It defaults to the full texture.
   */
  region?: TexelRegion;
  /**
   * Atlas coordinates are almost always set by toodle and the asset manager.
   * For advanced use cases, you can set these yourself to control what uvs are sampled
   * from the texture atlas.
   */
  atlasCoords?: AtlasCoords;

  shader?: IShader;
  writeInstance?: (array: Float32Array, offset: number) => void;
  color?: Color;
  /**
   * flipX mirrors the image horizontally (equivalent to a scale.x multiplication
   * by -1) but allows for independent scaling
   */
  flipX?: boolean;
  /**
   * flipY mirrors the image vertically (equivalent to a scale.y multiplication
   * by -1) but allows for independent scaling
   */
  flipY?: boolean;
  /**
   * The offset of the cropped texture from the original texture
   * If uncropped, this will be 0,0
   */
  cropOffset?: Vec2;

  /**
   * The size of the texture atlas in texels. This is almost always set by toodle.
   */
  atlasSize?: Size;

  /**
   * The matrix pool to use for the quad.
   * This is used to avoid creating new matrices for each quad.
   */
  matrixPool?: Pool<Mat3>;
};

function writeQuadInstance(
  node: SceneNode,
  array: Float32Array,
  offset: number,
) {
  if (!(node instanceof QuadNode)) {
    throw new Error("QuadNode.writeInstance can only be called on QuadNodes");
  }

  array.set(node.matrixWithSize, offset);

  array.set(
    [node.color.r, node.color.g, node.color.b, node.color.a],
    offset + 12,
  );

  const region = node.region;
  if (node.textureId === PRIMITIVE_TEXTURE) {
    array.set(
      [
        node.atlasCoords.uvOffset.x,
        node.atlasCoords.uvOffset.y,
        node.atlasCoords.uvScale.width,
        node.atlasCoords.uvScale.height,
      ],
      offset + 16,
    );
  } else {
    const atlasSize = node.extra.atlasSize();
    array.set(
      [
        node.atlasCoords.uvOffset.x + region.x / atlasSize.width,
        node.atlasCoords.uvOffset.y + region.y / atlasSize.height,
        region.width / atlasSize.width,
        region.height / atlasSize.height,
      ],
      offset + 16,
    );
  }

  array.set(
    [
      // convert the offset in world space to the offset in the local space of the quad
      // this offset is applied to the unit quad _before_ the model matrix is applied
      // we divide by 2 because we want the center of the remaining region and not the full shift.
      // for example, if we crop the leftmost 90px of a 100px wide texture
      // we want the offset to be 45px and not 90px
      node.cropOffset.x / 2 / (node.atlasCoords.originalSize.width || 1),
      node.cropOffset.y / 2 / (node.atlasCoords.originalSize.height || 1),
      node.extra.cropRatio().width,
      node.extra.cropRatio().height,
    ],
    offset + 20,
  );

  new DataView(array.buffer).setUint32(
    array.byteOffset + (offset + 24) * Float32Array.BYTES_PER_ELEMENT,
    node.atlasCoords.atlasIndex,
    true,
  );

  node.writeInstance?.(array, offset + 28);

  return 1;
}
