import type { MsdfFont } from "../text/MsdfFont";
import type { IBackendShader } from "./IBackendShader";

/**
 * Backend-agnostic text shader interface.
 *
 * Extends IBackendShader with text-specific properties.
 * Each backend provides its own implementation.
 */
export interface ITextShader extends IBackendShader {
  /** The font used by this text shader */
  readonly font: MsdfFont;
  /** Maximum number of characters that can be rendered per text node */
  readonly maxCharCount: number;
}
