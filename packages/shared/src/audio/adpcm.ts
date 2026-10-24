// Decoder of the WAV files the audio stage writes: RIFF/WAVE, IMA ADPCM (format 0x11), 1 or 2
// channels. Pure TypeScript, no Node APIs, so the game and the dev player can use it.
// See specs/009-audio-extraction/data-model.md, "WAV".

/** IMA ADPCM step sizes. */
export const IMA_STEPS = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230,
  253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327,
  3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794,
  32767,
] as const;

/** Change of the step index for each 3-bit magnitude. */
export const IMA_INDEX_CHANGE = [-1, -1, -1, -1, 2, 4, 6, 8] as const;

/** One IMA ADPCM step: the next sample and step index from a 4-bit code. */
export function imaStep(sample: number, index: number, nibble: number): [number, number] {
  const step = IMA_STEPS[index]!;
  let diff = step >> 3;
  if (nibble & 4) diff += step;
  if (nibble & 2) diff += step >> 1;
  if (nibble & 1) diff += step >> 2;
  const next = Math.max(-32768, Math.min(32767, nibble & 8 ? sample - diff : sample + diff));
  return [next, Math.max(0, Math.min(88, index + IMA_INDEX_CHANGE[nibble & 7]!))];
}

export interface DecodedWav {
  sampleRate: number;
  /** One array per channel, samples in [-1, 1). */
  channels: Float32Array[];
}

export function decodeWav(bytes: Uint8Array): DecodedWav {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(bytes[o]!, bytes[o + 1]!, bytes[o + 2]!, bytes[o + 3]!);
  if (bytes.length < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("WAV inválido: esperado cabeçalho RIFF/WAVE");

  const chunks = new Map<string, { at: number; size: number }>();
  for (let o = 12; o + 8 <= bytes.length; ) {
    const size = view.getUint32(o + 4, true);
    chunks.set(tag(o), { at: o + 8, size });
    o += 8 + size + (size & 1);
  }
  const fmt = chunks.get("fmt ");
  const fact = chunks.get("fact");
  const data = chunks.get("data");
  if (!fmt || !fact || !data) throw new Error("WAV inválido: faltam os blocos fmt, fact ou data");

  const format = view.getUint16(fmt.at, true);
  if (format !== 0x11) throw new Error(`WAV inválido: esperado IMA ADPCM (0x11), recebido 0x${format.toString(16)}`);
  const count = view.getUint16(fmt.at + 2, true);
  if (count !== 1 && count !== 2) throw new Error(`WAV inválido: ${count} canais (esperado 1 ou 2)`);
  const sampleRate = view.getUint32(fmt.at + 4, true);
  const blockAlign = view.getUint16(fmt.at + 12, true);
  const perBlock = ((blockAlign - 4 * count) * 2) / count + 1;
  const samples = view.getUint32(fact.at, true);
  const blocks = Math.ceil(samples / perBlock);
  if (data.at + data.size > bytes.length || data.size < blocks * blockAlign) {
    throw new Error(`WAV inválido: o bloco data tem ${data.size} bytes, esperado ${blocks * blockAlign} para ${samples} amostras`);
  }

  const channels = Array.from({ length: count }, () => new Float32Array(samples));
  for (let b = 0; b < blocks; b++) {
    const base = data.at + b * blockAlign;
    for (let c = 0; c < count; c++) {
      const out = channels[c]!;
      let sample = view.getInt16(base + c * 4, true);
      let index = Math.min(88, bytes[base + c * 4 + 2]!);
      let n = b * perBlock;
      if (n < samples) out[n++] = sample / 32768;
      // After the headers, groups of 4 bytes (8 samples) alternate between channels.
      for (let g = 0; n < samples && g < (perBlock - 1) / 8; g++) {
        const at = base + 4 * count + (g * count + c) * 4;
        for (let k = 0; k < 8 && n < samples; k++) {
          const byte = bytes[at + (k >> 1)]!;
          [sample, index] = imaStep(sample, index, k & 1 ? byte >> 4 : byte & 15);
          out[n++] = sample / 32768;
        }
      }
    }
  }
  return { sampleRate, channels };
}
