import { readU16, readU32 } from "../binary.ts";
import { readDictionary } from "./nitro.ts";
import type { RgbaImage } from "./png.ts";

// TEX0 blocks (inside NSBMD models and BTX0 texture sets). Only the formats the ROM uses
// are decoded (research.md R0): A3I5, 4, 16 and 256 colors, A5I3.

export class TextureFormatError extends Error {
  override name = "TextureFormatError";
}

export interface Texture {
  name: string;
  format: number;
  width: number;
  height: number;
  color0Transparent: boolean;
  /** Texel bytes, from the texture start to the end of the block. */
  texels: Uint8Array;
}

export interface TextureSet {
  textures: Map<string, Texture>;
  /** Palette name -> BGR555 data, from the palette start to the end of the block. */
  palettes: Map<string, Uint8Array>;
}

const BITS: Record<number, number> = { 1: 8, 2: 2, 3: 4, 4: 8, 6: 8 };

export function readTextureSet(bytes: Uint8Array, tex0: number): TextureSet {
  const end = tex0 + readU32(bytes, tex0 + 4);
  const texData = tex0 + readU32(bytes, tex0 + 0x14);
  const palData = tex0 + readU32(bytes, tex0 + 0x38);

  const textures = new Map<string, Texture>();
  for (const entry of readDictionary(bytes, tex0 + readU16(bytes, tex0 + 0x0e))) {
    const params = readU32(entry.data, 0);
    textures.set(entry.name, {
      name: entry.name,
      format: (params >> 26) & 7,
      width: 8 << ((params >> 20) & 7),
      height: 8 << ((params >> 23) & 7),
      color0Transparent: ((params >> 29) & 1) === 1,
      texels: bytes.subarray(texData + (params & 0xffff) * 8, end),
    });
  }
  const palettes = new Map<string, Uint8Array>();
  for (const entry of readDictionary(bytes, tex0 + readU32(bytes, tex0 + 0x34))) {
    palettes.set(entry.name, bytes.subarray(palData + readU16(entry.data, 0) * 8, end));
  }
  return { textures, palettes };
}

const five = (c: number) => (c << 3) | (c >> 2);
const three = (a: number) => (a << 5) | (a << 2) | (a >> 1);

export function decodeTexture(texture: Texture, palette: Uint8Array | undefined): RgbaImage {
  const { format, width, height, texels } = texture;
  const bits = BITS[format];
  if (bits === undefined) throw new TextureFormatError(`Texture ${texture.name}: format ${format} is not supported`);
  if (!palette) throw new TextureFormatError(`Texture ${texture.name}: no palette`);
  const count = width * height;
  if ((count * bits) / 8 > texels.length) throw new TextureFormatError(`Texture ${texture.name}: texels run past the block`);

  const data = new Uint8Array(count * 4);
  const mask = (1 << bits) - 1;
  for (let i = 0; i < count; i++) {
    const value = (texels[(i * bits) >> 3]! >> ((i * bits) & 7)) & mask;
    let index = value;
    let alpha = 255;
    if (format === 1) [index, alpha] = [value & 0x1f, three(value >> 5)];
    else if (format === 6) [index, alpha] = [value & 0x07, five(value >> 3)];
    else if (index === 0 && texture.color0Transparent) alpha = 0;
    if (index * 2 + 1 >= palette.length) throw new TextureFormatError(`Texture ${texture.name}: color ${index} is outside the palette`);
    const color = palette[index * 2]! | (palette[index * 2 + 1]! << 8);
    data.set([five(color & 0x1f), five((color >> 5) & 0x1f), five((color >> 10) & 0x1f), alpha], i * 4);
  }
  return { width, height, data };
}
