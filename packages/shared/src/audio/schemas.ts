// Audio files: audio-index and audio-report. See specs/009-audio-extraction/data-model.md.
// Same envelope and codec as the game data (feature 004).
import { z } from "zod";
import { GAME_DATA_FORMAT_VERSION, id, int } from "../game-data/common.ts";
import { createGameDataCodec } from "../game-data/parse.ts";

/** Version of the audio file format; bumped when an audio schema changes. */
export const AUDIO_FORMAT_VERSION = GAME_DATA_FORMAT_VERSION;

/** Every WAV the extractor writes uses this rate. */
export const AUDIO_SAMPLE_RATE = 32000;

export const TRACK_KINDS = ["music", "jingle", "effect"] as const;
export type TrackKind = (typeof TRACK_KINDS)[number];

const pad = (n: number, width: number) => String(n).padStart(width, "0");

/** Where a track lives: `<kind>/<id>.wav`, id in 4 digits. */
export const trackFile = (kind: TrackKind, trackId: number) => `${kind}/${pad(trackId, 4)}.wav`;

/** Where a cry lives: `cry/<species>.wav`, or `cry/<species>-<form>.wav` for a form. */
export const cryFile = (species: number, form: number) => `cry/${pad(species, 3)}${form === 0 ? "" : `-${form}`}.wav`;

const channels = z.union([z.literal(1), z.literal(2)]);

const loop = z.strictObject({ start: id(), end: id() });

const track = z
  .strictObject({
    id: id(),
    name: z.string().min(1),
    kind: z.enum(TRACK_KINDS),
    file: z.string(),
    channels,
    samples: int(1, Number.MAX_SAFE_INTEGER),
    /** Plays 0..end once, then start..end forever; null when the original does not repeat. */
    loop: loop.nullable(),
    bytes: id(),
  })
  .superRefine((t, ctx) => {
    if (t.file !== trackFile(t.kind, t.id)) ctx.addIssue({ code: "custom", path: ["file"], message: `esperado "${trackFile(t.kind, t.id)}"` });
    if (t.loop && !(t.loop.start < t.loop.end && t.loop.end <= t.samples)) {
      ctx.addIssue({ code: "custom", path: ["loop"], message: `esperado 0 ≤ start < end ≤ samples (${t.samples})` });
    }
  });
export type Track = z.infer<typeof track>;
export type LoopPoints = z.infer<typeof loop>;

const cry = z
  .strictObject({
    species: int(1, 493),
    form: id(),
    bank: id(),
    file: z.string(),
    channels,
    samples: int(1, Number.MAX_SAFE_INTEGER),
    bytes: id(),
  })
  .superRefine((c, ctx) => {
    if (c.file !== cryFile(c.species, c.form)) ctx.addIssue({ code: "custom", path: ["file"], message: `esperado "${cryFile(c.species, c.form)}"` });
  });
export type Cry = z.infer<typeof cry>;

export const audioIndexFile = z
  .strictObject({
    kind: z.literal("audio-index"),
    formatVersion: z.literal(AUDIO_FORMAT_VERSION),
    sampleRate: z.literal(AUDIO_SAMPLE_RATE),
    tracks: z.array(track),
    cries: z.array(cry),
  })
  .superRefine((file, ctx) => {
    file.tracks.forEach((t, i) => {
      if (i > 0 && t.id <= file.tracks[i - 1]!.id) ctx.addIssue({ code: "custom", path: ["tracks", i, "id"], message: "faixas fora de ordem ou repetidas (os ids devem crescer)" });
    });
    file.cries.forEach((c, i) => {
      const prev = file.cries[i - 1];
      if (prev && (c.species < prev.species || (c.species === prev.species && c.form <= prev.form))) {
        ctx.addIssue({ code: "custom", path: ["cries", i], message: "cries fora de ordem ou repetidos (espécie e forma devem crescer)" });
      }
    });
  });
export type AudioIndexFile = z.infer<typeof audioIndexFile>;

const perKind = () => z.strictObject({ music: id(), jingle: id(), effect: id(), cry: id() });

export const audioReportFile = z.strictObject({
  kind: z.literal("audio-report"),
  formatVersion: z.literal(AUDIO_FORMAT_VERSION),
  /** False when a cry was lost or more than 2% of the other tracks were lost. */
  ok: z.boolean(),
  counts: perKind(),
  bytes: perKind().extend({ total: id() }),
  unconverted: z.array(z.strictObject({ kind: z.enum([...TRACK_KINDS, "cry"]), id: id(), name: z.string(), reason: z.string().min(1) })),
  missingCries: z.array(z.strictObject({ species: int(1, 493), reason: z.string().min(1) })),
  /** Forms the original does not tell apart: whoever asks for them gets form 0. */
  fallbackCries: z.array(z.strictObject({ species: int(1, 493), form: id() })),
  missingForMaps: z.array(z.strictObject({ map: id(), field: z.enum(["musicDay", "musicNight"]), id: id() })),
  missingForScripts: z.array(z.strictObject({ file: id(), command: z.string(), id: id() })),
  /** Music the original plays once instead of repeating. */
  loopless: z.array(id()),
});
export type AudioReportFile = z.infer<typeof audioReportFile>;

const codec = createGameDataCodec({ "audio-index": audioIndexFile, "audio-report": audioReportFile });

export type AudioFileKind = "audio-index" | "audio-report";
export const parseAudioFile = codec.parseGameDataFile;
export const parseAudioJson = codec.parseGameDataJson;
export const serializeAudioFile = codec.serializeGameDataFile;
