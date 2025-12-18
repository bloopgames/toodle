// MsdfFont has the cpu data for a font

// The kerning map stores a spare map of character ID pairs with an associated
// X offset that should be applied to the character spacing when the second
// character ID is rendered after the first.
import { warnOnce } from "../utils/error";

export type KerningMap = Map<number, Map<number, number>>;

export interface MsdfChar {
  id: number;
  index: number;
  char: string;
  width: number;
  height: number;
  xoffset: number;
  yoffset: number;
  xadvance: number;
  chnl: number;
  x: number;
  y: number;
  page: number;
  charIndex: number;
}

export class MsdfFont {
  /** the name of the font */
  name: string;
  /** the set of available characters in the font texture */
  charset: string[];
  charCount: number;
  lineHeight: number;

  /** a binary buffer of character data for loading into the gpu */
  charBuffer: Float32Array;

  #kernings: KerningMap;
  #chars: Map<number, MsdfChar>;
  #fallbackCharCode?: number;

  constructor(
    public id: string,
    public json: MsdfFontJson,
    public imageBitmap: ImageBitmap,
  ) {
    const charArray = Object.values(json.chars);
    this.charCount = charArray.length;
    this.lineHeight = json.common.lineHeight;
    this.charset = json.info.charset;
    this.name = json.info.face;

    this.#kernings = new Map();
    if (json.kernings) {
      for (const kearning of json.kernings) {
        let charKerning = this.#kernings.get(kearning.first);
        if (!charKerning) {
          charKerning = new Map<number, number>();
          this.#kernings.set(kearning.first, charKerning);
        }
        charKerning.set(kearning.second, kearning.amount);
      }
    }

    this.#chars = new Map<number, MsdfChar>();
    const charCount = Object.values(json.chars).length;
    this.charBuffer = new Float32Array(charCount * 8);
    let offset = 0;
    const u = 1 / json.common.scaleW;
    const v = 1 / json.common.scaleH;

    for (const [i, char] of json.chars.entries()) {
      this.#chars.set(char.id, char);
      this.#chars.get(char.id)!.charIndex = i;
      this.charBuffer[offset] = char.x * u; // texOffset.x
      this.charBuffer[offset + 1] = char.y * v; // texOffset.y
      this.charBuffer[offset + 2] = char.width * u; // texExtent.x
      this.charBuffer[offset + 3] = char.height * v; // texExtent.y
      this.charBuffer[offset + 4] = char.width; // size.x
      this.charBuffer[offset + 5] = char.height; // size.y
      this.charBuffer[offset + 6] = char.xoffset; // offset.x
      this.charBuffer[offset + 7] = -char.yoffset; // offset.y
      offset += 8;
    }
  }

  getChar(charCode: number): MsdfChar {
    const char = this.#chars.get(charCode)!;
    if (!char) {
      const fallbackCharacter = this.#chars.get(
        this.#fallbackCharCode ?? this.#chars.keys().toArray()[0],
      )!;
      warnOnce(
        `unknown_char_${this.name}`,
        `Couldn't find character ${charCode} in characters for font ${this.name} -- defaulting to first available character "${fallbackCharacter.char}"`,
      );
      return fallbackCharacter;
    }
    return char;
  }

  // Gets the distance in pixels a line should advance for a given character code. If the upcoming
  // character code is given any kerning between the two characters will be taken into account.
  getXAdvance(charCode: number, nextCharCode = -1): number {
    const char = this.getChar(charCode);
    if (nextCharCode >= 0) {
      const kerning = this.#kernings.get(charCode);
      if (kerning) {
        return char.xadvance + (kerning.get(nextCharCode) ?? 0);
      }
    }
    return char.xadvance;
  }

  static async create(id: string, fontJsonUrl: URL): Promise<MsdfFont> {
    const response = await fetch(fontJsonUrl);
    const json = (await response.json()) as MsdfFontJson;

    const i = fontJsonUrl.href.lastIndexOf("/");
    const baseUrl = i !== -1 ? fontJsonUrl.href.substring(0, i + 1) : undefined;

    if (json.pages.length < 1) {
      throw new Error(
        `Can't create an msdf font without a reference to the page url in the json`,
      );
    }
    if (json.pages.length > 1) {
      throw new Error(`Can't create an msdf font with more than one page`);
    }

    const textureUrl = baseUrl + json.pages[0];
    const textureResponse = await fetch(textureUrl);
    const bitmap = await createImageBitmap(await textureResponse.blob());

    return new MsdfFont(id, json, bitmap);
  }

  set fallbackCharacter(character: string) {
    const charCode: number = character.charCodeAt(0);
    if (this.#chars.has(charCode)) {
      this.#fallbackCharCode = charCode;
    } else {
      const fallbackCode = this.#chars.keys().toArray()[0];
      console.warn(
        `${character} character does not exist in font ${this.name} defaulting to "${this.#chars.get(fallbackCode)?.char}".`,
      );
      this.#fallbackCharCode = fallbackCode;
    }
  }
}

type MsdfFontJson = {
  pages: string[];
  chars: MsdfChar[];
  info: {
    face: string;
    size: string;
    bold: number;
    italic: number;
    charset: string[];
    unicode: number;
    stretchH: number;
    smooth: number;
    aa: number;
    padding: number[];
    spacing: number[];
  };
  common: {
    lineHeight: number;
    base: number;
    scaleW: number;
    scaleH: number;
    pages: number;
    packed: number;
    alphaChnl: number;
    redChnl: number;
    greenChnl: number;
    blueChnl: number;
  };
  distanceField: { fieldType: string; distanceRange: number };
  kernings: Kerning[];
};

type Kerning = { first: number; second: number; amount: number };

export enum WhitespaceKeyCodes {
  HorizontalTab = 9,
  Newline = 10,
  CarriageReturn = 13,
  Space = 32,
}
