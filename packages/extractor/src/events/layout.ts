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
/**
 * The phone book (spec 026, research R7): tel/pmtel_book.dat, sPhoneMessageGmm (75 u16, ARM9),
 * gPhoneCallScriptDef (PHONE_SCRIPT_000 to 455, overlay 101), sGenericPhoneCallHeaders (75 × 16, overlay 101, after
 * the 96 bytes of sGreetingMsgIDs) and sTrainerRematchSets (63 rows, overlay 26).
 * Found by signature in the US ROM and checked against Joey (contact 10, script 33, row 6).
 */
export const PHONE = { book: "tel/pmtel_book.dat", banks: { offset: 1082492 }, scripts: { overlay: 101, offset: 70716, count: 456 }, headers: { offset: 73548 }, greetings: { offset: 73452 }, rematch: { overlay: 26, offset: 524, count: 63 } } as const;
/**
 * The Azalea Gym's Spinarak threads (spec 030.5): overlay 4 loads at 0x02253E20; the stops at 0x022575D4,
 * the per-stop route pointers at 0x022575A4. The spiders' first stops are InitAzaleaGym's (gymmick_init.c).
 */
export const AZALEA_GYM = {
  map: 180,
  overlay: 4,
  base: 0x02253e20,
  stations: 0x37b4,
  routes: 0x3784,
  count: 12,
  spiders: [0, 1, 2, 7],
  /** The buildings each lever animates (AzaleaGymSwitch, 0x02254404): gym02rope_2 and gym02switch for lever 0, gym02rope_1 and gym02switch_r for lever 1. */
  levers: { 116: 0, 117: 0, 115: 1, 122: 1 },
} as const;
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
/** Rock Smash items per map (spec 025): u16 odds and u16 item list, rock_smash_item.c. */
export const ROCK_SMASH_ARCHIVE = "a/2/5/3";

/** Spec 027: sHiddenItemParam (8-byte records: u16 item, u8 count, 3 zero bytes, u16 script − 8000), found in the US ROM. */
export const HIDDEN_ITEMS = { offset: 0xfa558, count: 231 } as const;
/** Spec 027: the colour of each apricorn tree (one byte, 0 red … 6 black), read by ApricornTreeGetApricorn. */
export const APRICORN_TREES = { offset: 0x108413, count: 31 } as const;
/** Spec 027: berry data, 64 records of 12 bytes; byte 4 is the hours each growth stage takes. */
export const BERRY_DATA = "a/0/6/6";
/** Item 030.10: the in-game trades (NPCTrade, npc_trade.c), and the bank of their nicknames and trainers' names (msg_0200). */
export const NPC_TRADES = { narc: "a/1/1/2", namesBank: 200 } as const;
