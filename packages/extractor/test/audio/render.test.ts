import { decodeWav } from "@soulsilver/shared/audio";
import { describe, expect, it } from "vitest";
import { cryBank, renderCry } from "../../src/audio/cries.ts";
import { renderSequence, SoundSource } from "../../src/audio/render.ts";
import { readSdat } from "../../src/audio/sdat.ts";
import { encodeWav, samplesPerBlock } from "../../src/audio/wav.ts";
import { buildSbnk, buildSdat, buildSseq, buildSwar, ev, sine8, type NoteDef } from "../fixtures/audio/builders.ts";

const RATE = 32000;
/** One sine cycle of 32 samples played at 8000 Hz: 250 Hz at the base key. */
const SINE = { type: 0 as const, rate: 8000, data: sine8(32, 1), loopWords: 0 };

function source(seqs: number[][], note: Partial<NoteDef> = {}, extraBanks: NoteDef[] = []): SoundSource {
  const bank = (n: Partial<NoteDef>) => buildSbnk([{ type: 1, baseKey: 60, ...n }]);
  return new SoundSource(
    readSdat(
      buildSdat({
        seqs: seqs.map((events, i) => ({ name: `SEQ_${i}`, data: buildSseq(events), bank: 0 })),
        banks: [{ data: bank(note), waveArcs: [0] }, ...extraBanks.map((n) => ({ data: bank(n), waveArcs: [0] }))],
        waveArcs: [{ data: buildSwar([SINE, { type: 0, rate: 8000, data: Array(64).fill(40) }]) }],
      }),
    ),
  );
}

/** Frequency from upward zero crossings over a window of the signal. */
function frequency(samples: Float32Array, from: number, to: number): number {
  let crossings = 0;
  for (let i = from + 1; i < to; i++) if (samples[i - 1]! < 0 && samples[i]! >= 0) crossings++;
  return (crossings * RATE) / (to - from);
}

const rms = (s: Float32Array, from: number, to: number) => Math.sqrt(s.subarray(from, to).reduce((a, v) => a + v * v, 0) / (to - from));

// At tempo 120 a tick is 1/96 s; 96 ticks = 1 s.
const tone = (key: number, ticks: number) => [...ev.tempo(120), ...ev.note(key, 127, ticks), ...ev.end()];

describe("synth and render", () => {
  it("plays the wave at its rate at the base key and an octave up 12 keys higher", () => {
    const base = renderSequence(source([tone(60, 96)]), 0);
    expect(frequency(base.channels[0]!, 2000, 20000)).toBeCloseTo(250, -1);
    const octave = renderSequence(source([tone(72, 96)]), 0);
    expect(frequency(octave.channels[0]!, 2000, 20000)).toBeCloseTo(500, -1);
  });

  it("holds the note for its length and cuts the silence after the release", () => {
    const r = renderSequence(source([tone(60, 96)], { release: 127 }), 0);
    expect(r.loop).toBeNull();
    expect(r.channels[0]!.length / RATE).toBeCloseTo(1, 1);
  });

  it("follows attack, decay to sustain and release of the envelope", () => {
    const r = renderSequence(source([tone(60, 192)], { attack: 100, decay: 100, sustain: 64, release: 110 }), 0).channels[0]!;
    const early = rms(r, 0, 200);
    const peak = Math.max(...[0, 1, 2, 3].map((k) => rms(r, 400 + k * 400, 800 + k * 400)));
    const held = rms(r, 40000, 48000);
    expect(early).toBeLessThan(peak); // attack rises
    expect(held).toBeLessThan(peak); // decay falls to sustain
    expect(held / peak).toBeGreaterThan(0.1); // sustain 64 is about -12 dB, not silence
    expect(r.length).toBeGreaterThan(2 * RATE); // release continues after the note's 2 s
  });

  it("pans: instrument pan 0 plays on the left only", () => {
    const r = renderSequence(source([tone(60, 48)], { pan: 0 }), 0);
    expect(r.channels).toHaveLength(2);
    expect(rms(r.channels[0]!, 1000, 8000)).toBeGreaterThan(0.01);
    expect(rms(r.channels[1]!, 1000, 8000)).toBeLessThan(0.0001);
  });

  it("gives a centered track one channel (mono) and a panned one two", () => {
    expect(renderSequence(source([tone(60, 48)]), 0).channels).toHaveLength(1);
    expect(renderSequence(source([[...ev.pan(100), ...tone(60, 48)]]), 0).channels).toHaveLength(2);
  });

  it("keeps the introduction and one turn of the loop, with the loop points in samples", () => {
    // Intro: 48 ticks (0.5 s). Loop: a 24-tick rest, then a 72-tick note with a long release that
    // still rings when the track jumps back (offset 6: the rest).
    const events = [...ev.tempo(120), ...ev.note(55, 127, 48), ...ev.rest(24), ...ev.note(67, 127, 72), ...ev.jump(6)];
    const r = renderSequence(source([events], { release: 100 }), 0);
    expect(r.loop).not.toBeNull();
    const { start, end } = r.loop!;
    expect(start / RATE).toBeCloseTo(0.5, 1);
    expect((end - start) / RATE).toBeCloseTo(1, 1);
    expect(r.channels[0]!.length).toBe(end);
    const s = r.channels[0]!;
    // The tail of the note that rings past the end of the loop is at the start of the loop.
    expect(rms(s, start, start + 2000)).toBeGreaterThan(0.01);
    // The seam: the last sample of the loop leads into its first one like any two neighbors.
    const jump = Math.abs(s[end - 1]! - s[start]!);
    const typical = Math.max(...Array.from({ length: 2000 }, (_, i) => Math.abs(s[start + i + 1]! - s[start + i]!)));
    expect(jump).toBeLessThanOrEqual(typical * 1.5 + 1e-6);
  });

  it("renders the same samples on every run", () => {
    const a = renderSequence(source([tone(60, 96)]), 0);
    const b = renderSequence(source([tone(60, 96)]), 0);
    expect(a.channels[0]).toEqual(b.channels[0]);
  });

  it("fails naming bank and instrument when a wave is missing", () => {
    expect(() => renderSequence(source([tone(60, 10)], { wave: 9 }), 0)).toThrow(/banco 0, instrumento 0: onda 9/);
  });

  it("fails when a sequence neither ends nor repeats in time", () => {
    // A track that only rests forever would run past the limit: a rest of 2^28 ticks.
    expect(() => renderSequence(source([[0x80, 0xff, 0xff, 0xff, 0x7f, ...ev.end()]]), 0)).toThrow(/não termina nem repete/);
  }, 30_000);
});

describe("cries", () => {
  it("plays the cry sequence with the species' bank, and Shaymin Sky with its own", () => {
    expect(cryBank(25, 0)).toBe(25);
    expect(cryBank(492, 1)).toBe(494);
    expect(cryBank(487, 1)).toBe(487);
  });

  it("renders a one-shot cry to the end of its wave", () => {
    const cry = [...ev.tempo(100), ...ev.program(0), ...ev.note(60, 127, 0), ...ev.end()];
    const notes: NoteDef[] = Array.from({ length: 2 }, () => ({ type: 1, wave: 1 }));
    const r = renderCry(source([[], [], cry], {}, notes), 2, 0);
    expect(r.loop).toBeNull();
    // 64 samples at 8000 Hz = 8 ms; the cry lasts as long as its wave.
    expect(r.channels[0]!.length / RATE).toBeCloseTo(0.008, 2);
  });
});

describe("encodeWav", () => {
  it("writes a WAV that decodes back close to the input, mono and stereo", () => {
    const left = Float32Array.from({ length: 5000 }, (_, i) => 0.5 * Math.sin(i / 10));
    const right = Float32Array.from(left, (v) => -v);
    for (const channels of [[left], [left, right]]) {
      const decoded = decodeWav(encodeWav(channels));
      expect(decoded.sampleRate).toBe(RATE);
      expect(decoded.channels).toHaveLength(channels.length);
      decoded.channels.forEach((c, i) => {
        expect(c).toHaveLength(5000);
        const error = Math.max(...Array.from(c, (v, k) => Math.abs(v - channels[i]![k]!)));
        expect(error).toBeLessThan(0.02);
      });
    }
  });

  it("uses whole 1024-byte blocks and is the same on every run", () => {
    const signal = [Float32Array.from({ length: samplesPerBlock(1) + 3 }, (_, i) => Math.sin(i))];
    const a = encodeWav(signal);
    expect(a.length).toBe(60 + 2 * 1024);
    expect(encodeWav(signal)).toEqual(a);
  });
});
