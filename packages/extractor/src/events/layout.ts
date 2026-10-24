// Where events, scripts, encounters and trainers live in the accepted ROM, and the fixed tables the
// game keeps in code. The ROM is locked by hash (003), so everything here is fixed.
// See specs/008-events-scripts-encounters/research.md R0.

/** NARC paths relative to the `narc` output of `rom-unpack`. */
export const EVENT_ARCHIVES = {
  scripts: "a/0/1/2",
  events: "a/0/3/2",
  encounters: "a/0/3/7",
  trainerData: "a/0/5/5",
  trainerTeams: "a/0/5/6",
} as const;

/** Map header: the level script ("script header") bank is the u16 at +8 of each 24-byte entry. */
export const LEVEL_SCRIPT_FIELD = 8;

/** The script id ranges the game resolves to shared script files, highest first; the first match wins. */
export const SCRIPT_BANKS: readonly { lo: number; file: number; messageBank: number }[] = [
  { lo: 10490, file: 263, messageBank: 433 },
  { lo: 10450, file: 264, messageBank: 19 },
  { lo: 10440, file: 2, messageBank: 748 },
  { lo: 10400, file: 151, messageBank: 246 },
  { lo: 10350, file: 952, messageBank: 726 },
  { lo: 10300, file: 734, messageBank: 444 },
  { lo: 10200, file: 144, messageBank: 209 },
  { lo: 10150, file: 955, messageBank: 732 },
  { lo: 10100, file: 954, messageBank: 733 },
  { lo: 10000, file: 146, messageBank: 211 },
  { lo: 9950, file: 148, messageBank: 666 },
  { lo: 9900, file: 136, messageBank: 40 },
  { lo: 9850, file: 167, messageBank: 312 },
  { lo: 9800, file: 166, messageBank: 43 },
  { lo: 9700, file: 163, messageBank: 266 },
  { lo: 9600, file: 149, messageBank: 40 },
  { lo: 9500, file: 265, messageBank: 439 },
  { lo: 9300, file: 143, messageBank: 204 },
  { lo: 9200, file: 164, messageBank: 267 },
  { lo: 9100, file: 0, messageBank: 14 },
  { lo: 9000, file: 4, messageBank: 46 },
  { lo: 8900, file: 165, messageBank: 268 },
  { lo: 8800, file: 262, messageBank: 427 },
  { lo: 8000, file: 145, messageBank: 210 },
  { lo: 7000, file: 141, messageBank: 199 },
  { lo: 5000, file: 953, messageBank: 40 },
  { lo: 3000, file: 953, messageBank: 40 },
  { lo: 2800, file: 150, messageBank: 23 },
  { lo: 2500, file: 1, messageBank: 20 },
  { lo: 2000, file: 3, messageBank: 40 },
];

/** Script id 0 runs the first script of this file. */
export const ZERO_SCRIPT = { file: 140, messageBank: 184 } as const;

/** Script ids 3000 to 4999 and 5000 to 6999 are trainer scripts; the id minus the base is trainer - 1. */
export const TRAINER_SCRIPTS = [
  { lo: 3000, hi: 4999 },
  { lo: 5000, hi: 6999 },
] as const;

/** Message banks of the trainer names and the trainer class names. */
export const TRAINER_NAME_BANK = 729;
export const TRAINER_CLASS_BANK = 730;

/** Level script types (init_script_types.h). */
export const LEVEL_SCRIPT = { frameTable: 1, onTransition: 2, onResume: 3, onLoad: 4 } as const;

/** Script arguments from this value up name a variable, not a value (vars.h: VAR_BASE). */
export const VAR_BASE = 0x4000;

/** Script id that means no script. */
export const NO_SCRIPT = 0xffff;

/** The end of a movement sequence and of a script table. */
export const MOVEMENT_END = 254;
export const SCRIPT_TABLE_END = 0xfd13;

/**
 * Chance of each slot in percent, in slot order. The game does not store these as tables: they are
 * the thresholds of the slot roll in its encounter code (encounter_check.c), written here once.
 */
export const SLOT_CHANCES = {
  land: [20, 20, 10, 10, 10, 10, 5, 5, 4, 4, 1, 1],
  surf: [60, 30, 5, 4, 1],
  fishing: [40, 30, 15, 10, 5],
  rockSmash: [80, 20],
  headbutt: [50, 15, 15, 10, 5, 5],
} as const;

/** Headbutt tables: one member per map id. */
export const HEADBUTT_ARCHIVE = "a/2/5/2";
