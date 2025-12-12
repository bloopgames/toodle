import { describe, expect, it } from "bun:test";
import { combineShaderCode } from "../../src/backends/webgpu/parser";
import helloWgsl from "../../src/backends/webgpu/wgsl/hello.wgsl";
import { getGpuPipelineDescriptor } from "../../src/utils/boilerplate";
describe("combineShaderCode", () => {
  it("should combine shader code", () => {
    const descriptor = combineShaderCode(
      "test",
      helloWgsl,
      `
@vertex
fn myVertex(input: VertexInput) -> VertexOutput {
  var output = default_vertex_shader(input);
  return output;
}

@fragment
fn myFragment(vertex: VertexOutput) -> @location(0) vec4f {
  var output = default_fragment_shader(vertex);
  return output.color;
}
`,
    );
    expect(descriptor.code).toMatchSnapshot();
  });
});

describe("shader code to pipeline", () => {
  const shaderCode = `
@vertex
fn myVertex(input: VertexInput) -> VertexOutput {
  var output = default_vertex_shader(input);
  return output;
}

@fragment
fn myFragment(vertex: VertexOutput) -> @location(0) vec4f {
  var output = default_fragment_shader(vertex);
  return output.color;
}
`;

  it("should generate a pipeline descriptor", () => {
    const descriptor = combineShaderCode("test", helloWgsl, shaderCode);
    const blend = defaultBlendState();
    const pipelineDescriptor = getGpuPipelineDescriptor(
      descriptor,
      createMockModule(descriptor.label),
      "bgra8unorm",
      blend,
    );
    expect(pipelineDescriptor).toMatchSnapshot();
  });
});

function createMockModule(label: string) {
  return {
    __brand: "GPUShaderModule" as any,
    getCompilationInfo: () => Promise.resolve({} as any),
    label,
  };
}

function defaultBlendState(): GPUBlendState {
  return {
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
}
