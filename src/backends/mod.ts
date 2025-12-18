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
export type { ITextShader } from "./ITextShader";
export type {
  ITextureAtlas,
  TextureAtlasFormat,
  TextureAtlasOptions,
} from "./ITextureAtlas";
export { defaultFragmentShader as defaultGLSLFragmentShader } from "./webgl2/glsl/quad.glsl";
export { WebGLBackend } from "./webgl2/WebGLBackend";
// WebGPU-specific postprocess utilities
export {
  type PostProcess,
  PostProcessDefaults,
} from "./webgpu/postprocess/mod";
// Concrete backend implementations
export { WebGPUBackend } from "./webgpu/WebGPUBackend";
