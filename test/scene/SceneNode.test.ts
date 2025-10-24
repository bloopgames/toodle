import { describe, expect, it } from "bun:test";
import type { RenderComponent } from "../../src/scene/RenderComponent";
import { SceneNode } from "../../src/scene/SceneNode";

describe("SceneNode", () => {
  it("builds from empty opts", () => {
    const node = new SceneNode();
    expect(node).toBeDefined();
    expect(node.id).toBeTruthy();

    expect(node.kids).toEqual([]);
    expect(node.parent).toBeNull();
  });

  describe("deletion", () => {
    it("works on a scene node with no parent", () => {
      const node = new SceneNode();
      node.delete();
      expect(node.isActive).toBe(false);
    });

    it("children can be removed without being deleted", () => {
      const parent = new SceneNode();
      const kid = new SceneNode();
      const grandkid = new SceneNode();

      kid.add(grandkid);
      parent.add(kid);
      parent.remove(kid);
      expect(parent.kids.length === 0);
      expect(kid.isActive).toBe(true);
      expect(grandkid.isActive).toBe(true);
    });

    it("deletion of children also deletes grandchildren", () => {
      const parent = new SceneNode();
      const kid = new SceneNode();
      const grandkid = new SceneNode();

      kid.add(grandkid);
      parent.add(kid);
      kid.delete();

      expect(parent.kids.length).toEqual(0);

      expect(kid.isActive).toBe(false);
      expect(grandkid.isActive).toBe(false);
      expect(kid.kids.length).toEqual(0);
    });
  });

  describe("propagation", () => {
    it("matrix is calculated from parent matrix", () => {
      const parent = new SceneNode();
      const kid = parent.add(new SceneNode());

      expect(kid.matrix).toEqual(parent.matrix);
      parent.position = { x: 2, y: 3 };
      parent.scale = { x: 4, y: 5 };

      expect(kid.matrix[8]).toEqual(2);
      expect(kid.matrix[9]).toEqual(3);
      expect(kid.matrix[0]).toBeCloseTo(4);
      expect(kid.matrix[5]).toBeCloseTo(5);

      kid.scale = { x: 2, y: 2 };
      expect(kid.matrix[0]).toBeCloseTo(8);
      expect(kid.matrix[5]).toBeCloseTo(10);

      kid.rotation = 90;
      expect(kid.matrix[0]).toBeCloseTo(0);
      expect(kid.matrix[1]).toBeCloseTo(10);
      expect(kid.matrix[5]).toBeCloseTo(0);
      expect(kid.matrix[4]).toBeCloseTo(-8);
    });

    it("layer is inherited from parent unless overwritten", () => {
      const parent = new SceneNode();
      const kid = parent.add(new SceneNode());
      const grandKid = kid.add(new SceneNode());
      const sibling = parent.add(new SceneNode());

      expect(kid.layer).toBe(parent.layer);
      expect(grandKid.layer).toBe(parent.layer);
      expect(sibling.layer).toBe(parent.layer);

      parent.layer = 1;
      expect(kid.layer).toBe(parent.layer);
      expect(grandKid.layer).toBe(parent.layer);
      expect(sibling.layer).toBe(parent.layer);

      sibling.layer = 2;
      expect(sibling.layer).toBe(2);
    });

    it("regression, layer of children is cached correctly", () => {
      const parent = new SceneNode();
      const child = new SceneNode();
      parent.add(child);
      parent.layer = 1;

      expect(child.layer).toBe(1);
      // second check will hit cache
      expect(child.layer).toBe(1);
    });

    it("isActive is inherited from parent", () => {
      const parent = new SceneNode({ isActive: true });
      const kid = parent.add(new SceneNode());
      expect(kid.isActive).toBe(true);

      parent.isActive = false;
      expect(kid.isActive).toBe(false);
    });

    it("toggling isActive on parent retains child active state", () => {
      const parent = new SceneNode();
      const kid = parent.add(new SceneNode());
      const sibling = parent.add(new SceneNode({ isActive: false }));

      parent.isActive = false;
      expect(kid.isActive).toBe(false);
      expect(sibling.isActive).toBe(false);

      parent.isActive = true;
      expect(kid.isActive).toBe(true);
      expect(sibling.isActive).toBe(false);
    });

    it("updating parent position or scale attributes invalidates child matrix", () => {
      const parent = new SceneNode();
      const kid = parent.add(new SceneNode());

      // populate cache before we change the parent
      const kidMatrix = kid.matrix;
      parent.position.x = 200;
      parent.scale.y = 3;

      expect(parent.matrix[5]).toEqual(3);
      expect(kid.matrix).toEqual(parent.matrix);

      parent.scale = 9;
      expect(parent.matrix[5]).toEqual(9);
      expect(kid.matrix).toEqual(parent.matrix);

      parent.scale.y = 4;
      expect(parent.matrix[5]).toEqual(4);
      expect(kid.matrix).toEqual(parent.matrix);
    });
  });

  describe("serialization", () => {
    it("serializes to JSON", () => {
      const node = new SceneNode({ label: "hello" });
      const json = JSON.stringify(node);

      const clonedNode = SceneNode.parse(json);
      expect(clonedNode.x).toEqual(node.x);
      expect(clonedNode.y).toEqual(node.y);
      expect(clonedNode.scale).toEqual(node.scale);
      expect(clonedNode.rotation).toEqual(node.rotation);
      expect(clonedNode.id).toBe(node.id);
      expect(clonedNode.isActive).toBe(node.isActive);
      expect(clonedNode.layer).toBe(node.layer);
      expect(clonedNode.kids).toEqual([]);
      expect(clonedNode.parent).toBeNull();
      expect(clonedNode.position).toEqual(node.position);
      expect(clonedNode.label).toEqual(node.label!);
      expect(clonedNode.rotationRadians).toEqual(node.rotationRadians);
      expect(clonedNode.renderComponent).toEqual(node.renderComponent);
      expect(clonedNode.hasExplicitLayer).toEqual(node.hasExplicitLayer);
      expect(clonedNode.matrix).toEqual(node.matrix);
    });

    it("parses kids", () => {
      const parent = new SceneNode();
      const kid = parent.add(new SceneNode());
      const grandKid = kid.add(new SceneNode());

      const json = JSON.stringify(parent);
      const clonedParent = SceneNode.parse(json);
      expect(clonedParent.kids).toEqual([kid]);
      expect(clonedParent.kids[0].parent).toBe(clonedParent);
      expect(clonedParent.kids[0].kids[0]).toEqual(grandKid);
      expect(clonedParent.kids[0].kids[0].parent).toEqual(kid);
    });
  });

  describe("world space", () => {
    it("calculates a world bounding box for a scene node with no parents and no transform", () => {
      const node = new SceneNode({ idealSize: { width: 100, height: 100 } });

      {
        const bounds = node.bounds;
        expect(bounds.left).toEqual(-50);
        expect(bounds.right).toEqual(50);
        expect(bounds.bottom).toEqual(-50);
        expect(bounds.top).toEqual(50);
      }
    });

    it("works for a local transform", () => {
      const node = new SceneNode({ idealSize: { width: 100, height: 200 } });

      {
        const bounds = node.bounds;
        expect(bounds.left).toEqual(-50);
        expect(bounds.right).toEqual(50);
        expect(bounds.bottom).toEqual(-100);
        expect(bounds.top).toEqual(100);
      }

      node.scale = 2;

      {
        const bounds = node.bounds;
        expect(bounds.left).toEqual(-100);
        expect(bounds.right).toEqual(100);
        expect(bounds.bottom).toEqual(-200);
        expect(bounds.top).toEqual(200);
      }

      node.x += 100;
      node.y += 50;

      {
        const bounds = node.bounds;
        // the node is now at (100, 50) with a size of 2*100x200=200x400
        expect(bounds.x).toEqual(100);
        expect(bounds.y).toEqual(50);
        expect(bounds.left).toEqual(0);
        expect(bounds.right).toEqual(200);
        expect(bounds.bottom).toEqual(-150);
        expect(bounds.top).toEqual(250);
      }
    });

    it("works with rotation", () => {
      const node = new SceneNode({ idealSize: { width: 100, height: 100 } });
      node.rotation = 45;

      {
        const bounds = node.bounds;
        expect(bounds.left).toBeCloseTo(-50 * Math.sqrt(2));
        expect(bounds.right).toBeCloseTo(50 * Math.sqrt(2));
        expect(bounds.bottom).toBeCloseTo(-50 * Math.sqrt(2));
        expect(bounds.top).toBeCloseTo(50 * Math.sqrt(2));
      }
    });

    it("works with a parent matrix", () => {
      const parent = new SceneNode();
      const child = parent.add(
        new SceneNode({
          idealSize: { width: 100, height: 100 },
          position: { x: 50, y: 0 },
        }),
      );

      expect(child.bounds.left).toEqual(0);
      expect(child.bounds.right).toEqual(100);
      expect(child.bounds.bottom).toEqual(-50);
      expect(child.bounds.top).toEqual(50);

      parent.rotation = -90;
      expect(child.bounds.left).toEqual(-50);
      expect(child.bounds.right).toEqual(50);
      expect(child.bounds.bottom).toEqual(-100);
      expect(child.bounds.top).toEqual(0);

      parent.position = { x: 100, y: 100 };
      expect(child.bounds.left).toEqual(50);
      expect(child.bounds.right).toEqual(150);
      expect(child.bounds.bottom).toEqual(0);
      expect(child.bounds.top).toEqual(100);

      parent.scale = { x: 2, y: 2 };
      expect(child.bounds.left).toEqual(0);
      expect(child.bounds.right).toEqual(200);
      expect(child.bounds.bottom).toEqual(-100);
      expect(child.bounds.top).toEqual(100);
    });

    it("doesn't incorporate parent size or flipX/flipY", () => {
      const parent = new SceneNode({
        idealSize: { width: 1024, height: 1024 },
        flipX: true,
        flipY: true,
      });
      const child = parent.add(
        new SceneNode({ idealSize: { width: 100, height: 100 } }),
      );

      expect(child.bounds.left).toEqual(-50);
      expect(child.bounds.right).toEqual(50);
    });

    it("allows setting edge for an axis-aligned node", () => {
      const node = new SceneNode({ idealSize: { width: 100, height: 100 } });

      node.left = 0;
      node.bottom = 0;

      expect(node.bounds.left).toEqual(0);
      expect(node.bounds.right).toEqual(100);
      expect(node.bounds.bottom).toEqual(0);
      expect(node.bounds.top).toEqual(100);
      expect(node.x).toEqual(50);
      expect(node.y).toEqual(50);
    });

    it("allows setting edge for a rotated node", () => {
      const node = new SceneNode({
        idealSize: { width: 100, height: 100 },
        rotation: 180,
        scale: 2,
      });

      node.left = 0;
      node.bottom = -100;

      expect(node.bounds.left).toBeCloseTo(0);
      expect(node.bounds.bottom).toBeCloseTo(-100);
    });

    it("allows setting edge for a node with a parent", () => {
      const parent = new SceneNode({
        rotation: 90,
      });
      const child = parent.add(
        new SceneNode({
          idealSize: { width: 100, height: 100 },
          position: { x: 100, y: 100 },
        }),
      );

      child.left = 0;
      child.bottom = 300;

      expect(child.bounds.left).toBeCloseTo(0);
      expect(child.bounds.bottom).toBeCloseTo(300);
    });

    it("regression - sets world position correctly when parent has translation", () => {
      const parent = new SceneNode({
        position: { x: 20, y: 20 },
      });

      const child = parent.add(new SceneNode());
      child.centerX = 10;
      child.centerY = 10;
      expect(child.bounds.y).toEqual(10);
      expect(child.bounds.x).toEqual(10);
    });
  });

  describe("render component", () => {
    it("allows attaching a render component", () => {
      const hello: RenderComponent = {
        shader: {
          startFrame: () => {},
          processBatch: () => 0,
          endFrame: () => {},
        },
        writeInstance: () => 0,
      };

      const node = new SceneNode({
        render: hello,
      });
      expect(node.renderComponent).toBe(hello);
    });
  });
});
