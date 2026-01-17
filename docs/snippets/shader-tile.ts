import { Toodle } from "@bloopjs/toodle";

const canvas = document.querySelector("canvas")!;

const toodle = await Toodle.attach(canvas, {
  filter: "linear",
  limits: { textureArrayLayers: 5 },
});

await toodle.assets.registerBundle("tiles", {
  textures: {
    mushroom: new URL("img/Mushroom.png", "https://toodle.gg"),
  },
  autoLoad: true,
});

const shader = toodle.QuadShader(
  "tile",
  3,
  /*wgsl*/ `

struct Tile {
  count: vec2f,
}

@fragment
fn frag(vertex: VertexOutput) -> @location(0) vec4f {
  // Compute atlas scale using screen-space derivatives
  // This tells us how much the atlas UV changes per unit of normalized UV
  let scale = vec2f(
    dpdx(vertex.engine_uv.x) / dpdx(vertex.engine_uv.z),
    dpdy(vertex.engine_uv.y) / dpdy(vertex.engine_uv.w)
  );

  // Derive atlas min (the UV at the bottom-left corner of the sprite in the atlas)
  let atlasMin = vertex.engine_uv.xy - vertex.engine_uv.zw * scale;

  // Tile the normalized UVs using fract() to wrap
  let tiledUv = fract(vertex.engine_uv.zw * vertex.tile_count);

  // Map tiled UVs back to atlas coordinates
  let tiledAtlasUv = atlasMin + tiledUv * scale;

  // Sample from the texture atlas using nearest sampling for pixel-perfect tiling
  let color = textureSample(textureArray, nearestSampler, tiledAtlasUv, vertex.engine_atlasIndex);

  // Reference linearSampler to prevent it from being optimized away
  _ = textureSample(textureArray, linearSampler, tiledAtlasUv, vertex.engine_atlasIndex);

  return color * vertex.engine_tint;
}
  `,
);

// Get the intrinsic size of the sprite
const spriteSize = toodle.assets.getSize("mushroom");

// Define the quad size (fills most of the canvas)
const quadSize = {
  width: toodle.resolution.width,
  height: toodle.resolution.height,
};

// Compute tile count: how many times the sprite fits in the quad
const tileCount = {
  x: quadSize.width / spriteSize.width,
  y: quadSize.height / spriteSize.height,
};

const quad = toodle.Quad("mushroom", {
  size: quadSize,
  shader,
  writeInstance: (array, offset) => {
    // Write tile_count as vec2f
    // offset - 2 accounts for the struct alignment (similar to fill shader)
    array.set([tileCount.x, tileCount.y], offset - 2);
  },
});

async function frame() {
  toodle.startFrame();
  toodle.draw(quad);
  toodle.endFrame();
  requestAnimationFrame(frame);
}

frame();
