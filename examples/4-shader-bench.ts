import { Toodle } from "../src/Toodle";
import { Limits } from "../src/limits";
import { createCanvas } from "./util";

const colors = {
  AQUAMARINE: [0.498039, 1, 0.831373, 1],
  LIGHT_CORAL: [1, 0.5, 0.313726, 1],
  LIGHT_SALMON: [1, 0.627451, 0.478431, 1],
  LIGHT_SEA_GREEN: [0.533333, 1, 0.980392, 1],
  LIGHT_SKY_BLUE: [0.529412, 0.807843, 0.980392, 1],
  LIGHT_STEEL_BLUE: [0.596078, 0.690196, 0.803922, 1],
  CORNFLOWER_BLUE: [0.392157, 0.584314, 0.929412, 1],
  HOT_PINK: [1, 0.411765, 0.705882, 1],
  REBECCA_PURPLE: [0.4, 0.2, 0.6, 1],
};

const canvas = createCanvas(window.innerWidth, window.innerHeight);

const toodle = await Toodle.attach(canvas, { filter: "nearest" });

await toodle.assets.loadTexture(
  "mario",
  new URL("/img/MarioIdle.png", window.location.href),
);
await toodle.assets.loadTexture(
  "mushroom",
  new URL("/img/Mushroom.png", window.location.href),
);

toodle.clearColor = { r: 0.25, g: 0.25, b: 0.25, a: 1 };

const whiteFlash = toodle.QuadShader(
  "color flash",
  toodle.limits.instanceCount,
  /*wgsl*/ `
  struct Flash {
    color: vec4f,
    intensity: f32
  }

  @fragment
  fn fragment(vertex: VertexOutput) -> @location(0) vec4<f32> {
    let color = default_fragment_shader(vertex, nearestSampler);
    let flashColor = mix(color.rgb, vertex.flash_color.rgb, vertex.flash_intensity);
    return vec4f(flashColor, color.a);
  }
`,
);

const outline = toodle.QuadShader(
  "pixel outline",
  toodle.limits.instanceCount,
  /*wgsl*/ `
  struct Outline {
    color: vec4f,
    size: f32
  }

  @vertex
  fn vert(
    @builtin(vertex_index) VertexIndex: u32,
    @builtin(instance_index) InstanceIndex: u32,
    instance: InstanceData,
  ) -> VertexOutput {
    let outlineScale = 0.1;

    var vertex = default_vertex_shader(VertexIndex, InstanceIndex,instance);
    let scaledPosition = vertex.engine_clip_position * (1.0 + outlineScale);
    let uv = (vertex.engine_uv.zw - 0.5) * (1.0 + outlineScale) + 0.5;
    let s_atlas_uv = uv * instance.uvOffsetAndScale.zw + instance.uvOffsetAndScale.xy;
    let s_original_uv = vertex.engine_uv.zw;
    vertex.engine_uv = vec4f(s_atlas_uv, s_original_uv);
    vertex.engine_clip_position = scaledPosition;
    return vertex;
  }

  @fragment
  fn frag(vertex: VertexOutput) -> @location(0) vec4<f32> {
    let color = sampleTexture(vertex.engine_uv.xy, vertex.engine_atlasIndex);
    let texSize = vec2f(textureDimensions(textureArray).xy);
    let edge = vertex.outline_size / texSize.x;  // Use outline.size as a configurable parameter

    let center = sampleTexture(vertex.engine_uv.xy, vertex.engine_atlasIndex);
    let left = sampleTexture(vertex.engine_uv.xy + vec2f(-edge, 0.), vertex.engine_atlasIndex);
    let right = sampleTexture(vertex.engine_uv.xy + vec2f(edge, 0.), vertex.engine_atlasIndex);
    let up = sampleTexture(vertex.engine_uv.xy + vec2f(0., edge), vertex.engine_atlasIndex);
    let down = sampleTexture(vertex.engine_uv.xy + vec2f(0., -edge), vertex.engine_atlasIndex);

    // need this for bind group to be valid
    if (false) {
      return default_fragment_shader(vertex, nearestSampler);
    }

    if (center.a == 0.0 && (right.a > 0.0 || left.a > 0.0 || up.a > 0.0 || down.a > 0.0)) {
      return vertex.outline_color;
    }
    return center;
  }

  fn sampleTexture(uv: vec2<f32>, atlasIndex: u32) -> vec4<f32> {
    let inBounds = step(0.0, uv.x) * step(0.0, uv.y) *
                   step(uv.x, 1.0) * step(uv.y, 1.0);
    return textureSample(textureArray, nearestSampler, uv, atlasIndex) * inBounds;
  }
`,
);

const world = toodle.Node();

const qs = new URLSearchParams(window.location.search);

let frameNumber = 0;

for (let i = 0; i < toodle.limits.instanceCount; i++) {
  const color = getRandomColor();
  const isFlash = Math.random() < 0.5;

  world.add(
    toodle.Quad("mushroom", {
      position: {
        x: Math.random() * 5000 - 2500,
        y: Math.random() * 5000 - 2500,
      },
      size: { width: 100, height: 100 },
      shader: isFlash ? whiteFlash : outline,
      writeInstance(array, offset) {
        array.set(color, offset);
        if (isFlash) {
          array[offset + 4] = 0.5 + Math.sin(frameNumber / 50) * 0.5;
        } else {
          array[offset + 3] = 0.5 + Math.sin(frameNumber / 50) * 0.5;
          array[offset + 4] = 1;
        }
      },
    }),
  );
}

function frame() {
  toodle.startFrame();

  if (!qs.has("skipWorld")) {
    toodle.draw(world);
  }

  toodle.endFrame();
  frameNumber++;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.addEventListener("keydown", (e) => {
  switch (e.key) {
    case "i":
      toodle.camera.y += 10 / toodle.camera.zoom;
      break;
    case "k":
      toodle.camera.y -= 10 / toodle.camera.zoom;
      break;
    case "j":
      toodle.camera.x -= 10 / toodle.camera.zoom;
      break;
    case "l":
      toodle.camera.x += 10 / toodle.camera.zoom;
      break;
    case "u":
      toodle.camera.rotation -= 1;
      break;
    case "o":
      toodle.camera.rotation += 1;
      break;
    case "-":
      toodle.camera.zoom -= 0.1 * toodle.camera.zoom;
      break;
    case "=":
      toodle.camera.zoom += 0.1 * toodle.camera.zoom;
      break;
  }
});

function getRandomColor(): number[] {
  const colorKeys = Object.keys(colors);
  const randomIndex = Math.floor(Math.random() * colorKeys.length);
  return colors[colorKeys[randomIndex] as keyof typeof colors];
}
