// Backend abstraction layer

export {
  detectBackend,
  isWebGL2Available,
  isWebGPUAvailable,
} from "./detection";
export type { IBackendShader, QuadShaderCreationOpts } from "./IBackendShader";
export type {
  BackendType,
  BlendFactor,
  BlendMode,
  BlendOperation,
  IRenderBackend,
} from "./IRenderBackend";
export { WebGLBackend } from "./webgl2/WebGLBackend";
// WebGPU-specific postprocess utilities
export {
  type PostProcess,
  PostProcessDefaults,
} from "./webgpu/postprocess/mod";
// Concrete backend implementations
export { WebGPUBackend } from "./webgpu/WebGPUBackend";
