// Where the sound archive lives in the accepted ROM and how the game names and picks its parts.
// See specs/009-audio-extraction/research.md R0.

/** POSIX path inside the `filesystem` output of `rom-unpack`. */
export const SOUND_ARCHIVE = "data/sound/gs_sound_data.sdat";

/** Sequence the game plays every cry with; the species picks the bank (PlayCry in the game code). */
export const CRY_SEQUENCE = 2;

/** Bank of the Shaymin Sky Forme cry; every other species and form uses bank = species. */
export const SHAYMIN = 492;
export const SHAYMIN_SKY_BANK = 494;

/** Sequences 1..3 are the cry sequences, played with each species' bank, not tracks of their own. */
export const CRY_SEQUENCES = new Set([1, 2, 3]);

/** Markers at the end of the music and effect lists: a held placeholder note, not a track. */
export const MARKER_NAMES = new Set(["SEQ_BGM_END", "SEQ_SE_END"]);

/** Kind of a track by its sequence name: effects SEQ_SE_*, jingles SEQ_ME_*, anything else music. */
export function trackKind(name: string): "music" | "jingle" | "effect" {
  if (name.startsWith("SEQ_SE_")) return "effect";
  if (name.startsWith("SEQ_ME_")) return "jingle";
  return "music";
}

/** Script commands that name a track or a cry, and the argument that holds it. */
export const SCRIPT_SOUND_ARGS: Readonly<Record<string, string>> = {
  PlaySE: "arg0",
  PlayFanfare: "fanfare",
  PlayBGM: "bgm",
  TempBGM: "arg0",
  PlayCry: "arg0",
};
