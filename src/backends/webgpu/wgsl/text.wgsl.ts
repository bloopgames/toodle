export default /*wgsl*/ `
// Adapted from: https://webgpu.github.io/webgpu-samples/?sample=textRenderingMsdf

// Quad vertex positions for a character
const pos = array(
  vec2f(0, -1),
  vec2f(1, -1),
  vec2f(0,  0),
  vec2f(1,  0),
);

// Debug colors for visualization
const debugColors = array(
  vec4f(1, 0, 0, 1),
  vec4f(0, 1, 0, 1),
  vec4f(0, 0, 1, 1),
  vec4f(1, 1, 1, 1),
);

// Vertex input from GPU
struct VertexInput {
  @builtin(vertex_index) vertex: u32,
  @builtin(instance_index) instance: u32,
};

// Output from vertex shader to fragment shader
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) texcoord: vec2f,
  @location(1) debugColor: vec4f,
  @location(2) @interpolate(flat) instanceIndex: u32,
};

// Metadata for a single character glyph
struct Char {
  texOffset: vec2f, // Offset to top-left in MSDF texture (pixels)
  texExtent: vec2f, // Size in texture (pixels)
  size: vec2f,      // Glyph size in ems
  offset: vec2f,    // Position offset in ems
};

// Metadata for a text block
struct TextBlockDescriptor {
  transform: mat3x3f,   // Text transform matrix (model matrix)
  color: vec4f,         // Text color
  fontSize: f32,        // Font size
  blockWidth: f32,      // Total width of text block
  blockHeight: f32,     // Total height of text block
  bufferPosition: f32   // Index and length in textBuffer
};

// Font bindings
@group(0) @binding(0) var fontTexture: texture_2d<f32>;
@group(0) @binding(1) var fontSampler: sampler;
@group(0) @binding(2) var<storage> chars: array<Char>;
@group(0) @binding(3) var<uniform> fontData: vec4f; // Contains line height (x)

// Text bindings
@group(1) @binding(0) var<storage> texts: array<TextBlockDescriptor>;
@group(1) @binding(1) var<storage> textBuffer: array<vec4f>; // Each vec4: xy = glyph pos, z = char index

// Global uniforms
@group(2) @binding(0) var<uniform> viewProjectionMatrix: mat3x3f;

// Vertex shader
@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  // Because the instance index is used for character indexing, we are
  // overloading the vertex index to store the instance of the text metadata.
  //
  // I.e...
  // Vertex 0-4 = Instance 0, Vertex 0-4
  // Vertex 4-8 = Instance 1, Vertex 0-4
  // Vertex 8-12 = Instance 2, Vertex 0-4
  let vertexIndex = input.vertex % 4;
  let textIndex = input.vertex / 4;

  let text = texts[textIndex];
  let textElement = textBuffer[u32(text.bufferPosition) + input.instance];
  let char = chars[u32(textElement.z)];

  let lineHeight = fontData.x;
  let textWidth = text.blockWidth;
  let textHeight = text.blockHeight;

  // Center text vertically; origin is mid-height
  let offset = vec2f(0, -textHeight / 2);

  // Glyph position in ems (quad pos * size + per-char offset)
  let emPos = pos[vertexIndex] * char.size + char.offset + textElement.xy - offset;
  let charPos = emPos * (text.fontSize / lineHeight);

  var output: VertexOutput;
  let transformedPosition = viewProjectionMatrix * text.transform * vec3f(charPos, 1);

  output.position = vec4f(transformedPosition, 1);
  output.texcoord = pos[vertexIndex] * vec2f(1, -1);
  output.texcoord *= char.texExtent;
  output.texcoord += char.texOffset;
  output.debugColor = debugColors[vertexIndex];
  output.instanceIndex = textIndex;
  return output;

  // To debug - hardcode quad in bottom right quarter of the screen:
  // output.position = vec4f(pos[input.vertex], 0, 1);
}

// Signed distance function sampling for MSDF font rendering
fn sampleMsdf(texcoord: vec2f) -> f32 {
  let c = textureSample(fontTexture, fontSampler, texcoord);
  return max(min(c.r, c.g), min(max(c.r, c.g), c.b));
}

// Fragment shader
// Anti-aliasing technique by Paul Houx
// more details here:
// https://github.com/Chlumsky/msdfgen/issues/22#issuecomment-234958005
@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let text = texts[input.instanceIndex];

  // pxRange (AKA distanceRange) comes from the msdfgen tool.
  let pxRange = 4.0;
  let texSize = vec2f(textureDimensions(fontTexture, 0));

  let dx = texSize.x * length(vec2f(dpdxFine(input.texcoord.x), dpdyFine(input.texcoord.x)));
  let dy = texSize.y * length(vec2f(dpdxFine(input.texcoord.y), dpdyFine(input.texcoord.y)));

  let toPixels = pxRange * inverseSqrt(dx * dx + dy * dy);
  let sigDist = sampleMsdf(input.texcoord) - 0.5;
  let pxDist = sigDist * toPixels;

  let edgeWidth = 0.5;
  let alpha = smoothstep(-edgeWidth, edgeWidth, pxDist);

  if (alpha < 0.001) {
    discard;
  }

  let msdfColor = vec4f(text.color.rgb, text.color.a * alpha);
  return msdfColor;

  // Debug options:
  // return text.color;
  // return input.debugColor;
  // return vec4f(1, 0, 1, 1); // hardcoded magenta
  // return textureSample(fontTexture, fontSampler, input.texcoord);
}
`;
