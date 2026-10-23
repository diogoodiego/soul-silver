import { decompressBlz } from "./blz.ts";

// ARM9 and overlay decompression; see specs/004-game-data-extraction/research.md R2.

/** Bytes 0x1C.. of the module params: the nitrocode and the magic, as one block. */
const MODULE_PARAMS_MAGIC = Uint8Array.of(0x21, 0x06, 0xc0, 0xde, 0xde, 0xc0, 0x06, 0x21);
const OVERLAY_ENTRY_SIZE = 32;

export interface OverlayEntry {
  /** Position in the y9 table, also the number in the file name. */
  index: number;
  fileId: number;
  compressed: boolean;
}

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

/**
 * Decompresses the ARM9. The module params (found by their magic) say where the compressed
 * region ends; it starts at the head of the file, and anything after it is kept unchanged.
 */
export function decompressArm9(arm9: Uint8Array, loadAddress: number): Uint8Array {
  const magic = indexOfBytes(arm9, MODULE_PARAMS_MAGIC);
  if (magic < 0x1c) throw new Error("ARM9 sem module params (magic não encontrado)");
  const view = new DataView(arm9.buffer, arm9.byteOffset, arm9.byteLength);
  const compressedStaticEnd = view.getUint32(magic - 0x1c + 0x14, true);
  if (compressedStaticEnd === 0) return arm9;
  const end = compressedStaticEnd - loadAddress;
  if (end <= 0 || end > arm9.length) {
    throw new Error(`ARM9: compressedStaticEnd 0x${compressedStaticEnd.toString(16)} fora do arquivo (carga 0x${loadAddress.toString(16)})`);
  }
  const body = decompressBlz(arm9.subarray(0, end));
  const out = new Uint8Array(body.length + (arm9.length - end));
  out.set(body);
  out.set(arm9.subarray(end), body.length);
  return out;
}

export function readOverlayTable(y9: Uint8Array): OverlayEntry[] {
  const view = new DataView(y9.buffer, y9.byteOffset, y9.byteLength);
  const entries: OverlayEntry[] = [];
  for (let index = 0; (index + 1) * OVERLAY_ENTRY_SIZE <= y9.length; index++) {
    const base = index * OVERLAY_ENTRY_SIZE;
    entries.push({
      index,
      fileId: view.getUint32(base + 0x18, true),
      compressed: ((view.getUint32(base + 0x1c, true) >>> 24) & 1) === 1,
    });
  }
  return entries;
}

export function decompressOverlay(bytes: Uint8Array, entry: OverlayEntry): Uint8Array {
  return entry.compressed ? decompressBlz(bytes) : bytes;
}
