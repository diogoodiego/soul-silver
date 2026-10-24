// Writer of the WAV files of the audio stage: IMA ADPCM (format 0x11), 32 kHz, 1 or 2 channels,
// 1024-byte blocks, with a fact chunk. `decodeWav` in shared reads them. See research.md R4.
import { AUDIO_SAMPLE_RATE, IMA_STEPS, imaStep } from "@soulsilver/shared/audio";

const BLOCK_ALIGN = 1024;

/** Samples per channel in one block: the header sample plus two per data byte. */
export const samplesPerBlock = (channels: number) => ((BLOCK_ALIGN - 4 * channels) * 2) / channels + 1;

const toInt16 = (v: number) => Math.max(-32768, Math.min(32767, Math.round(v * 32768)));

/** The 4-bit code that brings `sample` closest to `target`, by the IMA rule. */
function encodeNibble(sample: number, index: number, target: number): number {
  const step = IMA_STEPS[index]!;
  let diff = target - sample;
  let nibble = 0;
  if (diff < 0) {
    nibble = 8;
    diff = -diff;
  }
  if (diff >= step) {
    nibble |= 4;
    diff -= step;
  }
  if (diff >= step >> 1) {
    nibble |= 2;
    diff -= step >> 1;
  }
  if (diff >= step >> 2) nibble |= 1;
  return nibble;
}

export function encodeWav(channels: Float32Array[]): Uint8Array {
  const count = channels.length;
  const samples = channels[0]!.length;
  const perBlock = samplesPerBlock(count);
  const blocks = Math.ceil(samples / perBlock);
  const dataSize = blocks * BLOCK_ALIGN;
  const out = new Uint8Array(12 + 28 + 12 + 8 + dataSize);
  const view = new DataView(out.buffer);
  const ascii = (at: number, text: string) => [...text].forEach((ch, i) => (out[at + i] = ch.charCodeAt(0)));

  ascii(0, "RIFF");
  view.setUint32(4, out.length - 8, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 20, true);
  view.setUint16(20, 0x11, true);
  view.setUint16(22, count, true);
  view.setUint32(24, AUDIO_SAMPLE_RATE, true);
  view.setUint32(28, Math.round((AUDIO_SAMPLE_RATE * BLOCK_ALIGN) / perBlock), true);
  view.setUint16(32, BLOCK_ALIGN, true);
  view.setUint16(34, 4, true);
  view.setUint16(36, 2, true);
  view.setUint16(38, perBlock, true);
  ascii(40, "fact");
  view.setUint32(44, 4, true);
  view.setUint32(48, samples, true);
  ascii(52, "data");
  view.setUint32(56, dataSize, true);

  // The first block starts at the step that fits the first change, so a loud start is not slewed.
  const state = channels.map((c) => {
    const first = Math.abs(toInt16(c[1] ?? 0) - toInt16(c[0] ?? 0));
    const index = IMA_STEPS.findIndex((step) => step >= first);
    return { sample: 0, index: index < 0 ? 88 : index };
  });
  for (let b = 0; b < blocks; b++) {
    const base = 60 + b * BLOCK_ALIGN;
    const first = b * perBlock;
    channels.forEach((channel, c) => {
      const s = state[c]!;
      s.sample = toInt16(channel[first] ?? 0);
      view.setInt16(base + c * 4, s.sample, true);
      out[base + c * 4 + 2] = s.index;
      for (let n = 1; n < perBlock; n++) {
        const target = toInt16(channel[first + n] ?? 0);
        const nibble = encodeNibble(s.sample, s.index, target);
        [s.sample, s.index] = imaStep(s.sample, s.index, nibble);
        // After the headers, groups of 8 samples (4 bytes) alternate between channels.
        const k = n - 1;
        const at = base + 4 * count + ((k >> 3) * count + c) * 4 + ((k & 7) >> 1);
        out[at] = out[at]! | (k & 1 ? nibble << 4 : nibble);
      }
    });
  }
  return out;
}
