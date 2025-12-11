import type { IBackendShader } from "../backends/IBackendShader";
import type { SceneNode } from "./SceneNode";

export type RenderComponent = {
  shader: IBackendShader;
  data?: Float32Array;

  /**
   * Write cpu instance data to the buffer. Returns number of instances written
   */
  writeInstance: (node: SceneNode, dst: Float32Array, offset: number) => number;
};
