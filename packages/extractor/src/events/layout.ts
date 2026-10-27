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

// Script id tables the server needs too live in shared (spec 020).
export { NO_SCRIPT, SCRIPT_BANKS, TRAINER_SCRIPTS, VAR_BASE } from "@soulsilver/shared/events";

/** Script id 0 runs the first script of this file. */
export const ZERO_SCRIPT = { file: 140, messageBank: 184 } as const;

/** Message banks of the trainer names and the trainer class names. */
export const TRAINER_NAME_BANK = 729;
export const TRAINER_CLASS_BANK = 730;

/** Level script types (init_script_types.h). */
export const LEVEL_SCRIPT = { frameTable: 1, onTransition: 2, onResume: 3, onLoad: 4 } as const;

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
