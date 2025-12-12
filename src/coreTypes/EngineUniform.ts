import type { Mat3 } from "wgpu-matrix";
import type { Camera } from "../scene/Camera";
import type { Resolution } from "../screen/resolution";

export type EngineUniform = {
  resolution: Resolution;
  camera: Camera;
  viewProjectionMatrix: Mat3;

  // could add time, deltaTime, etc here if needed
};
