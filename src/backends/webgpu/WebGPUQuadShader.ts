import {
  makeShaderDataDefinitions,
  makeStructuredView,
  type StructuredView,
} from "webgpu-utils";
import { WgslReflect } from "wgsl_reflect";
import type { EngineUniform } from "../../coreTypes/EngineUniform";
import type { SceneNode } from "../../scene/SceneNode";
import { assert } from "../../utils/assert";
import {
  createGpuPipeline,
  getGpuPipelineDescriptor,
  setVertexInstanceBufferLayout,
} from "../../utils/boilerplate";
import type { IBackendShader } from "../IBackendShader";
import type { BlendMode } from "../IRenderBackend";
import type { ITextureAtlas } from "../ITextureAtlas";
import {
  codeWithLineNumbers,
  combineShaderCode,
  struct2BufferLayout,
} from "./parser";
import { pixelArtSampler, smoothSampler } from "./samplers";
import type { WebGPUBackend } from "./WebGPUBackend";
import quadWgsl from "./wgsl/quad.wgsl";

type InstanceData = {
  cpuBuffer: Float32Array<ArrayBuffer>;
  gpuBuffer: GPUBuffer;
  bufferLayout: GPUVertexBufferLayout;
};

/**
 * WebGPU implementation of quad shader for instanced rendering.
 */
export class WebGPUQuadShader implements IBackendShader {
  readonly label: string;
  readonly code: string;

  #backend: WebGPUBackend;
  #atlas: ITextureAtlas;
  #uniformValues: StructuredView;
  #instanceData: InstanceData;
  #instanceIndex = 0;
  #instanceCount: number;

  #pipeline: GPURenderPipeline;
  #bindGroups: GPUBindGroup[] = [];
  #uniformBuffer: GPUBuffer;

  constructor(
    label: string,
    backend: WebGPUBackend,
    instanceCount: number,
    userCode?: string,
    blendMode?: BlendMode,
    atlasId?: string,
  ) {
    const atlas = backend.getTextureAtlas(atlasId ?? "default");
    if (!atlas) {
      throw new Error(`Atlas "${atlasId ?? "default"}" not found`);
    }
    this.#atlas = atlas;
    this.label = label;
    this.#backend = backend;
    this.#instanceCount = instanceCount;

    const device = backend.device;
    const presentationFormat = backend.presentationFormat;

    // Combine user code with base quad shader code
    const effectiveUserCode =
      userCode ??
      /*wgsl*/ `
			@fragment
			fn frag(vertex: VertexOutput) -> @location(0) vec4f {
				let color = default_fragment_shader(vertex, linearSampler);
				return color;
			}
		`;

    const shaderDescriptor = combineShaderCode(
      label,
      quadWgsl,
      effectiveUserCode,
    );

    // Create shader module from combined code
    let module: GPUShaderModule;
    try {
      module = device.createShaderModule({
        label,
        code: shaderDescriptor.code,
      });
    } catch (e) {
      console.error(codeWithLineNumbers(shaderDescriptor.code));
      throw e;
    }

    // Store combined code for debugging
    this.code = shaderDescriptor.code;

    // Create blend state
    const blend = blendMode
      ? convertBlendMode(blendMode)
      : {
          color: {
            srcFactor: "src-alpha" as GPUBlendFactor,
            dstFactor: "one-minus-src-alpha" as GPUBlendFactor,
            operation: "add" as GPUBlendOperation,
          },
          alpha: {
            srcFactor: "one" as GPUBlendFactor,
            dstFactor: "one-minus-src-alpha" as GPUBlendFactor,
            operation: "add" as GPUBlendOperation,
          },
        };

    // Create instance data from shader code
    const ast = new WgslReflect(shaderDescriptor.code);
    const instanceStruct = ast.structs.find((s) =>
      s.name.endsWith("InstanceData"),
    );
    if (!instanceStruct) {
      console.error(codeWithLineNumbers(shaderDescriptor.code));
      throw new Error(
        "Quad shader has no instance struct. The wgsl is required to contain a struct ending in InstanceData.",
      );
    }
    const bufferLayout = struct2BufferLayout(instanceStruct);
    this.#instanceData = {
      bufferLayout,
      cpuBuffer: new Float32Array(
        (bufferLayout.arrayStride * instanceCount) /
          Float32Array.BYTES_PER_ELEMENT,
      ),
      gpuBuffer: device.createBuffer({
        size: bufferLayout.arrayStride * instanceCount,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        label: `${label} instance data`,
      }),
    };

    // Create pipeline descriptor
    const pipelineDescriptor = getGpuPipelineDescriptor(
      shaderDescriptor,
      module,
      presentationFormat,
      blend,
    );

    // Set vertex instance buffer layout
    setVertexInstanceBufferLayout(
      pipelineDescriptor,
      this.#instanceData.bufferLayout,
    );

    // Create pipeline
    this.#pipeline = createGpuPipeline(
      device,
      shaderDescriptor,
      pipelineDescriptor,
    );

    // Create uniform buffer for engine uniforms (mat3x3 viewProjection)
    const defs = makeShaderDataDefinitions(this.code);
    this.#uniformValues = makeStructuredView(defs.uniforms.engineUniform);
    this.#uniformBuffer = device.createBuffer({
      label: `${label} engine uniform buffer`,
      size: this.#uniformValues.arrayBuffer.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Create bind groups
    this.#bindGroups = this.#createBindGroups(device);
  }

  startFrame(uniform: EngineUniform): void {
    this.#instanceIndex = 0;

    this.#uniformValues.set(uniform);
    this.#uniformValues.set({
      viewProjection: uniform.viewProjectionMatrix,
      resolution: [uniform.resolution.width, uniform.resolution.height],
    });

    // Write view projection matrix to uniform buffer
    const device = this.#backend.device;
    device.queue.writeBuffer(
      this.#uniformBuffer,
      0,
      this.#uniformValues.arrayBuffer,
    );
  }

  processBatch(nodes: SceneNode[]): number {
    const device = this.#backend.device;
    const renderPass = this.#backend.renderPass;

    renderPass.setPipeline(this.#pipeline);
    const batchStartInstanceIndex = this.#instanceIndex;

    let instanceCount = 0;

    if (nodes.length > this.#instanceCount) {
      throw new Error(
        `ToodleInstanceCap: ${nodes.length} instances enqueued, max is ${this.#instanceCount} for ${this.label} shader`,
      );
    }

    for (let i = 0; i < nodes.length; i++) {
      if (!this.#instanceData) {
        continue;
      }
      const instance = nodes[i];
      assert(instance.renderComponent, "instance has no render component");
      const floatOffset =
        ((batchStartInstanceIndex + instanceCount) *
          this.#instanceData.bufferLayout.arrayStride) /
        Float32Array.BYTES_PER_ELEMENT;

      instanceCount += instance.renderComponent.writeInstance(
        instance,
        this.#instanceData.cpuBuffer,
        floatOffset,
      );
    }

    if (this.#instanceData) {
      const byteOffset =
        batchStartInstanceIndex * this.#instanceData.bufferLayout.arrayStride;
      const byteLength =
        instanceCount * this.#instanceData.bufferLayout.arrayStride;

      device.queue.writeBuffer(
        this.#instanceData.gpuBuffer,
        byteOffset,
        this.#instanceData.cpuBuffer,
        byteOffset / Float32Array.BYTES_PER_ELEMENT,
        byteLength / Float32Array.BYTES_PER_ELEMENT,
      );

      renderPass.setVertexBuffer(0, this.#instanceData.gpuBuffer);

      for (let i = 0; i < this.#bindGroups.length; i++) {
        renderPass.setBindGroup(i, this.#bindGroups[i]);
      }
    }

    this.#instanceIndex += instanceCount;

    renderPass.draw(4, instanceCount, 0, batchStartInstanceIndex);
    return 1;
  }

  endFrame(): void {
    // Nothing to do
  }

  #createBindGroups(device: GPUDevice): GPUBindGroup[] {
    const textureAtlas = this.#atlas.handle as GPUTexture;

    const bindGroup = device.createBindGroup({
      label: `${this.label} engine bind group`,
      layout: this.#pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.#uniformBuffer,
          },
        },
        {
          binding: 1,
          resource: device.createSampler(smoothSampler),
        },
        {
          binding: 2,
          resource: device.createSampler(pixelArtSampler),
        },
      ],
    });

    const atlasBindGroup = device.createBindGroup({
      label: `${this.label} atlas bind group`,
      layout: this.#pipeline.getBindGroupLayout(1),
      entries: [
        {
          binding: 0,
          resource: textureAtlas.createView({
            dimension: "2d-array",
            arrayLayerCount: textureAtlas.depthOrArrayLayers,
          }),
        },
      ],
    });

    return [bindGroup, atlasBindGroup];
  }
}

function convertBlendMode(mode: BlendMode): GPUBlendState {
  const convertFactor = (f: string): GPUBlendFactor => {
    const map: Record<string, GPUBlendFactor> = {
      one: "one",
      zero: "zero",
      "src-alpha": "src-alpha",
      "one-minus-src-alpha": "one-minus-src-alpha",
      "dst-alpha": "dst-alpha",
      "one-minus-dst-alpha": "one-minus-dst-alpha",
    };
    const result = map[f];
    if (!result) {
      throw new Error(`Unknown blend factor: ${f}`);
    }
    return result;
  };

  const convertOp = (o: string): GPUBlendOperation => {
    const map: Record<string, GPUBlendOperation> = {
      add: "add",
      subtract: "subtract",
      "reverse-subtract": "reverse-subtract",
    };
    const result = map[o];
    if (!result) {
      throw new Error(`Unknown blend operation: ${o}`);
    }
    return result;
  };

  return {
    color: {
      srcFactor: convertFactor(mode.color.srcFactor),
      dstFactor: convertFactor(mode.color.dstFactor),
      operation: convertOp(mode.color.operation),
    },
    alpha: {
      srcFactor: convertFactor(mode.alpha.srcFactor),
      dstFactor: convertFactor(mode.alpha.dstFactor),
      operation: convertOp(mode.alpha.operation),
    },
  };
}
