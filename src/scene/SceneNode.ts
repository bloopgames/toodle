import { type Mat3, mat3, vec2 } from "wgpu-matrix";
import type { Point } from "../coreTypes/Point";
import type { Size } from "../coreTypes/Size";
import type { Transform } from "../coreTypes/Transform";
import type { Vec2 } from "../coreTypes/Vec2";
import { deg2rad, rad2deg } from "../math/angle";
import { createModelMatrix } from "../math/matrix";
import type { RenderComponent } from "./RenderComponent";

/**
 * A node in the scene graph.
 *
 * This is a base class and is fairly low level. You will probably want to interact with
 * the wrapper classes {@link Toodle['Node']} or {@link Toodle['Quad']} instead.
 */
export class SceneNode {
  static nextId = 1;

  id: number;
  label?: string;

  #isActive = true;
  #layer: null | number = null;
  #parent: SceneNode | null = null;
  #key: string | null = null;
  #kids: SceneNode[] = [];
  #transform: Transform;
  #matrix: Mat3 = mat3.identity();
  #renderComponent: RenderComponent | null = null;
  #idealSize: Size | null = null;
  #positionProxy: Point;
  #scaleProxy: Vec2;

  #cache: RenderLayoutCache | null = null;

  constructor(opts?: NodeOptions) {
    this.id = opts?.id ?? SceneNode.nextId++;

    if (opts?.rotation && opts?.rotationRadians) {
      throw new Error(
        `Cannot set both rotation and rotationRadians for node ${opts?.label ?? this.id}`,
      );
    }

    this.#transform = {
      position: opts?.position ?? { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      size: opts?.idealSize ?? { width: 1, height: 1 },
      rotation: opts?.rotationRadians ?? 0,
    };
    if (opts?.scale) this.scale = opts.scale;
    if (opts?.rotation) this.rotation = opts.rotation;

    this.#matrix = mat3.identity();
    this.#renderComponent = opts?.render ?? null;
    this.#layer = opts?.layer ?? null;
    this.#isActive = opts?.isActive ?? true;
    this.label = opts?.label ?? undefined;
    this.#idealSize = opts?.idealSize ?? null;
    this.#key = opts?.key ?? null;

    for (const kid of opts?.kids ?? []) {
      this.add(kid);
    }

    const self = this;
    this.#positionProxy = {
      get x() {
        return self.#transform.position.x;
      },
      set x(value: number) {
        self.#transform.position.x = value;
        self.setDirty();
      },
      get y() {
        return self.#transform.position.y;
      },
      set y(value: number) {
        self.#transform.position.y = value;
        self.setDirty();
      },
    };

    this.#scaleProxy = {
      get x() {
        return self.#transform.scale.x;
      },
      set x(value: number) {
        self.#transform.scale.x = value;
        self.setDirty();
      },
      get y() {
        return self.#transform.scale.y;
      },
      set y(value: number) {
        self.#transform.scale.y = value;
        self.setDirty();
      },
    };
  }

  /**
   * Add a child node and return the child node with this node set as its parent.
   */
  add<T extends SceneNode>(kid: T, index?: number) {
    kid.#parent = this;
    if (index === undefined) {
      this.#kids.push(kid);
    } else {
      this.#kids.splice(index, 0, kid);
    }
    kid.setDirty();
    return kid;
  }

  /**
   * Returns an array of the node's immediate kids.
   *
   * Note that these will be returned with a `SceneNode` type, but can be narrowed if you know the type of them,
   * for eg:
   *
   * ```ts
   * for (const kid of node.kids) {
   *   if (kid instanceof Scene.QuadNode) {
   *     console.log(kid.color)
   *   }
   *
   *   if (kid instanceof Text.TextNode) {
   *     console.log(kid.text)
   *   }
   * }
   * ```
   */
  get kids() {
    return this.#kids;
  }

  /**
   * The children of the node. Alias for {@link SceneNode.kids}.
   */
  get children() {
    return this.#kids;
  }

  /**
   * Returns a reference to the node's transform.
   *
   * Do not edit this transform directly as it won't invalidate cache's correctly.
   * Instead, use convenience properties {@link SceneNode.position}, {@link SceneNode.scale}, and {@link SceneNode.rotation}.
   */
  get transform(): Transform {
    return this.#transform;
  }

  /**
   * Returns the key of the node as set when the node was created.
   *
   * This key can be used to reference the node from an external lookup system.
   */
  get key() {
    return this.#key ?? "";
  }

  /**
   * Returns the parent node. See https://toodle.gg/f849595b3ed13fc956fc1459a5cb5f0228f9d259/examples/transforms.html
   */
  get parent() {
    return this.#parent;
  }

  set position(value: Point) {
    this.#transform.position = value;
    this.setDirty();
  }

  /**
   * Position of the node in local space. For world space, use {@link SceneNode.bounds}.
   */
  get position() {
    return this.#positionProxy;
  }

  set x(value: number) {
    this.#transform.position.x = value;
    this.setDirty();
  }

  /**
   * The local x coordinate of the node.
   */
  get x() {
    return this.#transform.position.x;
  }

  set y(value: number) {
    this.#transform.position.y = value;
    this.setDirty();
  }

  /**
   * The local y coordinate of the node.
   */
  get y() {
    return this.#transform.position.y;
  }

  set rotation(value: number) {
    this.#transform.rotation = deg2rad(value);
    this.setDirty();
  }

  /**
   * The rotation of the node in degrees.
   * For radians, see {@link SceneNode.rotationRadians}.
   */
  get rotation() {
    return rad2deg(this.#transform.rotation);
  }

  /**
   * The rotation of the node in radians.
   * For degrees, see {@link SceneNode.rotation}.
   */
  get rotationRadians() {
    return this.#transform.rotation;
  }

  set rotationRadians(value: number) {
    this.#transform.rotation = value;
    this.setDirty();
  }

  /**
   * The scale of the node. See https://toodle.gg/f849595b3ed13fc956fc1459a5cb5f0228f9d259/examples/quad-size-scale.html
   */
  get scale(): Vec2 {
    return this.#scaleProxy;
  }

  set scale(value: Vec2 | number) {
    if (typeof value === "number") {
      this.#transform.scale = { x: value, y: value };
    } else {
      this.#transform.scale = value;
    }
    this.setDirty();
  }

  set idealSize(value: Size | null) {
    this.#idealSize = value;
    this.setDirty();
  }

  /**
   * The size of the node. See https://toodle.gg/f849595b3ed13fc956fc1459a5cb5f0228f9d259/examples/quad-size-scale.html
   */

  get size() {
    return this.#idealSize;
  }

  /**
   * The aspect ratio of the node.
   * If the node has no defined size, the aspect ratio will be 1.
   */
  get aspectRatio() {
    if (!this.#idealSize) {
      console.warn(
        "Attempted to get aspect ratio of a node with no ideal size",
      );
      return 1;
    }
    return this.#idealSize.width / this.#idealSize.height;
  }

  /**
   * isActive is a boolean that determines if the node is active.
   * If a node is not active, it will not be drawn.
   * If any of a node's ancestors are not active, the node will not be active.
   */
  get isActive() {
    if (!this.#cache?.isActive) {
      this.#cache ??= {};

      let parent = this as SceneNode;
      let isActive = this.#isActive;
      while (isActive && parent.#parent) {
        parent = parent.#parent;
        isActive = isActive && parent.#isActive;
      }
      this.#cache.isActive = isActive;
    }
    return this.#cache.isActive;
  }

  set isActive(value: boolean) {
    this.#isActive = value;
    this.setDirty();
  }

  /**
   * Nodes are batched for drawing based on their layer. Each layer will submit a separate draw call.
   * Nodes with the same layer will be drawn in the order they are drawn with toodle.Draw
   * Nodes with a higher layer will be drawn on top of nodes with a lower layer.
   */
  get layer() {
    if (this.#layer != null) {
      return this.#layer;
    }

    if (!this.#cache?.layer) {
      this.#cache ??= {};

      let parent = this as SceneNode;
      while (parent.#parent) {
        parent = parent.#parent;
        if (parent.hasExplicitLayer) {
          this.#cache.layer = parent.#layer!;
          return this.#cache.layer;
        }
      }

      this.#cache.layer = 0;
    }

    return this.#cache.layer;
  }

  /**
   * Returns true if the node has an explicit layer set.
   *
   * If the node does not have an explicit layer but one of its ancestors does,
   * its layer will be inherited from its parent.
   */
  get hasExplicitLayer() {
    return this.#layer != null;
  }

  set layer(value: number) {
    this.#layer = value;
    this.setDirty();
  }

  get renderComponent() {
    return this.#renderComponent;
  }

  /**
   * This is the model matrix of the node. See https://webgpufundamentals.org/webgpu/lessons/webgpu-matrix-math.html for more information.
   *
   * Do not edit this matrix directly as it is derived from the node's transform and will be overwritten.
   */
  get matrix(): Float32Array {
    if (!this.#cache?.matrix) {
      this.#cache ??= {};

      if (this.#parent) {
        mat3.clone(this.#parent.matrix, this.#matrix);
      } else {
        mat3.identity(this.#matrix);
      }
      this.#cache.matrix = createModelMatrix(this.transform, this.#matrix);
    }
    return this.#cache.matrix;
  }

  /**
   * Get the bounds of the node in world space
   */
  get bounds(): Bounds {
    if (!this.#cache?.bounds) {
      this.#cache ??= {};

      const height = this.size?.height ?? 0;
      const width = this.size?.width ?? 0;

      // we don't need to add the node's position to the points
      // because the points are relative to the node's center
      // and the matrix already applies the node's position
      const corners = [
        vec2.transformMat3([-width / 2, height / 2], this.matrix),
        vec2.transformMat3([width / 2, height / 2], this.matrix),
        vec2.transformMat3([-width / 2, -height / 2], this.matrix),
        vec2.transformMat3([width / 2, -height / 2], this.matrix),
      ];
      const center = vec2.transformMat3([0, 0], this.matrix);

      const xValues = corners.map((c) => c[0]);
      const yValues = corners.map((c) => c[1]);

      this.#cache.bounds = {
        x: center[0],
        y: center[1],
        left: Math.min(xValues[0], xValues[1], xValues[2], xValues[3]),
        right: Math.max(xValues[0], xValues[1], xValues[2], xValues[3]),
        top: Math.max(yValues[0], yValues[1], yValues[2], yValues[3]),
        bottom: Math.min(yValues[0], yValues[1], yValues[2], yValues[3]),
      };
    }
    return this.#cache.bounds;
  }

  /**
   * Set the bounds of the node in world space.
   */
  setBounds(bounds: Partial<Bounds>) {
    if (bounds.left !== undefined) this.left = bounds.left;
    if (bounds.right !== undefined) this.right = bounds.right;
    if (bounds.top !== undefined) this.top = bounds.top;
    if (bounds.bottom !== undefined) this.bottom = bounds.bottom;
    if (bounds.x !== undefined) this.centerX = bounds.x;
    if (bounds.y !== undefined) this.centerY = bounds.y;

    return this;
  }

  /**
   * Set the left edge of the node in world space.
   */
  set left(value: number) {
    this.#adjustWorldPosition([value - this.bounds.left, 0]);
  }

  /**
   * Set the bottom edge of the node in world space.
   */
  set bottom(value: number) {
    this.#adjustWorldPosition([0, value - this.bounds.bottom]);
  }

  /**
   * Set the top edge of the node in world space.
   */
  set top(value: number) {
    this.#adjustWorldPosition([0, value - this.bounds.top]);
  }

  /**
   * Set the right edge of the node in world space.
   */
  set right(value: number) {
    this.#adjustWorldPosition([value - this.bounds.right, 0]);
  }

  /**
   * Set the center x of the node in world space.
   */
  set centerX(value: number) {
    this.#adjustWorldPosition([value - this.bounds.x, 0]);
  }

  /**
   * Set the center y of the node in world space.
   */
  set centerY(value: number) {
    this.#adjustWorldPosition([0, value - this.bounds.y]);
  }

  /**
   * Removes references to this node and all of its children.
   *
   * Call this to remove a node from a parent's tree and before garbage collection to prevent a node from being retained.
   *
   * @example
   *
   * const parent = toodle.Node();
   * const child = toodle.Quad();
   * const grandchild = toodle.Quad();
   *
   * parent.add(child);
   * child.add(grandchild);
   *
   * // Will delete `child` and `grandchild`
   * child.delete();
   */
  delete() {
    this.#parent?.remove(this);
    for (const child of this.#kids) {
      child.delete();
    }
    this.#kids = [];
    this.#isActive = false;
    this.#layer = null;
    this.#renderComponent = null;
  }

  /**
   * Remove any child node from this node. Warns if the child is not found.
   *
   * The node will still exist as an orphaned node and can still be passed to toodle.Draw or added to another parent.
   *
   * Alternatively, calling `node.delete()` on the child will remove it and set it to inactive.
   *
   * @example
   * const parent = toodle.Node();
   * const child = toodle.Quad();
   * const grandchild = toodle.Quad();
   *
   * parent.add(child);
   * child.add(grandchild);
   *
   * parent.remove(child);
   */
  remove(kid: SceneNode) {
    const childIndex = this.#kids.findIndex((child) => child.id === kid.id);
    if (childIndex <= -1) {
      throw new Error(
        `${kid.label ?? kid.id} is not a child of ${this.label ?? this.id}`,
      );
    }
    this.#kids.splice(childIndex, 1);
    kid.#parent = null;
    kid.setDirty();
  }

  #adjustWorldPosition(delta: [number, number]) {
    const inverseMatrix = mat3.inverse(this.#parent?.matrix ?? mat3.identity());

    // zero out the translation part of the matrix since we're transforming a delta
    // and not a point in space
    inverseMatrix[8] = inverseMatrix[9] = 0;

    const localDelta = vec2.transformMat3(delta, inverseMatrix);

    this.#transform.position.x += localDelta[0];
    this.#transform.position.y += localDelta[1];

    this.setDirty();
  }

  /**
   * This marks the node as dirty, invalidating its cache and causing its matrix to be recalculated.
   * This should not be necessary to call directly, but is available for advanced use cases.
   */
  setDirty() {
    this.#cache = null;
    this.#kids.forEach((kid) => kid.setDirty());
  }

  /**
   * Parse a node and its descendants from a JSON string.
   * Can be used for deserialization from a file or other source.
   *
   * @example
   *
   * const node = new Node();
   * const json = JSON.stringify(node);
   * const clonedNode = Node.parse(json);
   */
  static parse(json: string) {
    const obj = JSON.parse(json, reviver);
    return new SceneNode(obj);
  }

  /**
   * This method usually is not called directly. It will be called automatically by `JSON.stringify`,
   * see: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify#description
   * and {@link SceneNode.parse}.
   *
   * @example
   *
   * const node = new Node();
   * const json = JSON.stringify(node); // calls toJSON()
   * console.log(json)
   */
  toJSON() {
    return {
      id: this.id,
      label: this.label,
      transform: this.#transform,
      layer: this.#layer,
      isActive: this.#isActive,
      kids: this.#kids,
      render: this.#renderComponent,
    };
  }
}

export type NodeOptions = {
  /** The unique identifier for the node. */
  id?: number;
  /** The label for the node. */
  label?: string;
  /** The layer for the node. */
  layer?: number;
  /** The rotation for the node in degrees. Cannot be used with `rotationRadians`. */
  rotation?: number;
  /** The rotation for the node in radians. Cannot be used with `rotation`. */
  rotationRadians?: number;
  /** The position for the node. */
  position?: Point;
  /** The scale for the node. */
  scale?: Vec2 | number;
  /** The desired size for the node. */
  idealSize?: Size;
  /** The active state for the node. */
  isActive?: boolean;
  /** The kids for the node. */
  kids?: SceneNode[];
  /** The render component for the node. */
  render?: RenderComponent;
  /** Flip the node horizontally. */
  flipX?: boolean;
  /** Flip the node vertically. */
  flipY?: boolean;
  /** A string key for the node - can be used to reference the node from an external lookup system */
  key?: string;
};

function reviver(key: string, value: any) {
  if (key === "kids") {
    return value.map((kid: any) => new SceneNode(kid));
  }

  if (Array.isArray(value) && value.every((v) => typeof v === "number")) {
    if (value.length === 2) {
      return value as [number, number];
    }
    if (value.length === 3) {
      return value as [number, number, number];
    }
    if (value.length === 4) {
      return value as [number, number, number, number];
    }
  }
  return value;
}

type RenderLayoutCache = {
  layer?: number;
  isActive?: boolean;
  matrix?: Mat3;
  bounds?: Bounds;
};

/**
 * Bounds represent a bounding box of a rectangle in world space
 */
export type Bounds = {
  /**
   * for an axis-aligned rectangle, top is the top edge.
   * for a rotated rectangle, it is the topmost point
   */
  top: number;
  /**
   * for an axis-aligned rectangle, left is the left edge.
   * for a rotated rectangle, it is the leftmost point
   */
  left: number;
  /**
   * for an axis-aligned rectangle, right is the right edge.
   * for a rotated rectangle, it is the rightmost point
   */
  right: number;
  /**
   * for an axis-aligned rectangle, bottom is the bottom edge.
   * for a rotated rectangle, it is the bottommost point
   */
  bottom: number;
  /**
   * the center x of the node in world space
   */
  x: number;
  /**
   * the center y of the node in world space
   */
  y: number;
};
