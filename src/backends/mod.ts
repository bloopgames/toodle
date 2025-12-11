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
