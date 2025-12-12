import {
  makeBindGroupLayoutDescriptors,
  makeShaderDataDefinitions,
} from "webgpu-utils";
import type { ShaderDescriptor } from "../backends/webgpu/ShaderDescriptor";
import { assert } from "./assert";

// convenience functions to wrap verbose webgpu apis - not part of public api

export async function initGpu(
  canvas: HTMLCanvasElement,
  onUncapturedError?: (e: GPUUncapturedErrorEvent) => void,
) {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error("WebGPU not supported");
  }

  const device = await adapter.requestDevice();
  device.lost.then((info) => {
    console.error("GPU Device lost", info);
  });
  if (onUncapturedError) {
    device.onuncapturederror = onUncapturedError;
  }

  const context = canvas.getContext("webgpu");

  assert(device, "WebGPU not supported");
  assert(context, "WebGPU not supported");

  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

  context.configure({
    device,
    format: presentationFormat,
  });

  return {
    device,
    context,
    presentationFormat,
  };
}

export function getGpuPipelineDescriptor(
  shaderDescriptor: ShaderDescriptor,
  module: GPUShaderModule,
  presentationFormat: GPUTextureFormat,
  blend?: GPUBlendState,
): Omit<GPURenderPipelineDescriptor, "layout"> {
  const pipelineDescriptor: Omit<GPURenderPipelineDescriptor, "layout"> = {
    label: `${shaderDescriptor.label} pipeline`,
    vertex: {
      module,
      entryPoint: shaderDescriptor.vertexEntrypoint,
    },
    fragment: {
      module,
      entryPoint: shaderDescriptor.fragmentEntrypoint,
      targets: [
        {
          format: presentationFormat,
          blend,
        },
      ],
    },
    primitive: {
      topology: "triangle-strip",
    },
  };

  return pipelineDescriptor;
}

export function setVertexInstanceBufferLayout(
  pipeline: Omit<GPURenderPipelineDescriptor, "layout">,
  bufferLayout: GPUVertexBufferLayout,
): Omit<GPURenderPipelineDescriptor, "layout"> {
  pipeline.vertex.buffers = [bufferLayout];
  return pipeline;
}

export function attachVertexInstanceBuffer(
  renderPass: GPURenderPassEncoder,
  instanceBuffer: GPUBuffer,
) {
  renderPass.setVertexBuffer(0, instanceBuffer);
}

export function createGpuPipeline(
  device: GPUDevice,
  shaderDescriptor: ShaderDescriptor,
  pipelineDescriptor: Omit<GPURenderPipelineDescriptor, "layout">,
): GPURenderPipeline {
  const defs = makeShaderDataDefinitions(shaderDescriptor.code);
  const descriptors = makeBindGroupLayoutDescriptors(defs, pipelineDescriptor);

  return device.createRenderPipeline({
    ...pipelineDescriptor,
    layout: device.createPipelineLayout({
      bindGroupLayouts: descriptors.map((d, i) =>
        device.createBindGroupLayout({
          label: `${shaderDescriptor.label} bind group layout ${i}`,
          ...d,
        }),
      ),
    }),
  });
}
