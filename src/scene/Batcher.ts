import type { IBackendShader } from "../backends/IBackendShader";
import type { SceneNode } from "./SceneNode";

type Layer = {
  z: number;
  pipelines: Pipeline[];
};

export type Pipeline<TNode extends SceneNode = SceneNode> = {
  shader: IBackendShader;
  nodes: TNode[];
};

export class Batcher {
  nodes: SceneNode[] = [];
  layers: Layer[] = [];
  pipelines: Pipeline[] = [];

  enqueue(node: SceneNode) {
    if (node.renderComponent && node.isActive) {
      this.nodes.push(node);
      const z = node.layer;
      const layer = this.#findOrCreateLayer(z);
      const pipeline = this.#findOrCreatePipeline(
        layer,
        node.renderComponent.shader,
      );
      pipeline.nodes.push(node);
    }

    for (const kid of node.kids) {
      this.enqueue(kid);
    }
  }

  flush() {
    this.nodes = [];
    this.layers = [];
    this.pipelines = [];
  }

  #findOrCreateLayer(z: number) {
    let layer = this.layers.find((l) => l.z === z);
    if (!layer) {
      layer = { z, pipelines: [] };
      this.layers.push(layer);
      this.layers.sort((a, b) => a.z - b.z);
    }
    return layer;
  }

  #findOrCreatePipeline(layer: Layer, shader: IBackendShader) {
    let pipeline = layer.pipelines.find((p) => p.shader === shader);
    if (!pipeline) {
      pipeline = { shader, nodes: [] };
      layer.pipelines.push(pipeline);
      this.pipelines.push(pipeline);
    }
    return pipeline;
  }
}
