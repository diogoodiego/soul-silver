// Reader of the Nitro sound archive (SDAT): names (SYMB), records (INFO), file table (FAT).
// See specs/009-audio-extraction/research.md R0 and R2.
import { readAscii, readU16, readU32 } from "../binary.ts";

export interface SeqInfo {
  id: number;
  fileId: number;
  bank: number;
  /** Sequence volume, 0..127. */
  volume: number;
}

export interface BankInfo {
  id: number;
  fileId: number;
  /** Up to four wave archive ids; 0xFFFF slots are left out. */
  waveArcs: number[];
}

export interface Sdat {
  seqs: (SeqInfo | null)[];
  banks: (BankInfo | null)[];
  waveArcs: (number | null)[];
  names: { seq: (string | null)[]; bank: (string | null)[]; waveArc: (string | null)[] };
  /** A file of the FILE block by its FAT id. */
  file(fileId: number): Uint8Array;
}

/** SYMB and INFO keep one list per type in this order. */
const SEQ = 0;
const BANK = 2;
const WAVE_ARC = 3;

export class SdatFormatError extends Error {
  override name = "SdatFormatError";
}

export function readSdat(bytes: Uint8Array): Sdat {
  try {
    if (readAscii(bytes, 0, 4) !== "SDAT") throw new SdatFormatError("esperado o cabeçalho SDAT no offset 0x0");
    const block = (i: number) => ({ at: readU32(bytes, 0x10 + i * 8), size: readU32(bytes, 0x14 + i * 8) });
    const symb = block(0);
    const info = block(1);
    const fat = block(2);
    for (const [name, b] of [["INFO", info], ["FAT ", fat]] as const) {
      if (b.at + b.size > bytes.length || readAscii(bytes, b.at, 4) !== name) throw new SdatFormatError(`bloco ${name.trim()} ausente ou fora do arquivo (offset 0x${b.at.toString(16)})`);
    }

    const list = <T>(base: number, type: number, read: (at: number) => T): (T | null)[] => {
      const listAt = readU32(bytes, base + 8 + type * 4);
      if (listAt === 0) return [];
      return Array.from({ length: readU32(bytes, base + listAt) }, (_, k) => {
        const at = readU32(bytes, base + listAt + 4 + k * 4);
        return at === 0 ? null : read(base + at);
      });
    };
    const text = (at: number) => {
      let end = at;
      while (end < bytes.length && bytes[end] !== 0) end++;
      return readAscii(bytes, at, end - at);
    };
    const names = (type: number) => (symb.at === 0 || symb.size === 0 ? [] : list(symb.at, type, text));

    const files = readU32(bytes, fat.at + 8);
    const file = (fileId: number) => {
      if (fileId >= files) throw new SdatFormatError(`arquivo ${fileId} fora da FAT (${files} arquivos)`);
      const at = readU32(bytes, fat.at + 12 + fileId * 16);
      const size = readU32(bytes, fat.at + 16 + fileId * 16);
      if (at + size > bytes.length) throw new SdatFormatError(`arquivo ${fileId} sai do SDAT (offset 0x${at.toString(16)})`);
      return bytes.subarray(at, at + size);
    };

    return {
      seqs: list(info.at, SEQ, (at) => ({ id: 0, fileId: readU16(bytes, at), bank: readU16(bytes, at + 4), volume: bytes[at + 6]! })).map((s, id) => (s ? { ...s, id } : null)),
      banks: list(info.at, BANK, (at) => ({
        id: 0,
        fileId: readU16(bytes, at),
        waveArcs: [0, 1, 2, 3].map((i) => readU16(bytes, at + 4 + i * 2)).filter((w) => w !== 0xffff),
      })).map((b, id) => (b ? { ...b, id } : null)),
      waveArcs: list(info.at, WAVE_ARC, (at) => readU16(bytes, at)),
      names: { seq: names(SEQ), bank: names(BANK), waveArc: names(WAVE_ARC) },
      file,
    };
  } catch (error) {
    if (error instanceof SdatFormatError) throw error;
    throw new SdatFormatError(`SDAT inválido: ${(error as Error).message}`, { cause: error });
  }
}

/** The DATA block of a Nitro file (SSEQ, SBNK, SWAR): checks the magics and returns the block's offset. */
export function nitroData(bytes: Uint8Array, magic: string, what: string): number {
  if (bytes.length < 0x18 || readAscii(bytes, 0, 4) !== magic) throw new SdatFormatError(`${what}: esperado o cabeçalho ${magic}`);
  const at = readU16(bytes, 12);
  if (readAscii(bytes, at, 4) !== "DATA") throw new SdatFormatError(`${what}: bloco DATA ausente no offset 0x${at.toString(16)}`);
  return at;
}
