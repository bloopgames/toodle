import { type Mat3, mat3 } from "wgpu-matrix";
import type { IBackendShader } from "./backends/IBackendShader";
import type { BlendMode } from "./backends/IRenderBackend";
import type { BackendType, IRenderBackend } from "./backends/mod";
import { detectBackend } from "./backends/mod";
import { WebGLBackend } from "./backends/webgl2/mod";
import { WebGPUBackend } from "./backends/webgpu/mod";
import type { PostProcess } from "./backends/webgpu/postprocess/mod";
import type { Color } from "./coreTypes/Color";
import type { EngineUniform } from "./coreTypes/EngineUniform";
import type { Point } from "./coreTypes/Point";
import type { Size } from "./coreTypes/Size";
import type { Limits, LimitsOptions } from "./limits";
import {
  convertScreenToWorld,
  convertWorldToScreen,
  createProjectionMatrix,
} from "./math/matrix";
import { Batcher } from "./scene/Batcher";
import { Camera } from "./scene/Camera";
import { JumboQuadNode, type JumboQuadOptions } from "./scene/JumboQuadNode";
import { QuadNode, type QuadOptions } from "./scene/QuadNode";
import { type NodeOptions, SceneNode } from "./scene/SceneNode";
import type { Resolution } from "./screen/resolution";
import { TextNode, type TextOptions } from "./text/TextNode";
import { AssetManager, type TextureId } from "./textures/AssetManager";
import { Pool } from "./utils/mod";

export class Toodle {
  /**
   * Asset manager. Use toodle.assets.loadTexture to load texture assets.
   */
  assets: AssetManager;

  /**
   * diagnostics can be used as a rough gauge for performance.
   * besides frames, these stats are reset at the beginning of each frame.
   */
  diagnostics = {
    /** number of instanced draw calls issued last frame. lower is better */
    drawCalls: 0,
    /** number of pipeline switches last frame. lower is better. to reduce pipeline switches, use fewer z-indexes or fewer custom shaders */
    pipelineSwitches: 0,
    /** number of frames rendered */
    frames: 0,
    /** number of instances enqueued last frame */
    instancesEnqueued: 0,
  };

  /** The render backend (WebGPU or WebGL2) */
  #backend: IRenderBackend;

  /**
   * Camera. This applies a 2d perspective projection matrix to any nodes drawn with toodle.draw
   */
  camera = new Camera();

  /**
   * clearColor is the color that will be used to clear the screen at the beginning of each frame
   * you can also think of this as the background color of the canvas
   */
  clearColor: Color = { r: 1, g: 1, b: 1, a: 1 };

  #resolution: Resolution;
  #resizeObserver: ResizeObserver;
  #engineUniform: EngineUniform;
  #projectionMatrix: Mat3 = mat3.identity();
  #batcher = new Batcher();
  #defaultFilter: GPUFilterMode;
  #matrixPool: Pool<Mat3>;
  #atlasSize: Size;

  /**
   * it's unlikely that you want to use the constructor directly.
   * see {@link Toodle.attach} for creating a Toodle instance that draws to a canvas.
   */
  constructor(
    backend: IRenderBackend,
    canvas: HTMLCanvasElement,
    resolution: Resolution,
    options: ToodleOptions
  ) {
    this.#backend = backend;
    this.#matrixPool = new Pool<Mat3>(
      () => mat3.identity(),
      backend.limits.instanceCount
    );
    this.#defaultFilter = options.filter ?? "linear";

    // Create AssetManager with the backend
    this.assets = new AssetManager(backend);

    this.#atlasSize = backend.atlasSize;
    this.#engineUniform = {
      resolution,
      camera: this.camera,
      viewProjectionMatrix: mat3.identity(),
    };
    this.#resolution = resolution;

    this.resize(this.#resolution);
    this.#resizeObserver = this.#createResizeObserver(canvas);
  }

  /**
   * Screen shader is an optional slot for post-processing effects.
   * Note that this will do the main render pass to an offscreen texture, which may impact performance.
   * Currently only supported in WebGPU mode.
   */
  get postprocess(): PostProcess | null {
    if (this.#backend.type !== "webgpu") return null;
    return (this.#backend as WebGPUBackend).getPostprocess();
  }

  set postprocess(value: PostProcess | null) {
    if (value !== null && this.#backend.type !== "webgpu") {
      throw new Error("Post-processing is only supported in WebGPU mode");
    }
    if (this.#backend.type === "webgpu") {
      (this.#backend as WebGPUBackend).setPostprocess(value);
    }
  }

  /**
   * call resize when the canvas is resized.
   * this will update the projection matrix and the resolution.
   *
   * @param resolution - the resolution of the canvas in logical pixels.
   * this should be `canvas.clientWidth x canvas.clientHeight` and NOT `canvas.width * canvas.height`
   *
   * @example
   *
   *  const canvas = document.querySelector("canvas")!
   *
   *  const observer = new ResizeObserver((entries) => {
   *   if (entries.length === 0) return
   *   toodle.resize({ width: canvas.clientWidth, height: canvas.clientHeight })
   *  })
   *
   *  observer.observe(canvas)
   */
  resize(resolution: Resolution) {
    createProjectionMatrix(resolution, this.#projectionMatrix);
    this.#resolution = resolution;
    this.#backend.resize(resolution.width, resolution.height);
  }

  #createResizeObserver(canvas: HTMLCanvasElement) {
    // see https://webgpufundamentals.org/webgpu/lessons/webgpu-resizing-the-canvas.html
    // for explanation of incorporating devicePixelRatio
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || !entries.length) return;
      for (const entry of entries) {
        const width =
          entry.devicePixelContentBoxSize?.[0].inlineSize ||
          entry.contentBoxSize[0].inlineSize * devicePixelRatio;
        const height =
          entry.devicePixelContentBoxSize?.[0].blockSize ||
          entry.contentBoxSize[0].blockSize * devicePixelRatio;

        // uncomment these lines to debug issues with high dpi monitors
        // and OS zoom
        //
        // const rect = entry.target.getBoundingClientRect();
        // console.table({
        //   width,
        //   clientWidth: canvas.clientWidth,
        //   contentBoxInlineSize: entry.contentBoxSize[0].inlineSize,
        //   rectWidth: rect.width,
        //   height,
        //   clientHeight: canvas.clientHeight,
        //   contentBoxBlockSize: entry.contentBoxSize[0].blockSize,
        //   rectHeight: rect.height,
        // });

        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
        }
        this.resize({ width: canvas.clientWidth, height: canvas.clientHeight });
      }
    });
    try {
      resizeObserver.observe(canvas, { box: "device-pixel-content-box" });
    } catch {
      resizeObserver.observe(canvas);
    }
    return resizeObserver;
  }

  /**
   * The resolution of the canvas in css or logical pixels.
   *
   * @example
   *
   * // devicePixelRatio is 1, resolution is 200x200
   * <canvas width="200" height="200" style="width: 200px; height: 200px;"></canvas>
   * // devicePixelRatio is 2, resolution is 100x100
   * <canvas width="200" height="200" style="width: 100px; height: 100px;"></canvas>
   */
  get resolution() {
    return this.#resolution;
  }

  /**
   * Returns the currently configured Toodle engine limits
   *
   * See: https://toodle.gg/f849595b3ed13fc956fc1459a5cb5f0228f9d259/limits.html
   *
   * @example
   *
   * const instanceLimit: number = toodle.limits.instanceCount;
   */
  get limits(): Limits {
    return this.#backend.limits;
  }

  get batcher(): Batcher {
    return this.#batcher;
  }

  /**
   * The maximum number of pixels that can be loaded into texture atlases for this toodle instance.
   */
  get maxPixels() {
    return (
      this.limits.textureSize *
      this.limits.textureSize *
      this.limits.textureArrayLayers
    );
  }

  /**
   * The maximum amount of GPU memory that will be used by the Toodle instance.
   * This is a rough estimate and may not be exact. This will be allocated up front when calling Toodle.attach, and freed when calling toodle.destroy.
   */
  get maxGpuMemory() {
    return (
      this.limits.instanceCount *
      this.limits.instanceBufferSize *
      this.limits.shaderCount
    );
  }

  /**
   * call startFrame before drawing anything.
   * this will create a new encoder and render pass.
   *
   * @example
   *
   * toodle.startFrame();
   * // draw stuff
   * toodle.endFrame();
   */
  startFrame(options?: StartFrameOptions) {
    this.#backend.startFrame(this.clearColor, options?.loadOp ?? "clear");

    this.diagnostics.drawCalls =
      this.diagnostics.pipelineSwitches =
      this.diagnostics.instancesEnqueued =
        0;
  }

  /**
   * call draw in between start frame and end frame to enqueue an instanced draw call.
   *
   * @example
   *
   * toodle.assets.loadTexture("myImage", "assets/image.png");
   * const quad = toodle.Quad("myImage");
   *
   * toodle.startFrame();
   * toodle.draw(quad);
   * toodle.endFrame();
   */
  draw(node: SceneNode) {
    if (node instanceof QuadNode) {
      node.assetManager.validateTextureReference(node);
    } else {
      this.assets.validateTextureReference(node);
    }
    this.#batcher.enqueue(node);
  }

  /**
   * call end frame to run through enqueued draw calls and submit them to the GPU.
   *
   * @example
   *
   * toodle.startFrame();
   * // draw stuff
   * toodle.endFrame();
   */
  endFrame() {
    try {
      mat3.mul(
        this.#projectionMatrix,
        this.camera.matrix,
        this.#engineUniform.viewProjectionMatrix
      );
      this.#engineUniform.resolution = this.#resolution;

      // Update engine uniforms on the backend
      this.#backend.updateEngineUniform(this.#engineUniform);

      for (const pipeline of this.#batcher.pipelines) {
        pipeline.shader.startFrame(this.#engineUniform);
      }

      this.diagnostics.instancesEnqueued = this.#batcher.nodes.length;
      if (this.#batcher.nodes.length > this.limits.instanceCount) {
        const err = new Error(
          `ToodleInstanceCap: ${this.batcher.nodes.length} instances enqueued, max is ${this.limits.instanceCount}`
        );
        err.name = "ToodleInstanceCap";
        throw err;
      }

      for (const layer of this.#batcher.layers) {
        for (const pipeline of layer.pipelines) {
          this.diagnostics.pipelineSwitches++;
          this.diagnostics.drawCalls += pipeline.shader.processBatch(
            pipeline.nodes
          );
        }
      }

      for (const pipeline of this.#batcher.pipelines) {
        pipeline.shader.endFrame();
      }

      this.#backend.endFrame();
    } finally {
      this.#batcher.flush();
      this.#matrixPool.free();
      this.diagnostics.frames++;
    }
  }

  /**
   * Convert a point from one coordinate space to another.
   *
   * @param point - The point to convert.
   * @param options - The options for the conversion.
   * @returns The converted point.
   */
  convertSpace(
    point: Point,
    options: { from: "screen" | "world"; to: "world" | "screen" }
  ): Point {
    if (options.from === "screen" && options.to === "world") {
      return convertScreenToWorld(
        point,
        this.camera,
        this.#projectionMatrix,
        this.#resolution
      );
    }

    if (options.from === "world" && options.to === "screen") {
      return convertWorldToScreen(
        point,
        this.camera,
        this.#projectionMatrix,
        this.#resolution
      );
    }

    if (options.from === options.to) {
      return point;
    }

    throw new Error(
      `Unknown conversion from: ${options.from} to: ${options.to}`
    );
  }

  /**
   * The number of frames rendered since this Toodle instance was created.
   */
  get frameCount() {
    return this.diagnostics.frames;
  }

  /**
   * Create a custom shader for quad instances. In some engines, this might be called a material.
   *
   * @param label Debug name of the shader
   * @param instanceCount - The maximum number of instances that will be processed by the shader. Note that a worst-case buffer of this many instances will be immediately allocated.
   * @param userCode - The WGSL code to be used for the shader (WebGPU only).
   * @param blendMode - The blend mode to be used for the shader.
   *
   * @example
   *
   *
   */
  QuadShader(
    label: string,
    instanceCount: number,
    userCode: string,
    shaderOpts?: QuadShaderOpts
  ): IBackendShader {
    return this.#backend.createQuadShader({
      label,
      instanceCount,
      userCode,
      blendMode: shaderOpts?.blendMode,
      atlasId: shaderOpts?.atlasId,
    });
  }

  /**
   * Create a new quad node.
   *
   * @param assetId - The ID of the asset to use for the quad. This must have been loaded with toodle.assets.loadBundle.
   *
   * @param options - QuadOptions for Quad creation
   * @param options
   * @example
   *
   * await toodle.assets.loadTextures({
   *   "myImage": new URL("assets/image.png"),
   * });
   * const quad = toodle.Quad("myImage");
   *
   * toodle.startFrame();
   * toodle.draw(quad);
   * toodle.endFrame();
   */
  Quad(assetId: TextureId, options: QuadOptions = {}) {
    const assetManager = options.assetManager ?? this.assets;
    options.size ??= assetManager.getSize(assetId);
    options.shader ??= this.#defaultQuadShader();
    options.atlasCoords ??= assetManager.extra.getAtlasCoords(assetId)[0];
    options.textureId ??= assetId;
    options.cropOffset ??= assetManager.extra.getTextureOffset(assetId);
    options.assetManager = assetManager;

    options.atlasSize = this.#atlasSize;
    options.region ??= {
      x: 0,
      y: 0,
      width: options.atlasCoords.uvScale.width * this.#atlasSize.width,
      height: options.atlasCoords.uvScale.height * this.#atlasSize.height,
    };

    options.assetManager = assetManager;
    const quad = new QuadNode(options, this.#matrixPool);
    return quad;
  }

  /**
   * Create a jumbo quad node. This contains multiple tiles for a single texture.
   *
   * @param assetId - The ID of the asset to use for the jumbo quad. This must have been loaded with toodle.assets.loadTextures.
   *
   * @param options - QuadOptions for Quad creation
   *
   */
  JumboQuad(assetId: TextureId, options: JumboQuadOptions) {
    options.shader ??= this.#defaultQuadShader();
    options.textureId ??= assetId;
    options.cropOffset ??= {
      x: 0,
      y: 0,
    };
    options.tiles ??= [];

    // this holds the size of the full texture based on all of its tiles
    const originalSize = {
      width: 0,
      height: 0,
    };

    for (const tile of options.tiles) {
      if (!tile.size) {
        tile.size = this.assets.getSize(tile.textureId);
      }

      if (!tile.atlasCoords) {
        tile.atlasCoords = this.assets.extra.getAtlasCoords(tile.textureId)[0];
      }

      if (tile.offset.x + tile.size!.width > originalSize.width) {
        originalSize.width = tile.offset.x + tile.size!.width;
      }

      if (tile.offset.y + tile.size!.height > originalSize.height) {
        originalSize.height = tile.offset.y + tile.size!.height;
      }
    }

    options.region ??= {
      x: 0,
      y: 0,
      width: originalSize.width,
      height: originalSize.height,
    };

    options.size ??= {
      width: originalSize.width,
      height: originalSize.height,
    };

    options.atlasSize = this.#atlasSize;

    options.assetManager = this.assets;

    return new JumboQuadNode(options, this.#matrixPool);
  }

  /**
   * Create a new container node.
   *
   * @example
   *
   * const node = toodle.Node();
   * const child = node.add(toodle.Node());
   * node.position = [100, 100];
   * console.log(child.matrix);
   */
  Node(nodeOpts?: NodeOptions) {
    return new SceneNode(nodeOpts);
  }

  Text(fontId: string, text: string, textOpts?: TextOptions) {
    const shader = this.assets.getFont(fontId);

    return new TextNode(shader, text, textOpts);
  }

  shapes = {
    Rect: (options: QuadOptions = {}) => {
      options.size ??= { width: 1, height: 1 };
      options.shader ??= this.#defaultQuadShader();
      options.atlasCoords ??= {
        atlasIndex: 1000,
        uvOffset: { x: 0, y: 0 },
        uvScale: { width: 0, height: 0 },
        cropOffset: { x: 0, y: 0 },
        originalSize: { width: 1, height: 1 },
      };
      options.assetManager = this.assets;

      const quad = new QuadNode(options, this.#matrixPool);

      if (options?.position) {
        quad.position = options.position;
      }

      if (options?.rotation) {
        quad.rotation = options.rotation;
      }

      if (options?.scale) {
        quad.scale = options.scale;
      }

      return quad;
    },

    Circle: (options: CircleOptions = { radius: 50 }) => {
      const radius = options.radius ?? 50;
      const diameter = radius * 2;

      const quadOptions: QuadOptions = {
        ...options,
        size: { width: diameter, height: diameter },
        shader: options.shader ?? this.#defaultQuadShader(),
        atlasCoords: options.atlasCoords ?? {
          atlasIndex: 1001,
          uvOffset: { x: 0, y: 0 },
          uvScale: { width: 0, height: 0 },
          cropOffset: { x: 0, y: 0 },
          originalSize: { width: 1, height: 1 },
        },
        assetManager: this.assets,
      };

      const quad = new QuadNode(quadOptions, this.#matrixPool);

      if (options?.position) {
        quad.position = options.position;
      }

      if (options?.rotation) {
        quad.rotation = options.rotation;
      }

      if (options?.scale) {
        quad.scale = options.scale;
      }

      return quad;
    },

    Line: (options: LineOptions) => {
      const center = {
        x: (options.start.x + options.end.x) / 2,
        y: (options.start.y + options.end.y) / 2,
      };
      const angle = Math.atan2(
        options.end.y - options.start.y,
        options.end.x - options.start.x
      );
      const length = Math.sqrt(
        (options.end.x - options.start.x) ** 2 +
          (options.end.y - options.start.y) ** 2
      );

      const line = new QuadNode(
        {
          color: options.color,
          atlasCoords: {
            atlasIndex: 1000,
            uvOffset: { x: 0, y: 0 },
            uvScale: { width: 0, height: 0 },
            cropOffset: { x: 0, y: 0 },
            originalSize: { width: 1, height: 1 },
          },
          shader: options.shader ?? this.#defaultQuadShader(),
          size: { width: 1, height: 1 },
          layer: options.layer,
          key: options.key,
          rotationRadians: angle,
          assetManager: this.assets,
          scale: {
            x: length,
            y: options.thickness ?? 1,
          },
          position: center,
        },
        this.#matrixPool
      );

      return line;
    },
  };

  #quadShader: IBackendShader | null = null;

  #defaultQuadShader(): IBackendShader {
    if (this.#quadShader) {
      return this.#quadShader;
    }

    // For WebGPU, we can provide custom WGSL shader code
    // For WebGL, the backend will use its default shader
    const userCode =
      this.#backend.type === "webgpu"
        ? /*wgsl*/ `
        @fragment
        fn frag(vertex: VertexOutput) -> @location(0) vec4f {
          let color = default_fragment_shader(vertex, ${
            this.#defaultFilter === "nearest"
              ? "nearestSampler"
              : "linearSampler"
          });
          return color;
        }
      `
        : undefined;

    const shader = this.#backend.createQuadShader({
      label: "default quad shader",
      instanceCount: this.limits.instanceCount,
      userCode,
    });

    this.#quadShader = shader;
    return shader;
  }

  /**
   * Attach toodle to a canvas.
   *
   * @param canvas - The canvas to attach toodle to.
   * @param options - ToodleOptions for the creation of the toodle instance
   * @returns A promise that resolves to a Toodle instance.
   *
   * @example
   *
   *   const canvas = document.createElement("canvas");
   *
   *   const toodle = await Toodle.attach(canvas);
   */
  static async attach(canvas: HTMLCanvasElement, options?: ToodleOptions) {
    canvas.width = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;

    const backendOption = options?.backend ?? "auto";
    let backendType: BackendType;

    if (backendOption === "auto") {
      backendType = await detectBackend();
    } else {
      backendType = backendOption;
    }

    let backend: IRenderBackend;
    if (backendType === "webgpu") {
      backend = await WebGPUBackend.create(canvas, {
        limits: options?.limits,
      });
    } else {
      backend = await WebGLBackend.create(canvas, {
        limits: options?.limits,
      });
    }

    return new Toodle(
      backend,
      canvas,
      {
        width: canvas.clientWidth,
        height: canvas.clientHeight,
      },
      options || {}
    );
  }

  /**
   * Destroy the toodle instance and release its gpu and cpu resources.
   *
   * Note that calling any methods on the instance after this result in undefined behavior.
   */
  destroy() {
    this.#resizeObserver.disconnect();
    this.#backend.destroy();
    this.assets.destroy();
  }

  /**
   * Get the render backend instance.
   * Cast to WebGPUBackend or WebGLBackend to access backend-specific properties.
   *
   * @example
   * if (toodle.backend instanceof WebGPUBackend) {
   *   const device = toodle.backend.device;
   * }
   */
  get backend(): WebGPUBackend | WebGLBackend {
    return this.#backend as WebGPUBackend | WebGLBackend;
  }
}

export type StartFrameOptions = {
  /**
   * The load operation to use for the render pass.
   *
   * **clear**: clear the current texture to the clear color. necessary if you're using toodle without another renderer.
   *
   * **load**: blend the render pass with the current canvas contents. useful if you're using toodle alongside another renderer like painter or pixi.js
   *
   * @default "clear"
   *
   */
  loadOp?: "load" | "clear";
};

export type ToodleOptions = {
  /**
   * The filter mode to use for the default quad shader.
   * see: https://webgpufundamentals.org/webgpu/lessons/webgpu-textures.html#a-mag-filter
   *
   * **nearest**: nearest neighbor sampling. makes pixel art look sharp and vector art look jaggy.
   *
   * **linear**: linear sampling. makes vector art look smooth and pixel art look blurry.
   *
   * @default "linear"
   */
  filter?: "nearest" | "linear";
  limits?: LimitsOptions;
  /**
   * The rendering backend to use.
   *
   * **auto**: Automatically detect the best available backend (WebGPU > WebGL).
   *
   * **webgpu**: Use WebGPU backend. Throws if WebGPU is not available.
   *
   * **webgl2**: Use WebGL 2 backend (fallback for older browsers).
   *
   * @default "auto"
   */
  backend?: BackendType | "auto";
};

export type CircleOptions = Omit<QuadOptions, "size"> & {
  /**
   * The radius of the circle in pixels.
   * The diameter will be radius * 2.
   * @default 50
   */
  radius?: number;
};

export type LineOptions = {
  /**
   * The start position of the line.
   */
  start: Point;
  /**
   * The end position of the line.
   */
  end: Point;
  /**
   * The color of the line.
   */
  color: Color;
  /**
   * The thickness of the line.
   */
  thickness?: number;
  /**
   * The shader to use for the line.
   */
  shader?: IBackendShader;
  /**
   * The layer to draw the line on.
   */
  layer?: number;
  /**
   * A unique identifier for the line.
   */
  key?: string;
};

export type QuadShaderOpts = {
  /**
   * Blend mode for alpha compositing.
   */
  blendMode?: BlendMode;
  /**
   * Which texture atlas to bind (default: "default").
   */
  atlasId?: string;
};
