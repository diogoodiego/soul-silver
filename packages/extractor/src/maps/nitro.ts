import { readAscii, readU16, readU32 } from "../binary.ts";

// Nitro containers (BMD0, BTX0) and their dictionaries; layout confirmed on the ROM in
// specs/006-map-prerender/research.md R0.

export class NitroFormatError extends Error {
  override name = "NitroFormatError";
}

/** Block magic -> offset of the block in the file. */
export function readNitroBlocks(bytes: Uint8Array, magic: string): Map<string, number> {
  if (bytes.length < 16 || readAscii(bytes, 0, 4) !== magic) throw new NitroFormatError(`Missing ${magic} magic`);
  const blocks = new Map<string, number>();
  const count = readU16(bytes, 14);
  for (let i = 0; i < count; i++) {
    const offset = readU32(bytes, 16 + i * 4);
    blocks.set(readAscii(bytes, offset, 4), offset);
  }
  return blocks;
}

export interface DictionaryEntry {
  name: string;
  /** View of the entry's fixed-size data. */
  data: Uint8Array;
}

/** Reads the dictionary at `offset`; the patricia tree is skipped, entries keep file order. */
export function readDictionary(bytes: Uint8Array, offset: number): DictionaryEntry[] {
  const count = bytes[offset + 1] ?? 0;
  const info = offset + readU16(bytes, offset + 6);
  const entrySize = readU16(bytes, info);
  const names = info + readU16(bytes, info + 2);
  readAscii(bytes, names, count * 16);
  const entries: DictionaryEntry[] = [];
  for (let i = 0; i < count; i++) {
    const start = info + 4 + i * entrySize;
    entries.push({ name: readAscii(bytes, names + i * 16, 16), data: bytes.subarray(start, start + entrySize) });
  }
  return entries;
}
