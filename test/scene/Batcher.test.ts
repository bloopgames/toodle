import { describe, expect, it } from "bun:test";
import { Batcher } from "../../src/scene/Batcher";
import type { RenderComponent } from "../../src/scene/RenderComponent";
import { SceneNode } from "../../src/scene/SceneNode";

const render: RenderComponent = {
  shader: {
    startFrame: () => {},
    processBatch: () => 0,
    endFrame: () => {},
  },
  writeInstance: () => 0,
};

function renderNodeFactory(label?: string) {
  return new SceneNode({ render, label });
}

describe("Batcher", () => {
  it("can enqueue a node", () => {
    const batcher = new Batcher();
    const node = renderNodeFactory();
    batcher.enqueue(node);

    expect(batcher.nodes.length).toEqual(1);
    expect(batcher.layers.length).toEqual(1);
    expect(batcher.layers[0].pipelines.length).toEqual(1);
    expect(batcher.layers[0].pipelines[0].nodes.length).toEqual(1);
    expect(batcher.layers[0].pipelines[0].nodes[0]).toEqual(node);
  });

  describe("ordering", () => {
    it("traverses tree in depth first order", () => {
      const batcher = new Batcher();
      const root = renderNodeFactory();
      const child = root.add(renderNodeFactory());
      const sibling = root.add(renderNodeFactory());
      const grandchild = child.add(renderNodeFactory());
      batcher.enqueue(root);
      expect(batcher.nodes).toEqual([root, child, grandchild, sibling]);
    });

    it("enqueues in queue order", () => {
      const batcher = new Batcher();
      const first = renderNodeFactory();
      const root = renderNodeFactory();
      const child = root.add(renderNodeFactory());
      const sibling = root.add(renderNodeFactory());
      const grandchild = child.add(renderNodeFactory());
      batcher.enqueue(first);
      batcher.enqueue(root);
      expect(batcher.nodes).toEqual([first, root, child, grandchild, sibling]);
    });
  });

  describe("skipping", () => {
    it("does not batch nodes with no render component", () => {
      const batcher = new Batcher();
      batcher.enqueue(new SceneNode());
      expect(batcher.nodes.length).toEqual(0);
    });

    it("batches children of parent with no render component", () => {
      const batcher = new Batcher();
      const parent = new SceneNode();
      const child = renderNodeFactory();
      parent.add(child);
      batcher.enqueue(parent);
      expect(batcher.nodes).toEqual([child]);
    });

    it("does not batch inactive nodes", () => {
      const batcher = new Batcher();
      const node = renderNodeFactory();
      node.isActive = false;
      batcher.enqueue(node);
      expect(batcher.nodes.length).toEqual(0);
    });

    it("does not batch children of inactive parents", () => {
      const batcher = new Batcher();
      const parent = new SceneNode();
      const child = renderNodeFactory();
      parent.add(child);
      parent.isActive = false;
      batcher.enqueue(parent);
      expect(batcher.nodes.length).toEqual(0);
    });
  });

  describe("grouping", () => {
    it("buckets by z", () => {
      const batcher = new Batcher();
      const first = renderNodeFactory();
      const second = renderNodeFactory();
      first.layer = 1;
      batcher.enqueue(first);
      batcher.enqueue(second);

      expect(batcher.layers.length).toEqual(2);
      expect(batcher.layers[0].pipelines[0].nodes).toEqual([second]);
      expect(batcher.layers[1].pipelines[0].nodes).toEqual([first]);
    });

    it("buckets by pipeline", () => {
      const batcher = new Batcher();
      const first = new SceneNode({ render });
      const second = new SceneNode({
        render: {
          shader: {
            processBatch: () => 0,
            startFrame: () => {},
            endFrame: () => {},
          },
          writeInstance: () => 0,
        },
      });
      const third = new SceneNode({ render });

      batcher.enqueue(first);
      batcher.enqueue(second);
      batcher.enqueue(third);

      expect(batcher.layers.length).toEqual(1);
      expect(batcher.layers[0].pipelines.length).toEqual(2);
      expect(batcher.layers[0].pipelines[0].shader).toEqual(render.shader);
      expect(batcher.layers[0].pipelines[0].nodes).toEqual([first, third]);
      expect(batcher.layers[0].pipelines[1].shader).toEqual(
        second.renderComponent!.shader,
      );
      expect(batcher.layers[0].pipelines[1].nodes).toEqual([second]);
    });
  });
});
