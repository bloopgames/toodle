import {
  makeShaderDataDefinitions,
  makeStructuredView,
  type StructuredView,
} from "webgpu-utils";
import { WgslReflect } from "wgsl_reflect";
import type { SceneNode } from "../scene/SceneNode";
import type { AssetManager } from "../textures/AssetManager";
import { assert } from "../utils/assert";
import {
  attachVertexInstanceBuffer,
  createGpuPipeline,
  getGpuPipelineDescriptor,
  setVertexInstanceBufferLayout,
} from "../utils/boilerplate";
import type { EngineUniform } from "./EngineUniform";
import type { IShader } from "./IShader";
import {
  codeWithLineNumbers,
  combineShaderCode,
  struct2BufferLayout,
} from "./parser";
import { pixelArtSampler, smoothSampler } from "./samplers";
import quadWgsl from "./wgsl/quad.wgsl";

export class QuadShader implements IShader {
  label: string;
  code: string;

  #uniformValues: StructuredView;
  #instanceData: InstanceData;
  #instanceIndex = 0;
  #instanceCount;

  #device: GPUDevice;
  #pipeline: GPURenderPipeline;
  #bindGroups: GPUBindGroup[] = [];
  #uniformBuffer: GPUBuffer;

  startFrame(device: GPUDevice, uniform: EngineUniform) {
    this.#instanceIndex = 0;

    this.#uniformValues.set(uniform);
    this.#uniformValues.set({
      viewProjection: uniform.viewProjectionMatrix,
      resolution: [uniform.resolution.width, uniform.resolution.height],
    });

    // Write view projection matrix to uniform buffer
    device.queue.writeBuffer(
      this.#uniformBuffer,
      0,
      this.#uniformValues.arrayBuffer,
    );
  }

  processBatch(renderPass: GPURenderPassEncoder, nodes: SceneNode[]) {
    renderPass.setPipeline(this.#pipeline);
    const batchStartInstanceIndex = this.#instanceIndex;

    // Count for the number of instances in the buffer...
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

      this.#device.queue.writeBuffer(
        this.#instanceData.gpuBuffer,
        byteOffset,
        this.#instanceData.cpuBuffer,
        byteOffset / Float32Array.BYTES_PER_ELEMENT,
        byteLength / Float32Array.BYTES_PER_ELEMENT,
      );

      attachVertexInstanceBuffer(renderPass, this.#instanceData.gpuBuffer);

      for (let i = 0; i < this.#bindGroups.length; i++) {
        renderPass.setBindGroup(i, this.#bindGroups[i]);
      }
    }

    this.#instanceIndex += instanceCount;

    renderPass.draw(4, instanceCount, 0, batchStartInstanceIndex);
    return 1;
  }

  endFrame() {}

  constructor(
    label: string,
    assetManager: AssetManager,
    device: GPUDevice,
    presentationFormat: GPUTextureFormat,
    userCode: string,
    instanceCount: number,
    blendMode?: GPUBlendState,
    sampleType?: "linear" | "nearest",
  ) {
    this.label = label;

    // Combine user code with base quad shader code
    const shaderDescriptor = combineShaderCode(label, quadWgsl, userCode);

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
    const blend = blendMode ?? {
      color: {
        srcFactor: "src-alpha",
        dstFactor: "one-minus-src-alpha",
        operation: "add",
      },
      alpha: {
        srcFactor: "one",
        dstFactor: "one-minus-src-alpha",
        operation: "add",
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

    // Reference texture atlas
    const textureAtlas = assetManager.textureAtlas;

    // Store device
    this.#device = device;

    // Create uniform buffer for engine uniforms (mat3x3 viewProjection)
    const defs = makeShaderDataDefinitions(this.code);
    this.#uniformValues = makeStructuredView(defs.uniforms.engineUniform);
    this.#uniformBuffer = device.createBuffer({
      label: `${label} engine uniform buffer`,
      size: this.#uniformValues.arrayBuffer.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Create bind groups
    this.#bindGroups = setQuadBindGroups(
      label,
      device,
      this.#pipeline,
      textureAtlas,
      this.#uniformBuffer,
    );

    this.#instanceCount = instanceCount;
  }
}

function setQuadBindGroups(
  label: string,
  device: GPUDevice,
  pipeline: GPURenderPipeline,
  textureAtlas: GPUTexture,
  buffer: GPUBuffer,
) {
  const bindGroup = device.createBindGroup({
    label: `${label} engine bind group`,
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer,
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
    label: `${label} atlas bind group`,
    layout: pipeline.getBindGroupLayout(1),
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

type InstanceData = {
  cpuBuffer: Float32Array;
  gpuBuffer: GPUBuffer;
  bufferLayout: GPUVertexBufferLayout;
};
