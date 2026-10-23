import { readAscii, readU16, readU32 } from "../binary.ts";
import { NdsFormatError, type NdsHeader, parseNdsHeader } from "./header.ts";

// FNT, FAT and overlay tables; see specs/003-rom-extraction-pipeline/research.md R4.

export interface NdsFile {
  id: number;
  /** POSIX path relative to the FNT root. */
  path: string;
  start: number;
  end: number;
}

export interface NdsOverlay {
  index: number;
  fileId: number;
  start: number;
  end: number;
}

export interface NdsFileSystem {
  header: NdsHeader;
  files: NdsFile[];
  overlays9: NdsOverlay[];
  overlays7: NdsOverlay[];
}

/**
 * Walks a file name table (shared by ROMs and NARCs). Returns file id → path.
 * Throws `NdsFormatError` on reserved entry types, loops or out-of-bounds reads.
 */
export function readFnt(fnt: Uint8Array): Map<number, string> {
  const paths = new Map<number, string>();
  const at = <T>(read: () => T, what: string): T => {
    try {
      return read();
    } catch (error) {
      if (error instanceof RangeError) throw new NdsFormatError(`FNT ${what}: ${error.message}`);
      throw error;
    }
  };
  const dirCount = at(() => readU16(fnt, 6), "root entry");
  const visited = new Set<number>();

  const walk = (dirIndex: number, prefix: string): void => {
    if (dirIndex >= dirCount || visited.has(dirIndex)) throw new NdsFormatError(`FNT directory 0x${(0xf000 | dirIndex).toString(16)} is invalid or repeated`);
    visited.add(dirIndex);
    let cursor = at(() => readU32(fnt, dirIndex * 8), "directory entry");
    let fileId = at(() => readU16(fnt, dirIndex * 8 + 4), "directory entry");
    for (;;) {
      const type = fnt[cursor];
      if (type === undefined) throw new NdsFormatError(`FNT subtable runs past the table at 0x${cursor.toString(16)}`);
      cursor++;
      if (type === 0) return;
      if (type === 0x80) throw new NdsFormatError(`FNT reserved entry type 0x80 at 0x${(cursor - 1).toString(16)}`);
      const nameLength = type & 0x7f;
      const name = at(() => readAscii(fnt, cursor, nameLength), "name");
      cursor += nameLength;
      const path = prefix === "" ? name : `${prefix}/${name}`;
      if (type < 0x80) {
        paths.set(fileId++, path);
      } else {
        const subdir = at(() => readU16(fnt, cursor), "subdirectory id");
        cursor += 2;
        walk(subdir & 0x0fff, path);
      }
    }
  };
  walk(0, "");
  return paths;
}

function fatRange(rom: Uint8Array, header: NdsHeader, fileId: number): { start: number; end: number } {
  const entry = header.fat.offset + fileId * 8;
  if (fileId * 8 + 8 > header.fat.size) throw new NdsFormatError(`FAT has no entry for file ${fileId}`);
  const start = readU32(rom, entry);
  const end = readU32(rom, entry + 4);
  if (end < start || end > rom.length) {
    throw new NdsFormatError(`FAT entry ${fileId} (0x${start.toString(16)}–0x${end.toString(16)}) is invalid`);
  }
  return { start, end };
}

function readOverlays(rom: Uint8Array, header: NdsHeader, table: { offset: number; size: number }): NdsOverlay[] {
  const overlays: NdsOverlay[] = [];
  for (let index = 0; index * 32 + 32 <= table.size; index++) {
    const fileId = readU32(rom, table.offset + index * 32 + 0x18);
    overlays.push({ index, fileId, ...fatRange(rom, header, fileId) });
  }
  return overlays;
}

export function readNdsFileSystem(rom: Uint8Array): NdsFileSystem {
  const header = parseNdsHeader(rom);
  const fnt = rom.subarray(header.fnt.offset, header.fnt.offset + header.fnt.size);
  const files: NdsFile[] = [];
  for (const [id, path] of readFnt(fnt)) files.push({ id, path, ...fatRange(rom, header, id) });
  return {
    header,
    files,
    overlays9: readOverlays(rom, header, header.y9),
    overlays7: readOverlays(rom, header, header.y7),
  };
}
