import { describe, expect, it } from "vitest";
import { parseAudioJson, serializeAudioFile } from "../../src/audio/schemas.ts";

const track = (extra: Record<string, unknown> = {}) => ({
  id: 1004,
  name: "SEQ_GS_TITLE",
  kind: "music",
  file: "music/1004.wav",
  channels: 2,
  samples: 1000,
  loop: { start: 100, end: 1000 },
  bytes: 600,
  ...extra,
});

const cry = (extra: Record<string, unknown> = {}) => ({ species: 25, form: 0, bank: 25, file: "cry/025.wav", channels: 1, samples: 500, bytes: 300, ...extra });

const index = (extra: Record<string, unknown> = {}) => ({ kind: "audio-index", formatVersion: 1, sampleRate: 32000, tracks: [track()], cries: [cry()], ...extra });

const report = (extra: Record<string, unknown> = {}) => ({
  kind: "audio-report",
  formatVersion: 1,
  ok: true,
  counts: { music: 1, jingle: 0, effect: 0, cry: 1 },
  bytes: { total: 900, music: 600, jingle: 0, effect: 0, cry: 300 },
  unconverted: [{ kind: "effect", id: 1500, name: "SEQ_SE_X", reason: "banco 3 ausente" }],
  missingCries: [],
  fallbackCries: [{ species: 487, form: 1 }],
  missingForMaps: [{ map: 4, field: "musicDay", id: 1999 }],
  missingForScripts: [{ file: 842, command: "PlayBGM", id: 1998 }],
  loopless: [1016],
  ...extra,
});

const parse = (kind: "audio-index" | "audio-report", value: unknown) => parseAudioJson(kind, JSON.stringify(value), `${kind}.json`);

describe("audio schemas", () => {
  it.each([
    ["audio-index", index()],
    ["audio-report", report()],
  ] as const)("accepts a valid %s file", (kind, value) => {
    expect(parse(kind, value).ok).toBe(true);
  });

  it("accepts a track without a loop and a cry of a form", () => {
    expect(parse("audio-index", index({ tracks: [track({ loop: null })], cries: [cry(), cry({ species: 492, form: 1, bank: 494, file: "cry/492-1.wav" })] })).ok).toBe(true);
  });

  it("round-trips through serialize with a trailing newline", () => {
    const text = serializeAudioFile("audio-index", index() as never);
    expect(text.endsWith("\n")).toBe(true);
    expect(parseAudioJson("audio-index", text, "index.json").ok).toBe(true);
  });

  it.each([
    ["missing formatVersion", "audio-index", Object.fromEntries(Object.entries(index()).filter(([key]) => key !== "formatVersion")), "formatVersion"],
    ["repeated track ids", "audio-index", index({ tracks: [track(), track()] }), "tracks.1.id"],
    ["tracks out of order", "audio-index", index({ tracks: [track(), track({ id: 1000, file: "music/1000.wav" })] }), "tracks.1.id"],
    ["loop start not before end", "audio-index", index({ tracks: [track({ loop: { start: 500, end: 500 } })] }), "tracks.0.loop"],
    ["loop end past the samples", "audio-index", index({ tracks: [track({ loop: { start: 0, end: 1001 } })] }), "tracks.0.loop"],
    ["three channels", "audio-index", index({ tracks: [track({ channels: 3 })] }), "tracks.0.channels"],
    ["file that does not match kind and id", "audio-index", index({ tracks: [track({ file: "effect/1004.wav" })] }), "tracks.0.file"],
    ["species outside 1 to 493", "audio-index", index({ cries: [cry({ species: 494, file: "cry/494.wav" })] }), "cries.0.species"],
    ["repeated cry", "audio-index", index({ cries: [cry(), cry()] }), "cries.1"],
    ["cry file that does not match species and form", "audio-index", index({ cries: [cry({ file: "cry/25.wav" })] }), "cries.0.file"],
    ["wrong sample rate", "audio-index", index({ sampleRate: 44100 }), "sampleRate"],
    ["unknown map field", "audio-report", report({ missingForMaps: [{ map: 4, field: "musicDusk", id: 1 }] }), "missingForMaps.0.field"],
  ] as const)("reports file, field path and problem: %s", (_name, kind, value, path) => {
    const result = parse(kind, value);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.file).toBe(`${kind}.json`);
      expect(result.error.path).toBe(path);
      expect(result.error.problem.length).toBeGreaterThan(0);
    }
  });
});
