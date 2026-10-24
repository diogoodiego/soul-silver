// Reader of wave archives (SWAR): each wave (SWAV) is PCM8, PCM16 or IMA ADPCM, with an optional
// loop that runs from the loop start to the end of the wave. See research.md R2.
import { imaStep } from "@soulsilver/shared/audio";
import { readU16, readU32 } from "../binary.ts";
import { nitroData, SdatFormatError } from "./sdat.ts";

export interface Wave {
  /** Playback rate at the base key, in Hz. */
  rate: number;
  /** Samples in [-1, 1). */
  samples: Float32Array;
  /** Sample where the loop starts; the loop ends at the last sample. Null for a one-shot wave. */
  loopStart: number | null;
}

const PCM8 = 0;
const PCM16 = 1;
const ADPCM = 2;

export function readSwar(bytes: Uint8Array, what: string): Wave[] {
  const data = nitroData(bytes, "SWAR", what);
  const count = readU32(bytes, data + 8 + 32);
  return Array.from({ length: count }, (_, i) => readSwav(bytes, readU32(bytes, data + 8 + 36 + i * 4), `${what}, onda ${i}`));
}

function readSwav(bytes: Uint8Array, at: number, what: string): Wave {
  const type = bytes[at]!;
  const looped = bytes[at + 1]! !== 0;
  const rate = readU16(bytes, at + 2);
  const loopWords = readU16(bytes, at + 6);
  const words = loopWords + readU32(bytes, at + 8);
  const start = at + 12;
  const end = start + words * 4;
  if (end > bytes.length) throw new SdatFormatError(`${what}: a onda passa do fim do arquivo (offset 0x${at.toString(16)})`);

  let samples: Float32Array;
  let loopStart: number;
  if (type === PCM8) {
    samples = Float32Array.from(bytes.subarray(start, end), (b) => ((b << 24) >> 24) / 128);
    loopStart = loopWords * 4;
  } else if (type === PCM16) {
    samples = new Float32Array(words * 2);
    for (let i = 0; i < samples.length; i++) samples[i] = ((readU16(bytes, start + i * 2) << 16) >> 16) / 32768;
    loopStart = loopWords * 2;
  } else if (type === ADPCM) {
    // A 4-byte header (initial sample, step index) comes first; it counts as a word of the loop offset.
    let sample = (readU16(bytes, start) << 16) >> 16;
    let index = Math.min(88, bytes[start + 2]!);
    samples = new Float32Array((words - 1) * 8);
    for (let i = 0; i < samples.length; i++) {
      const byte = bytes[start + 4 + (i >> 1)]!;
      [sample, index] = imaStep(sample, index, i & 1 ? byte >> 4 : byte & 15);
      samples[i] = sample / 32768;
    }
    loopStart = Math.max(0, (loopWords - 1) * 8);
  } else {
    throw new SdatFormatError(`${what}: tipo de onda ${type} desconhecido`);
  }
  return { rate, samples, loopStart: looped && loopStart < samples.length ? loopStart : null };
}
