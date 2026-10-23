import { readAscii, readU16, readU32 } from "../binary.ts";
import { readFnt } from "./filesystem.ts";
import { NdsFormatError } from "./header.ts";

// NARC containers; see specs/003-rom-extraction-pipeline/research.md R5.

export class NarcFormatError extends Error {
  override name = "NarcFormatError";
}

export interface Narc {
  /** Views into the input buffer, in index order. */
  members: Uint8Array[];
  /** Member index → path, only when the archive has a name table. */
  names?: Record<number, string>;
}

export function isNarc(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x4e && bytes[1] === 0x41 && bytes[2] === 0x52 && bytes[3] === 0x43;
}

function section(bytes: Uint8Array, offset: number, magic: string): { start: number; end: number } {
  if (offset + 8 > bytes.length || readAscii(bytes, offset, 4) !== magic) {
    throw new NarcFormatError(`Expected section ${magic} at 0x${offset.toString(16)}`);
  }
  const end = offset + readU32(bytes, offset + 4);
  if (end > bytes.length || end < offset + 8) throw new NarcFormatError(`Section ${magic} size exceeds the file`);
  return { start: offset + 8, end };
}

export function parseNarc(bytes: Uint8Array): Narc {
  if (!isNarc(bytes) || bytes.length < 16) throw new NarcFormatError("Missing NARC magic");
  const headerSize = readU16(bytes, 12);

  const btaf = section(bytes, headerSize, "BTAF");
  const count = readU16(bytes, btaf.start);
  if (btaf.start + 4 + count * 8 > btaf.end) throw new NarcFormatError("BTAF entries exceed the section");
  const btnf = section(bytes, btaf.end, "BTNF");
  const gmif = section(bytes, btnf.end, "GMIF");

  const members: Uint8Array[] = [];
  for (let i = 0; i < count; i++) {
    const start = readU32(bytes, btaf.start + 4 + i * 8);
    const end = readU32(bytes, btaf.start + 8 + i * 8);
    if (end < start || gmif.start + end > gmif.end) throw new NarcFormatError(`Member ${i} range is outside GMIF`);
    members.push(bytes.subarray(gmif.start + start, gmif.start + end));
  }

  let names: Record<number, string> | undefined;
  try {
    const paths = readFnt(bytes.subarray(btnf.start, btnf.end));
    if (paths.size > 0) names = Object.fromEntries(paths);
  } catch (error) {
    if (error instanceof NdsFormatError) throw new NarcFormatError(`BTNF: ${error.message}`);
    throw error;
  }
  return names ? { members, names } : { members };
}
