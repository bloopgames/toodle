export const vertexShader = /*glsl*/ `#version 300 es
precision highp float;

// Engine uniforms
uniform mat3 u_viewProjection;
uniform vec2 u_resolution;

// Instance data attributes
// location 0-2 are the model matrix for this instanced quad (mat3 as 3 vec3s)
layout(location = 0) in vec4 a_model0;
layout(location = 1) in vec4 a_model1;
layout(location = 2) in vec4 a_model2;
// location 3 is the tint color
layout(location = 3) in vec4 a_tint;
// location 4 is the uv offset and scale
layout(location = 4) in vec4 a_uvOffsetAndScale;
// location 5 is the crop offset and scale
layout(location = 5) in vec4 a_cropOffsetAndScale;
// location 6 is the atlas index (integer attribute)
layout(location = 6) in uint a_atlasIndex;

// Outputs to fragment shader
out vec4 v_uv; // xy = atlas uv, zw = original uv
out vec4 v_tint;
flat out int v_atlasIndex;

// Lookup tables for unit quad positions and UVs
const vec2 posLookup[4] = vec2[4](
  vec2(-0.5, 0.5),
  vec2(-0.5, -0.5),
  vec2(0.5, 0.5),
  vec2(0.5, -0.5)
);

const vec2 uvLookup[4] = vec2[4](
  vec2(0.0, 0.0),
  vec2(0.0, 1.0),
  vec2(1.0, 0.0),
  vec2(1.0, 1.0)
);

void main() {
  // Reconstruct model matrix from instance data
  mat3 modelMatrix = mat3(a_model0.xyz, a_model1.xyz, a_model2.xyz);

  // Transform vertex position
  vec2 localPosition = posLookup[gl_VertexID];
  vec2 cropOffset = a_cropOffsetAndScale.xy;
  vec2 cropScale = a_cropOffsetAndScale.zw;
  vec2 croppedPosition = localPosition * cropScale + cropOffset;
  vec3 worldPosition = modelMatrix * vec3(croppedPosition, 1.0);
  vec3 clipPosition = u_viewProjection * worldPosition;
  gl_Position = vec4(clipPosition.xy, 0.0, 1.0);

  // Set UV coordinates
  vec2 originalUv = uvLookup[gl_VertexID];
  vec2 atlasUv = originalUv * a_uvOffsetAndScale.zw * cropScale + a_uvOffsetAndScale.xy;
  v_uv = vec4(atlasUv, originalUv);

  // Pass through tint and atlas index
  v_tint = a_tint;
  v_atlasIndex = int(a_atlasIndex);
}

`;

/**
 * Default fragment shader for WebGL2 quad rendering.
 * Custom fragment shaders must follow the same contract:
 * - Required uniforms: u_resolution, u_textureArray
 * - Required inputs: v_uv (vec4), v_tint (vec4), v_atlasIndex (flat int)
 * - Required output: fragColor (vec4)
 */
export const fragmentShader = /*glsl*/ `#version 300 es
precision highp float;
precision highp sampler2DArray;

// Engine uniforms
uniform vec2 u_resolution;

// Texture array sampler
uniform sampler2DArray u_textureArray;

// Inputs from vertex shader
in vec4 v_uv; // xy = atlas uv, zw = original uv
in vec4 v_tint;
flat in int v_atlasIndex;

// Output color
out vec4 fragColor;

void main() {
  vec2 atlasUv = v_uv.xy;
  vec2 originalUv = v_uv.zw;

  if (v_atlasIndex == 1000) {
    // Rectangle - return solid color
    fragColor = vec4(1.0, 1.0, 1.0, 1.0) * v_tint;
  } else if (v_atlasIndex == 1001) {
    // Circle
    float edgeWidth = 4.0 / max(u_resolution.x, u_resolution.y);
    float centerDistance = 2.0 * distance(vec2(0.5, 0.5), originalUv);
    float alpha = 1.0 - smoothstep(1.0 - edgeWidth, 1.0 + edgeWidth, centerDistance);
    fragColor = vec4(v_tint.rgb, alpha * v_tint.a);
  } else {
    // Texture - sample from texture array
    vec4 color = texture(u_textureArray, vec3(atlasUv, float(v_atlasIndex)));
    fragColor = color * v_tint;
  }
}
`;

/** Alias for users who want to extend the default shader */
export const defaultFragmentShader = fragmentShader;
