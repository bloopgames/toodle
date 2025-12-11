export type PostProcess = {
  /**
   * A post-processor modifies the current render before it is presented to the screen.
   *
   * @param encoder - a GPUCommandEncoder used to create render passes
   * @param pingpong - a pair of GPUTextures used for ping-pong rendering
   * @param screen - the final screen GPUTexture to render to
   */
  process(
    queue: GPUQueue,
    encoder: GPUCommandEncoder,
    pingpong: [GPUTexture, GPUTexture],
    screen: GPUTexture,
  ): void;
};

export const PostProcessDefaults = {
  sampler(device: GPUDevice): GPUSampler {
    return device.createSampler({
      label: "toodle post process sampler",
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });
  },

  vertexBufferLayout(_device: GPUDevice): GPUVertexBufferLayout {
    return {
      arrayStride: 4 * 4,
      attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
    };
  },

  vertexShader(device: GPUDevice): GPUShaderModule {
    return device.createShaderModule({
      label: "toodle post process vertex shader",
      code: `
  struct VertexOut {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
  };

  const enginePosLookup = array(vec2f(-1, 1), vec2f(-1, -1), vec2f(1, 1), vec2f(1, -1));
  const engineUvLookup = array(vec2f(0, 0), vec2f(0, 1), vec2f(1, 0), vec2f(1, 1));

  @vertex
  fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOut {
    var out: VertexOut;
    out.position = vec4(enginePosLookup[vertexIndex], 0.0, 1.0);
    out.uv = engineUvLookup[vertexIndex];
    return out;
  }
      `,
    });
  },

  pipelineDescriptor(device: GPUDevice): GPURenderPipelineDescriptor {
    return {
      label: "toodle post process pipeline descriptor",
      layout: "auto",

      primitive: { topology: "triangle-strip" },
      vertex: {
        buffers: [PostProcessDefaults.vertexBufferLayout(device)],
        module: PostProcessDefaults.vertexShader(device),
      },
    };
  },
} as const;
