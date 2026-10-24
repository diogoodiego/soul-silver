import { readAscii, readU16, readU32 } from "../binary.ts";

// NCGR (character graphics) and NCLR (palette) files, the 2D graphics of the DS.
// See specs/007-sprite-atlas/research.md R1.

export class GraphicsFormatError extends Error {
  override name = "GraphicsFormatError";
}

export interface Ncgr {
  /** Size in 8x8 tiles. */
  tilesWide: number;
  tilesHigh: number;
  bitsPerPixel: 4 | 8;
  /** True when pixels are stored row by row; false when stored tile by tile. */
  scanned: boolean;
  /** Pixel bytes, as stored. */
  data: Uint8Array;
}

function block(bytes: Uint8Array, magic: string, fileMagic: string): number {
  if (bytes.length < 0x18 || readAscii(bytes, 0, 4) !== fileMagic) throw new GraphicsFormatError(`Not a ${fileMagic} file`);
  if (readAscii(bytes, 0x10, 4) !== magic) throw new GraphicsFormatError(`${fileMagic} without a ${magic} block`);
  return 0x10;
}

export function readNcgr(bytes: Uint8Array): Ncgr {
  const at = block(bytes, "RAHC", "RGCN");
  const tilesHigh = readU16(bytes, at + 8);
  const tilesWide = readU16(bytes, at + 10);
  const depth = readU32(bytes, at + 12);
  if (depth !== 3 && depth !== 4) throw new GraphicsFormatError(`Unsupported NCGR depth ${depth}`);
  const scanned = readU32(bytes, at + 0x14) === 1;
  const size = readU32(bytes, at + 0x18);
  const start = at + 8 + readU32(bytes, at + 0x1c);
  if (start + size > bytes.length) throw new GraphicsFormatError("NCGR pixel data exceeds the file");
  return { tilesWide, tilesHigh, bitsPerPixel: depth === 3 ? 4 : 8, scanned, data: bytes.subarray(start, start + size) };
}

/** Colors as BGR555 words. */
export function readNclr(bytes: Uint8Array): number[] {
  const at = block(bytes, "TTLP", "RLCN");
  const size = readU32(bytes, at + 0x10);
  const start = at + 8 + readU32(bytes, at + 0x14);
  const end = Math.min(start + size, bytes.length);
  const colors: number[] = [];
  for (let offset = start; offset + 2 <= end; offset += 2) colors.push(readU16(bytes, offset));
  return colors;
}

/**
 * Gen 4 Pokémon sprites keep their pixels XOR-ed with a linear congruential stream, seeded by
 * the first 16-bit word (verified on the ROM, research.md R0).
 */
export function decryptPokemonPixels(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length);
  let key = data[0]! | (data[1]! << 8);
  for (let i = 0; i + 1 < data.length; i += 2) {
    const word = (data[i]! | (data[i + 1]! << 8)) ^ (key & 0xffff);
    out[i] = word & 0xff;
    out[i + 1] = word >> 8;
    key = (Math.imul(key, 0x41c64e6d) + 0x6073) >>> 0;
  }
  return out;
}

/**
 * Trainer sprites use the same stream, but it starts at the end: the seed is the last 16-bit
 * word and the words are decoded backwards (verified on the ROM, research.md R0).
 */
export function decryptTrainerPixels(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length);
  let key = data[data.length - 2]! | (data[data.length - 1]! << 8);
  for (let i = data.length - 2; i >= 0; i -= 2) {
    const word = (data[i]! | (data[i + 1]! << 8)) ^ (key & 0xffff);
    out[i] = word & 0xff;
    out[i + 1] = word >> 8;
    key = (Math.imul(key, 0x41c64e6d) + 0x6073) >>> 0;
  }
  return out;
}
