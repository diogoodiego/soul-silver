// content/audio/cues.json: which extracted track plays at each moment, and the mix parameters.
// See specs/018-game-audio/contracts/audio-cues.md.
import { z } from "zod";
import { GAME_DATA_FORMAT_VERSION, int } from "../game-data/common.ts";
import { createGameDataCodec } from "../game-data/parse.ts";
import type { AudioIndexFile, Track } from "./schemas.ts";

export const EFFECT_CUES = [
  "hit",
  "hit-super",
  "hit-weak",
  "faint",
  "ball-throw",
  "ball-shake",
  "ball-catch",
  "ball-escape",
  "door",
  "warp",
  "level-up",
  "evolution",
  "menu-cursor",
  "menu-confirm",
  "menu-cancel",
] as const;
export type EffectCue = (typeof EFFECT_CUES)[number];

const name = () => z.string().min(1);

export const audioCuesFile = z.strictObject({
  kind: z.literal("audio-cues"),
  formatVersion: z.literal(GAME_DATA_FORMAT_VERSION),
  music: z.strictObject({
    title: name(),
    wildBattle: name(),
    victory: name(),
    // Spec 022: battle music by trainer class, and the fanfares after a trainer and after a Gym Leader.
    trainerBattle: name(),
    rivalBattle: name(),
    leaderBattle: name(),
    rocketBattle: name(),
    championBattle: name(),
    trainerVictory: name(),
    leaderVictory: name(),
    // Spec 025: while riding the bicycle.
    bicycle: name(),
  }),
  effects: z.strictObject(Object.fromEntries(EFFECT_CUES.map((c) => [c, name()])) as Record<EffectCue, ReturnType<typeof name>>),
  archetypes: z.record(z.string(), name()),
  defaultMove: name(),
  mix: z.strictObject({
    crossfadeMs: int(0, 5000),
    rangeTiles: int(1, 64),
    maxVoices: int(4, 64),
    faintCryRate: z.number().min(0.5).max(1),
  }),
});
export type AudioCues = z.infer<typeof audioCuesFile>;

const codec = createGameDataCodec({ "audio-cues": audioCuesFile });
export const parseAudioCues = (value: unknown, file: string) => codec.parseGameDataFile("audio-cues", value, file);

export const trackByName = (index: AudioIndexFile): Map<string, Track> => new Map(index.tracks.map((t) => [t.name, t]));

/** The move's own sound (`SEQ_SE_<GS|DP|PL>_W<move id>` in the extraction), else its archetype's, else the default. */
export function moveSound(cues: AudioCues, has: (name: string) => boolean, move: number, archetype: string): string {
  const w = `W${String(move).padStart(3, "0")}`;
  return ["GS", "DP", "PL"].map((v) => `SEQ_SE_${v}_${w}`).find(has) ?? cues.archetypes[archetype] ?? cues.defaultMove;
}
