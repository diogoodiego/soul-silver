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

/** Message banks of the trainer lines, the trainer names and the trainer class names. */
export const TRAINER_MESSAGE_BANK = 728;
export const TRAINER_NAME_BANK = 729;
export const TRAINER_CLASS_BANK = 730;

/** Trainer classes, and where their tables live (spec 022; checked against the US ROM and pret/pokeheartgold). */
export const TRAINER_CLASS_COUNT = 129;
export const TRAINER_MESSAGES = { narc: "a/0/5/7", member: 0 } as const;
/** sPrizeMoneyTbl, 0x0226C4C4 in RAM. */
export const PRIZE_TABLE = { overlay: 12, offset: 0x34c04 } as const;
/** The class list at 0x020FC3CA and the (transition, sequence) list after it, offsets in ARM9. */
export const CLASS_MUSIC = { classes: 0xfc3ca, list: 0xfc40a, classCount: 32, listCount: 45 } as const;

/**
 * Poké Mart tables in ARM9 (spec 023): sNormalMartItems at 0x020FBF22 (19 pairs), the special mart
 * pointer table at 0x0210FA3C (30 lists), and MartBuy's badge count → rank switch (0x020480B2).
 */
/** New game (spec 024, research R1/R3): sLocation_PlayerRoom in ARM9, _std_init, ov01_022067C8. */
export const NEW_GAME_LOCATION = 0xfa17c;
export const INIT_SCRIPT = 9600;
export const STD_MESSAGES = { overlay: 1, offset: 0x20ec8, count: 4 } as const;
/** Fly destinations (spec 025, research R1): sSpawnMaps in ARM9, 30 records of 18 bytes. */
export const FLY_POINTS = { offset: 0xf9e80, count: 30 } as const;
export const SHOPS ={ normal: 0xfbf22, normalCount: 19, special: 0x10fa3c, specialCount: 30, badgeRank: [1, 2, 2, 3, 3, 4, 4, 5, 6] } as const;

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
