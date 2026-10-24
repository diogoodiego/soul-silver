import { describe, expect, it } from "vitest";
import { noteForKey, readSbnk } from "../../src/audio/sbnk.ts";
import { readSwar } from "../../src/audio/swar.ts";
import { buildSbnk, buildSwar } from "../fixtures/audio/builders.ts";

describe("readSwar", () => {
  it("reads signed PCM8 and PCM16 with their rate and loop", () => {
    const [p8, p16] = readSwar(
      buildSwar([
        { type: 0, rate: 8000, data: [0, 64, 0x80, 0xc0], loopWords: 0 },
        { type: 1, rate: 16000, data: [0, 0x40, 0, 0xc0] },
      ]),
      "ondas",
    );
    expect(p8!.rate).toBe(8000);
    expect([...p8!.samples]).toEqual([0, 0.5, -1, -0.5]);
    expect(p8!.loopStart).toBe(0);
    expect([...p16!.samples]).toEqual([0.5, -0.5]);
    expect(p16!.loopStart).toBeNull();
  });

  it("decodes IMA ADPCM after its 4-byte header, which counts in the loop offset", () => {
    // Header: sample 0, step index 0; nibbles 4, 4, then zeros (same steps as the WAV decoder test).
    const [wave] = readSwar(buildSwar([{ type: 2, rate: 22050, data: [0, 0, 0, 0, 0x44, 0, 0, 0, 0, 0, 0, 0], loopWords: 2 }]), "ondas");
    expect(wave!.samples).toHaveLength(16);
    expect(Array.from(wave!.samples.slice(0, 4), (v) => Math.round(v * 32768))).toEqual([7, 17, 18, 19]);
    expect(wave!.loopStart).toBe(8);
  });

  it("fails naming the wave when it runs past the file", () => {
    const bytes = buildSwar([{ type: 0, rate: 8000, data: [1, 2, 3, 4] }]);
    new DataView(bytes.buffer).setUint32(bytes.length - 8, 1000, true);
    expect(() => readSwar(bytes, "arquivo de ondas 7")).toThrow(/arquivo de ondas 7, onda 0/);
  });
});

describe("readSbnk", () => {
  const bank = readSbnk(
    buildSbnk([
      { type: 0 },
      { type: 1, wave: 3, archive: 1, baseKey: 69, attack: 120, decay: 100, sustain: 90, release: 80, pan: 40 },
      { type: 2, wave: 4, baseKey: 60 },
      { type: 16, low: 36, high: 38, notes: [{ type: 1, wave: 1 }, { type: 3 }, { type: 1, wave: 2 }] },
      { type: 17, regions: [{ top: 59, note: { type: 1, wave: 5 } }, { top: 127, note: { type: 1, wave: 6 } }] },
    ]),
    "banco 9",
  );

  it("reads single instruments with base key, envelope and pan", () => {
    expect(bank[0]).toBeNull();
    expect(bank[1]).toEqual({ kind: "single", note: { kind: "pcm", wave: 3, archive: 1, baseKey: 69, attack: 120, decay: 100, sustain: 90, release: 80, pan: 40 } });
    expect(bank[2]).toMatchObject({ kind: "single", note: { kind: "psg", wave: 4 } });
  });

  it("picks the note of a drum set by key and of a key split by region", () => {
    expect(noteForKey(bank[3]!, 36)?.wave).toBe(1);
    expect(noteForKey(bank[3]!, 37)?.kind).toBe("noise");
    expect(noteForKey(bank[3]!, 40)).toBeNull();
    expect(noteForKey(bank[4]!, 59)?.wave).toBe(5);
    expect(noteForKey(bank[4]!, 60)?.wave).toBe(6);
  });

  it("rejects a file that is not a bank, naming it", () => {
    expect(() => readSbnk(buildSwar([]), "banco 9")).toThrow(/banco 9.*SBNK/);
  });
});
