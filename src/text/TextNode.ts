import type { Color } from "../coreTypes/Color";
import { type NodeOptions, SceneNode } from "../scene/SceneNode";
import type { MsdfFont } from "./MsdfFont";
import { measureText } from "./shaping";
import type { TextFormatting } from "./TextFormatting";
import type { TextShader } from "./TextShader";

export const DEFAULT_FONT_SIZE = 14;

export class TextNode extends SceneNode {
  #text: string;
  #formatting: TextFormatting;
  #font: MsdfFont;

  constructor(shader: TextShader, text: string, opts: TextOptions = {}) {
    const { width, height } = measureText(shader.font, text, opts.wordWrap);

    if (text.length > shader.maxCharCount) {
      throw new Error(
        `Text: ${text} exceeds ${shader.maxCharCount} characters. Try using fewer characters or increase the limit in Toodle.attach.`,
      );
    }

    const em2px = shader.font.lineHeight / (opts.fontSize ?? DEFAULT_FONT_SIZE);

    if (!opts.shrinkToFit && !opts.idealSize) {
      opts.idealSize = { width: width / em2px, height: height / em2px };
    }

    super({
      ...opts,
      render: {
        shader,
        writeInstance: (_node, _array, _offset) => {
          throw new Error(
            "not implemented - needs access to text uniform buffer, dimensions and a model matrix",
          );
        },
      },
    });

    this.#font = shader.font;
    this.#text = text;
    this.#formatting = opts;
  }

  get text() {
    return this.#text;
  }

  get formatting() {
    return this.#formatting;
  }

  get font() {
    return this.#font;
  }

  set text(text: string) {
    if (!text) {
      throw new Error("text cannot be empty");
    }
    this.#text = text;
    this.setDirty();
  }

  get tint() {
    return this.#formatting.color || { r: 1, g: 1, b: 1, a: 1 };
  }

  set tint(tint: Color) {
    this.#formatting.color = tint;
    this.setDirty();
  }

  set formatting(formatting: TextFormatting) {
    this.#formatting = formatting;
    this.setDirty();
  }
}

export type TextOptions = Omit<NodeOptions, "render"> & TextFormatting;
