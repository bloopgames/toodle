import type { MsdfFont } from "../../text/MsdfFont";
import { assert } from "../../utils/assert";

/**
 * Manages WebGL font resources for MSDF text rendering.
 *
 * Creates and manages:
 * - Font atlas texture (MSDF image)
 * - Character data texture (metrics as RGBA32F)
 * - Text buffer texture (per-glyph positions)
 */
export class WebGLFontPipeline {
  readonly font: MsdfFont;
  readonly fontTexture: WebGLTexture;
  readonly charDataTexture: WebGLTexture;
  readonly textBufferTexture: WebGLTexture;
  readonly maxCharCount: number;
  readonly lineHeight: number;

  #gl: WebGL2RenderingContext;

  private constructor(
    gl: WebGL2RenderingContext,
    font: MsdfFont,
    fontTexture: WebGLTexture,
    charDataTexture: WebGLTexture,
    textBufferTexture: WebGLTexture,
    maxCharCount: number,
  ) {
    this.#gl = gl;
    this.font = font;
    this.fontTexture = fontTexture;
    this.charDataTexture = charDataTexture;
    this.textBufferTexture = textBufferTexture;
    this.maxCharCount = maxCharCount;
    this.lineHeight = font.lineHeight;
  }

  static create(
    gl: WebGL2RenderingContext,
    font: MsdfFont,
    maxCharCount: number,
  ): WebGLFontPipeline {
    // Create font atlas texture
    const fontTexture = gl.createTexture();
    assert(fontTexture, "Failed to create font texture");

    gl.bindTexture(gl.TEXTURE_2D, fontTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Upload the MSDF font image
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      font.imageBitmap,
    );

    // Create character data texture (RGBA32F)
    // Each character needs 8 floats = 2 RGBA texels
    // charBuffer layout per char: texOffset.x, texOffset.y, texExtent.x, texExtent.y, size.x, size.y, offset.x, offset.y
    const charDataTexture = gl.createTexture();
    assert(charDataTexture, "Failed to create char data texture");

    gl.bindTexture(gl.TEXTURE_2D, charDataTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Convert charBuffer to texture format (2 texels per character)
    const charCount = font.charCount;
    const charTextureWidth = charCount * 2; // 2 texels per char
    const charTextureData = new Float32Array(charTextureWidth * 4); // 4 components per texel

    for (let i = 0; i < charCount; i++) {
      const srcOffset = i * 8;
      const dstOffset0 = i * 2 * 4; // First texel for this char
      const dstOffset1 = (i * 2 + 1) * 4; // Second texel for this char

      // Texel 0: texOffset.xy, texExtent.xy
      charTextureData[dstOffset0] = font.charBuffer[srcOffset]; // texOffset.x
      charTextureData[dstOffset0 + 1] = font.charBuffer[srcOffset + 1]; // texOffset.y
      charTextureData[dstOffset0 + 2] = font.charBuffer[srcOffset + 2]; // texExtent.x
      charTextureData[dstOffset0 + 3] = font.charBuffer[srcOffset + 3]; // texExtent.y

      // Texel 1: size.xy, offset.xy
      charTextureData[dstOffset1] = font.charBuffer[srcOffset + 4]; // size.x
      charTextureData[dstOffset1 + 1] = font.charBuffer[srcOffset + 5]; // size.y
      charTextureData[dstOffset1 + 2] = font.charBuffer[srcOffset + 6]; // offset.x
      charTextureData[dstOffset1 + 3] = font.charBuffer[srcOffset + 7]; // offset.y
    }

    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA32F,
      charTextureWidth,
      1,
      0,
      gl.RGBA,
      gl.FLOAT,
      charTextureData,
    );

    // Create text buffer texture (RGBA32F)
    // Each glyph needs 1 texel: xy = position, z = charIndex, w = unused
    const textBufferTexture = gl.createTexture();
    assert(textBufferTexture, "Failed to create text buffer texture");

    gl.bindTexture(gl.TEXTURE_2D, textBufferTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Allocate texture storage (will be filled per-frame)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA32F,
      maxCharCount,
      1,
      0,
      gl.RGBA,
      gl.FLOAT,
      null,
    );

    gl.bindTexture(gl.TEXTURE_2D, null);

    return new WebGLFontPipeline(
      gl,
      font,
      fontTexture,
      charDataTexture,
      textBufferTexture,
      maxCharCount,
    );
  }

  /**
   * Update the text buffer texture with glyph data.
   */
  updateTextBuffer(data: Float32Array, glyphCount: number): void {
    const gl = this.#gl;
    gl.bindTexture(gl.TEXTURE_2D, this.textBufferTexture);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      glyphCount,
      1,
      gl.RGBA,
      gl.FLOAT,
      data,
    );
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  destroy(): void {
    const gl = this.#gl;
    gl.deleteTexture(this.fontTexture);
    gl.deleteTexture(this.charDataTexture);
    gl.deleteTexture(this.textBufferTexture);
  }
}
