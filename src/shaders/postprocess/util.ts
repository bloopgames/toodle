import type { Color } from "../../coreTypes/Color";

export function renderToTarget(
  label: string,
  from: GPUTexture,
  to: GPUTexture,
  device: GPUDevice,
  encoder: GPUCommandEncoder,
  pipeline: GPURenderPipeline,
  clearColor: Color,
  bindGroups?: GPUBindGroup[],
) {
  // biome-ignore format:it's a matrix
  const fullscreenQuadVerts = new Float32Array([
    -1, -1,  0, 0,
     1, -1,  1, 0,
    -1,  1,  0, 1,
     1,  1,  1, 1,
  ]);

  // create vertex buffer
  // todo: only create this once
  const fullscreenVB = device.createBuffer({
    size: fullscreenQuadVerts.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  new Float32Array(fullscreenVB.getMappedRange()).set(fullscreenQuadVerts);
  fullscreenVB.unmap();

  // create engine uniform
  // todo: only create this once
  const engineUniform = device.createBuffer({
    label: `${label} engine uniform buffer`,
    size: 16,
    usage: GPUBufferUsage.UNIFORM,
    mappedAtCreation: true,
  });
  const engineUniformData = new Float32Array(engineUniform.getMappedRange());
  engineUniformData[0] = from.width;
  engineUniformData[1] = from.height;
  engineUniformData[2] = Math.random();
  engineUniformData[3] = performance.now() / 1000;
  engineUniform.unmap();

  // create bind group
  const bindGroup = device.createBindGroup({
    label: `${label} engine bind group`,
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: from.createView() },
      { binding: 1, resource: defaults.sampler(device) },
      { binding: 2, resource: engineUniform },
    ],
  });

  const renderPass = encoder.beginRenderPass({
    label: `${label} render pass`,
    colorAttachments: [
      {
        view: to.createView(),
        clearValue: clearColor,
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  });

  renderPass.setPipeline(pipeline);
  renderPass.setVertexBuffer(0, fullscreenVB);
  renderPass.setBindGroup(0, bindGroup);
  if (bindGroups) {
    for (let i = 0; i < bindGroups.length; i++) {
      renderPass.setBindGroup(i + 1, bindGroups[i]);
    }
  }
  renderPass.draw(4, 1, 0, 0);

  renderPass.end();
}
