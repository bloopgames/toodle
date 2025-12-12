import type { EngineUniform } from "../../coreTypes/EngineUniform";
import type { SceneNode } from "../../scene/SceneNode";
import { assert } from "../../utils/assert";
import type { IBackendShader } from "../IBackendShader";
import type { ITextureAtlas } from "../ITextureAtlas";
import { fragmentShader, vertexShader } from "./glsl/quad.glsl";
import type { WebGLBackend } from "./WebGLBackend";

// Instance data size in floats (must match WGSL shader)
// model (12) + tint (4) + uvOffsetAndScale (4) + cropOffsetAndScale (4) + atlasIndex (1) + padding (3) = 28
const INSTANCE_FLOATS = 28;
const INSTANCE_BYTES = INSTANCE_FLOATS * Float32Array.BYTES_PER_ELEMENT;

/**
 * WebGL 2 implementation of quad shader for instanced rendering.
 */
export class WebGLQuadShader implements IBackendShader {
  readonly label: string;

  #backend: WebGLBackend;
  #atlas: ITextureAtlas;
  #program: WebGLProgram;
  #vao: WebGLVertexArrayObject;
  #instanceBuffer: WebGLBuffer;
  #cpuBuffer: Float32Array;
  #instanceCount: number;
  #instanceIndex = 0;

  // Uniform locations
  #uViewProjection: WebGLUniformLocation | null = null;
  #uResolution: WebGLUniformLocation | null = null;
  #uTextureArray: WebGLUniformLocation | null = null;

  constructor(
    label: string,
    backend: WebGLBackend,
    instanceCount: number,
    userFragmentShader?: string,
    atlasId?: string,
  ) {
    const atlas = backend.getTextureAtlas(atlasId ?? "default");
    if (!atlas) {
      throw new Error(`Atlas "${atlasId ?? "default"}" not found`);
    }
    this.#atlas = atlas;
    this.label = label;
    this.#backend = backend;
    this.#instanceCount = instanceCount;

    const gl = backend.gl;

    // Compile shaders
    const vs = this.#compileShader(gl, gl.VERTEX_SHADER, vertexShader);
    const fs = this.#compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      userFragmentShader ?? fragmentShader,
    );

    // Create program
    const program = gl.createProgram();
    assert(program, "Failed to create WebGL program");
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      throw new Error(`Failed to link shader program: ${info}`);
    }

    this.#program = program;

    // Get uniform locations
    this.#uViewProjection = gl.getUniformLocation(program, "u_viewProjection");
    this.#uResolution = gl.getUniformLocation(program, "u_resolution");
    this.#uTextureArray = gl.getUniformLocation(program, "u_textureArray");

    // Create VAO
    const vao = gl.createVertexArray();
    assert(vao, "Failed to create WebGL VAO");
    this.#vao = vao;

    // Create instance buffer
    const instanceBuffer = gl.createBuffer();
    assert(instanceBuffer, "Failed to create WebGL instance buffer");
    this.#instanceBuffer = instanceBuffer;

    // Allocate CPU buffer
    this.#cpuBuffer = new Float32Array(instanceCount * INSTANCE_FLOATS);

    // Set up VAO
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      instanceCount * INSTANCE_BYTES,
      gl.DYNAMIC_DRAW,
    );

    // Set up instance attributes
    // Each vec4 attribute takes up 16 bytes
    // model0 at location 0
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, INSTANCE_BYTES, 0);
    gl.vertexAttribDivisor(0, 1);

    // model1 at location 1
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, INSTANCE_BYTES, 16);
    gl.vertexAttribDivisor(1, 1);

    // model2 at location 2
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, INSTANCE_BYTES, 32);
    gl.vertexAttribDivisor(2, 1);

    // tint at location 3
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, INSTANCE_BYTES, 48);
    gl.vertexAttribDivisor(3, 1);

    // uvOffsetAndScale at location 4
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 4, gl.FLOAT, false, INSTANCE_BYTES, 64);
    gl.vertexAttribDivisor(4, 1);

    // cropOffsetAndScale at location 5
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 4, gl.FLOAT, false, INSTANCE_BYTES, 80);
    gl.vertexAttribDivisor(5, 1);

    // atlasIndex at location 6 (integer attribute - use vertexAttribIPointer)
    gl.enableVertexAttribArray(6);
    gl.vertexAttribIPointer(6, 1, gl.UNSIGNED_INT, INSTANCE_BYTES, 96);
    gl.vertexAttribDivisor(6, 1);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    // Cleanup shaders (they're linked to the program now)
    gl.deleteShader(vs);
    gl.deleteShader(fs);
  }

  startFrame(uniform: EngineUniform): void {
    this.#instanceIndex = 0;

    const gl = this.#backend.gl;
    gl.useProgram(this.#program);

    // Set uniforms
    if (this.#uViewProjection) {
      // wgpu-matrix mat3 is stored as 12 floats (3 columns × 4 floats with padding)
      // WebGL uniformMatrix3fv expects 9 floats, so extract the relevant values
      const m = uniform.viewProjectionMatrix;
      const mat3x3 = new Float32Array([
        m[0],
        m[1],
        m[2], // column 0
        m[4],
        m[5],
        m[6], // column 1
        m[8],
        m[9],
        m[10], // column 2
      ]);
      gl.uniformMatrix3fv(this.#uViewProjection, false, mat3x3);
    }

    if (this.#uResolution) {
      gl.uniform2f(
        this.#uResolution,
        uniform.resolution.width,
        uniform.resolution.height,
      );
    }

    // Bind texture array to texture unit 0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.#atlas.handle as WebGLTexture);
    if (this.#uTextureArray) {
      gl.uniform1i(this.#uTextureArray, 0);
    }
  }

  processBatch(nodes: SceneNode[]): number {
    const gl = this.#backend.gl;
    const batchStartInstanceIndex = this.#instanceIndex;

    if (nodes.length > this.#instanceCount) {
      throw new Error(
        `ToodleInstanceCap: ${nodes.length} instances enqueued, max is ${this.#instanceCount} for ${this.label} shader`,
      );
    }

    let instanceCount = 0;

    for (let i = 0; i < nodes.length; i++) {
      const instance = nodes[i];
      assert(instance.renderComponent, "instance has no render component");
      const floatOffset =
        (batchStartInstanceIndex + instanceCount) * INSTANCE_FLOATS;

      instanceCount += instance.renderComponent.writeInstance(
        instance,
        this.#cpuBuffer,
        floatOffset,
      );
    }

    // Upload instance data to GPU
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#instanceBuffer);
    const byteOffset = batchStartInstanceIndex * INSTANCE_BYTES;
    const byteLength = instanceCount * INSTANCE_BYTES;

    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      byteOffset,
      this.#cpuBuffer,
      (byteOffset / Float32Array.BYTES_PER_ELEMENT) | 0,
      (byteLength / Float32Array.BYTES_PER_ELEMENT) | 0,
    );

    // Draw instances
    gl.bindVertexArray(this.#vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, instanceCount);
    gl.bindVertexArray(null);

    this.#instanceIndex += instanceCount;
    return 1;
  }

  endFrame(): void {
    // Nothing to do
  }

  #compileShader(
    gl: WebGL2RenderingContext,
    type: number,
    source: string,
  ): WebGLShader {
    const shader = gl.createShader(type);
    assert(shader, "Failed to create WebGL shader");

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      const typeStr = type === gl.VERTEX_SHADER ? "vertex" : "fragment";
      gl.deleteShader(shader);
      throw new Error(`Failed to compile ${typeStr} shader: ${info}`);
    }

    return shader;
  }

  destroy(): void {
    const gl = this.#backend.gl;
    gl.deleteProgram(this.#program);
    gl.deleteVertexArray(this.#vao);
    gl.deleteBuffer(this.#instanceBuffer);
  }
}
