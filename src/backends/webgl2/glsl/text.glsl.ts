/**
 * GLSL ES 3.0 port of the WGSL text shader for MSDF font rendering.
 *
 * Key differences from WebGPU version:
 * - Uses texelFetch() to read from data textures instead of storage buffers
 * - Character metrics stored in RGBA32F texture (8 floats per char = 2 texels)
 * - Per-glyph positions stored in RGBA32F texture (vec4: xy = pos, z = charIndex)
 * - Each TextNode is rendered separately with uniforms (no firstInstance)
 */

export const vertexShader = /*glsl*/ `#version 300 es
precision highp float;

// Engine uniforms
uniform mat3 u_viewProjection;

// Per-text-block uniforms
uniform mat3 u_textTransform;
uniform vec4 u_textColor;
uniform float u_fontSize;
uniform float u_blockWidth;
uniform float u_blockHeight;
uniform float u_lineHeight;

// Character data texture (RGBA32F, 2 texels per character)
// Texel 0: texOffset.xy, texExtent.xy
// Texel 1: size.xy, offset.xy
uniform sampler2D u_charData;

// Text buffer texture (RGBA32F, 1 texel per glyph)
// Each texel: xy = glyph position, z = char index
uniform sampler2D u_textBuffer;

// Outputs to fragment shader
out vec2 v_texcoord;

// Quad vertex positions for a character (matches WGSL)
const vec2 pos[4] = vec2[4](
  vec2(0.0, -1.0),
  vec2(1.0, -1.0),
  vec2(0.0,  0.0),
  vec2(1.0,  0.0)
);

void main() {
  // gl_VertexID gives us 0-3 for the quad vertices
  // gl_InstanceID gives us which glyph we're rendering
  int vertexIndex = gl_VertexID;
  int glyphIndex = gl_InstanceID;

  // Fetch glyph data from text buffer texture
  vec4 glyphData = texelFetch(u_textBuffer, ivec2(glyphIndex, 0), 0);
  vec2 glyphPos = glyphData.xy;
  int charIndex = int(glyphData.z);

  // Fetch character metrics (2 texels per char)
  // Texel 0: texOffset.x, texOffset.y, texExtent.x, texExtent.y
  // Texel 1: size.x, size.y, offset.x, offset.y
  vec4 charData0 = texelFetch(u_charData, ivec2(charIndex * 2, 0), 0);
  vec4 charData1 = texelFetch(u_charData, ivec2(charIndex * 2 + 1, 0), 0);

  vec2 texOffset = charData0.xy;
  vec2 texExtent = charData0.zw;
  vec2 charSize = charData1.xy;
  vec2 charOffset = charData1.zw;

  // Center text vertically; origin is mid-height
  vec2 offset = vec2(0.0, -u_blockHeight / 2.0);

  // Glyph position in ems (quad pos * size + per-char offset)
  vec2 emPos = pos[vertexIndex] * charSize + charOffset + glyphPos - offset;
  vec2 charPos = emPos * (u_fontSize / u_lineHeight);

  // Transform position through model and view-projection matrices
  vec3 worldPos = u_textTransform * vec3(charPos, 1.0);
  vec3 clipPos = u_viewProjection * worldPos;

  gl_Position = vec4(clipPos.xy, 0.0, 1.0);

  // Calculate texture coordinates
  v_texcoord = pos[vertexIndex] * vec2(1.0, -1.0);
  v_texcoord *= texExtent;
  v_texcoord += texOffset;
}
`;

export const fragmentShader = /*glsl*/ `#version 300 es
precision highp float;

// Font texture (MSDF atlas)
uniform sampler2D u_fontTexture;

// Text color
uniform vec4 u_textColor;

// Input from vertex shader
in vec2 v_texcoord;

// Output color
out vec4 fragColor;

// Signed distance function sampling for MSDF font rendering
// Median of three: max(min(r,g), min(max(r,g), b))
float sampleMsdf(vec2 texcoord) {
  vec4 c = texture(u_fontTexture, texcoord);
  return max(min(c.r, c.g), min(max(c.r, c.g), c.b));
}

void main() {
  // pxRange (AKA distanceRange) comes from the msdfgen tool
  float pxRange = 4.0;
  vec2 texSize = vec2(textureSize(u_fontTexture, 0));

  // Anti-aliasing technique by Paul Houx
  // https://github.com/Chlumsky/msdfgen/issues/22#issuecomment-234958005
  float dx = texSize.x * length(vec2(dFdx(v_texcoord.x), dFdy(v_texcoord.x)));
  float dy = texSize.y * length(vec2(dFdx(v_texcoord.y), dFdy(v_texcoord.y)));

  float toPixels = pxRange * inversesqrt(dx * dx + dy * dy);
  float sigDist = sampleMsdf(v_texcoord) - 0.5;
  float pxDist = sigDist * toPixels;

  float edgeWidth = 0.5;
  float alpha = smoothstep(-edgeWidth, edgeWidth, pxDist);

  if (alpha < 0.001) {
    discard;
  }

  fragColor = vec4(u_textColor.rgb, u_textColor.a * alpha);
}
`;
