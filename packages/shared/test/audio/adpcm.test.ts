import { describe, expect, it } from "vitest";
import { decodeWav } from "../../src/audio/adpcm.ts";

/** A WAV with the IMA ADPCM format chunk, a fact chunk and `data`, as the extractor writes it. */
function wav(opts: { channels: number; blockAlign: number; samples: number; data: number[]; tag?: number; rate?: number }): Uint8Array {
  const fmt = [
    ...u16(opts.tag ?? 0x11),
    ...u16(opts.channels),
    ...u32(opts.rate ?? 32000),
    ...u32(0),
    ...u16(opts.blockAlign),
    ...u16(4),
    ...u16(2),
    ...u16((opts.blockAlign - 4 * opts.channels) * 2 / opts.channels + 1),
  ];
  const body = [...chunk("fmt ", fmt), ...chunk("fact", u32(opts.samples)), ...chunk("data", opts.data)];
  return new Uint8Array([...ascii("RIFF"), ...u32(4 + body.length), ...ascii("WAVE"), ...body]);
}
const u16 = (v: number) => [v & 255, (v >> 8) & 255];
const u32 = (v: number) => [...u16(v & 0xffff), ...u16(v >>> 16)];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const chunk = (id: string, data: number[]) => [...ascii(id), ...u32(data.length), ...data, ...(data.length % 2 ? [0] : [])];

const pcm = (values: Float32Array) => Array.from(values, (v) => Math.round(v * 32768));

describe("decodeWav", () => {
  it("decodes a mono block: header sample, then 4-bit steps (low nibble first)", () => {
    // Header: sample 0, step index 0. Nibbles 4, 4, then zeros (worked by hand from the IMA tables).
    const out = decodeWav(wav({ channels: 1, blockAlign: 8, samples: 9, data: [0, 0, 0, 0, 0x44, 0, 0, 0] }));
    expect(out.sampleRate).toBe(32000);
    expect(out.channels).toHaveLength(1);
    expect(pcm(out.channels[0]!)).toEqual([0, 7, 17, 18, 19, 20, 21, 21, 21]);
  });

  it("decodes a stereo block with 4-byte groups per channel", () => {
    const left = [0x44, 0, 0, 0];
    const right = [0, 0, 0, 0];
    // Headers: left starts at 0, right starts at 100; both at step index 0.
    const data = [0, 0, 0, 0, 100, 0, 0, 0, ...left, ...right];
    const out = decodeWav(wav({ channels: 2, blockAlign: 16, samples: 9, data }));
    expect(pcm(out.channels[0]!)).toEqual([0, 7, 17, 18, 19, 20, 21, 21, 21]);
    expect(pcm(out.channels[1]!)).toEqual([100, 100, 100, 100, 100, 100, 100, 100, 100]);
  });

  it("stops at the sample count of the fact chunk, across blocks", () => {
    const block = [0, 0, 0, 0, 0x44, 0, 0, 0];
    const out = decodeWav(wav({ channels: 1, blockAlign: 8, samples: 12, data: [...block, ...block] }));
    expect(out.channels[0]).toHaveLength(12);
    expect(pcm(out.channels[0]!).slice(9)).toEqual([0, 7, 17]);
  });

  it.each([
    ["a file that is not RIFF/WAVE", new Uint8Array(12), /RIFF/],
    ["a PCM format tag", wav({ channels: 1, blockAlign: 8, samples: 9, data: new Array<number>(8).fill(0), tag: 1 }), /0x11/],
    ["three channels", wav({ channels: 3, blockAlign: 24, samples: 9, data: new Array<number>(24).fill(0) }), /canais/],
    ["a data chunk shorter than the samples", wav({ channels: 1, blockAlign: 8, samples: 40, data: new Array<number>(8).fill(0) }), /data/],
  ])("rejects %s with a clear message", (_name, bytes, message) => {
    expect(() => decodeWav(bytes)).toThrow(message);
  });
});
