// Reader of instrument banks (SBNK): single instruments (PCM, PSG square wave, noise), drum sets
// and key splits, each note with its base key, envelope and pan. See research.md R2.
import { readU16, readU32 } from "../binary.ts";
import { nitroData, SdatFormatError } from "./sdat.ts";

export interface NoteDefinition {
  kind: "pcm" | "psg" | "noise";
  /** PCM: wave in the archive; PSG: duty cycle 0..7 (1/8 to 7/8). */
  wave: number;
  /** Slot (0..3) of the bank's wave archive list. */
  archive: number;
  baseKey: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  pan: number;
}

export type Instrument =
  | { kind: "single"; note: NoteDefinition }
  | { kind: "drums"; low: number; notes: (NoteDefinition | null)[] }
  | { kind: "split"; regions: { top: number; note: NoteDefinition | null }[] };

const KIND: Record<number, NoteDefinition["kind"] | undefined> = { 1: "pcm", 2: "psg", 3: "noise", 4: "pcm" };
const DRUMS = 16;
const SPLIT = 17;

function noteAt(bytes: Uint8Array, type: number, at: number): NoteDefinition | null {
  const kind = KIND[type];
  if (!kind) return null;
  return {
    kind,
    wave: readU16(bytes, at),
    archive: readU16(bytes, at + 2),
    baseKey: bytes[at + 4]!,
    attack: bytes[at + 5]!,
    decay: bytes[at + 6]!,
    sustain: bytes[at + 7]!,
    release: bytes[at + 8]!,
    pan: bytes[at + 9]!,
  };
}

/** Instruments by program number; null for an empty program. */
export function readSbnk(bytes: Uint8Array, what: string): (Instrument | null)[] {
  const data = nitroData(bytes, "SBNK", what);
  const count = readU32(bytes, data + 8 + 32);
  return Array.from({ length: count }, (_, i): Instrument | null => {
    const record = data + 8 + 36 + i * 4;
    const type = bytes[record]!;
    const at = readU16(bytes, record + 1);
    if (type === 0) return null;
    if (at + 2 > bytes.length) throw new SdatFormatError(`${what}, instrumento ${i}: definição fora do arquivo`);
    if (type === DRUMS) {
      const low = bytes[at]!;
      const high = bytes[at + 1]!;
      return { kind: "drums", low, notes: Array.from({ length: high - low + 1 }, (_, k) => noteAt(bytes, bytes[at + 2 + k * 12]!, at + 4 + k * 12)) };
    }
    if (type === SPLIT) {
      const tops = Array.from(bytes.subarray(at, at + 8)).filter((top) => top !== 0);
      return { kind: "split", regions: tops.map((top, k) => ({ top, note: noteAt(bytes, bytes[at + 8 + k * 12]!, at + 10 + k * 12) })) };
    }
    const note = noteAt(bytes, type, at);
    if (!note) return null;
    return { kind: "single", note };
  });
}

/** The note definition an instrument uses for a key, or null when the key has none. */
export function noteForKey(instrument: Instrument, key: number): NoteDefinition | null {
  if (instrument.kind === "single") return instrument.note;
  if (instrument.kind === "drums") return instrument.notes[key - instrument.low] ?? null;
  return instrument.regions.find((r) => key <= r.top)?.note ?? null;
}
