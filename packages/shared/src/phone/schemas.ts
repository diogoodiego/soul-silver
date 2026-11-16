import { z } from "zod";
import { int } from "../game-data/common.ts";
import { createGameDataCodec } from "../game-data/parse.ts";

// The phone book (spec 026, research R7), extracted: the contacts of tel/pmtel_book.dat, the call
// scripts of overlay 101 (phone_script_defs.c) and the rematch sets of overlay 26.

/** PHONE_CONTACT_* run 0–74 (constants/phone_contacts.h). */
export const PHONE_CONTACT_MAX = 74;
/** RTC_WEEK_MAX: the contact has no rematch day. */
export const NO_WEEKDAY = 7;
/** TIMEOFDAY_WILD_MAX: the contact has no rematch time. */
export const NO_TIME = 3;
/** unkC 0xFF: the contact's calls open with no greeting. */
export const NO_GREETING = 0xff;
/** sGreetingMsgIDs' bank (msg_0640). */
export const GREETING_BANK = 640;

const u8 = () => int(0, 0xff);
const u16 = () => int(0, 0xffff);

/**
 * A line of sGenericPhoneCallHeaders (phone_generic_headers.c): the script a call plays when `type`'s condition
 * and the `chance` roll pass (phone_scripts_generic.c). PHONECALLGENERIC_* 1 to 8; the table's NIL and NONE end it.
 */
const callHeader = z.strictObject({ type: int(1, 8), chance: int(0, 100), scriptType: u16(), script: u16() });
export type CallHeader = z.infer<typeof callHeader>;

const contact = z.strictObject({
  id: int(0, PHONE_CONTACT_MAX),
  type: u8(),
  trainerClass: u8(),
  /** Base trainer id; 0 for people who are not trainers. */
  trainer: u16(),
  map: u16(),
  gift: u16(),
  /** The script of a call made while both are on the same map. */
  localScript: u16(),
  /** 0 Sunday … 6, or NO_WEEKDAY. */
  rematchWeekday: int(0, NO_WEEKDAY),
  /** 0 morning, 1 day, 2 night, or NO_TIME. */
  rematchTime: int(0, NO_TIME),
  /** Which random-call draw the contact is in (unkF: 0, 1 or 2; others are never drawn). */
  tier: u8(),
  /** Their row of greetings (unkC, PhoneCall_PrintGreeting); NO_GREETING for none. */
  greeting: u8(),
  /** The contact's message bank (sPhoneMessageGmm). */
  bank: u16(),
  /** The scripts a call to them (outgoing) and from them (incoming) can play, in order. */
  outgoing: z.array(callHeader).max(8),
  incoming: z.array(callHeader).max(8),
});

/** PHONESCRIPTTYPE_REMATCH: the call makes the trainer seek a rematch. */
export const SCRIPT_REMATCH = 3;

const script = z.strictObject({
  /** PHONE_SCRIPT_*; the table's entry 0 is empty and left out. */
  id: int(1, 0xffff),
  /** Male and female player: message indices in the calling contact's bank (GetPhoneMessageGmm). */
  lines: z.tuple([u8(), u8()]),
  /** PHONESCRIPTTYPE_* (4 bits): what the call does besides talking (rematch, gift…). */
  type: int(0, 15),
  /** 12 bits. */
  param0: int(0, 0xfff),
  param1: u16(),
});

/** TRAINER_NONE ends a rematch sequence; 0xFFFF is a skipped step (overlay_26_022598C0.c). */
export const REMATCH_NONE = 0;
export const REMATCH_SKIP = 0xffff;

const rematchSet = z.strictObject({
  /** The trainer id scripts pass (sTrainerRematchSets[i][0]). */
  base: u16(),
  /** Columns 1 to 5: the trainer of each rematch step; column 1 is the first fight. */
  sequence: z.tuple([u16(), u16(), u16(), u16(), u16()]),
});

export const phoneBook = z.strictObject({
  contacts: z.array(contact).refine((l) => new Set(l.map((c) => c.id)).size === l.length, "contato repetido"),
  scripts: z.array(script).refine((l) => new Set(l.map((s) => s.id)).size === l.length, "roteiro repetido"),
  rematchSets: z.array(rematchSet),
  /**
   * sGreetingMsgIDs: per row 12 message ids of GREETING_BANK, outgoing then incoming, morning, day and night,
   * each a male and female pair (phone_generic_headers.c).
   */
  greetings: z.array(z.array(u8()).length(12)),
});
export type PhoneBook = z.infer<typeof phoneBook>;
export type PhoneContact = z.infer<typeof contact>;
export type PhoneScript = z.infer<typeof script>;

/**
 * The calls scripts place (SetPhoneCall with isScriptedCall 2), hand-written: by caller, the PHONE_SCRIPT of each
 * index (phone_scripts_prof_elm.c sPhoneCallData_ProfElm_MapScripts; phone_scripts_prof_oak.c, always 082; Baoba (24) index 0 is 141, the Safari Zone opening, item 032.1; Mom's is 0, PHONE_SCRIPT_NONE: her savings flow, phone_scripts_mother.c). Ids only.
 */
export const scriptedCalls = z.strictObject({
  calls: z.array(z.strictObject({ caller: int(0, PHONE_CONTACT_MAX), scripts: z.array(int(0, 0xffff)).min(1) })).refine((l) => new Set(l.map((c) => c.caller)).size === l.length, "contato repetido"),
});
export type ScriptedCalls = z.infer<typeof scriptedCalls>;

/**
 * The script a call to a special caller plays (spec 026), hand-written from their own rules: Prof. Elm
 * (phone_scripts_prof_elm.c PhoneCall_GetScriptId_ProfElm) and Mom (phone_scripts_mother.c). The first rule
 * that holds wins: `local` on the caller's map, `unless` a flag is set, `if` it is set, or always; `scripts`
 * is drawn among (LCRandom), and empty for a call not ported yet; 0 is PHONE_SCRIPT_NONE, the caller's own flow (Mom's savings). Ids and flags only, up to Violet City.
 */
const callerRule = z.strictObject({ local: z.literal(true).optional(), unless: int(0, 0xffff).optional(), if: int(0, 0xffff).optional(), scripts: z.array(int(0, 0xffff)) });
export const phoneCallers = z.strictObject({
  callers: z.array(z.strictObject({ caller: int(0, PHONE_CONTACT_MAX), outgoing: z.array(callerRule).min(1) })).refine((l) => new Set(l.map((c) => c.caller)).size === l.length, "contato repetido"),
});
export type PhoneCallers = z.infer<typeof phoneCallers>;

export const PHONE_FORMAT_VERSION = 1;

export const phoneSchemas = {
  phone: z.strictObject({ kind: z.literal("phone"), formatVersion: z.literal(PHONE_FORMAT_VERSION), value: phoneBook }),
  "phone-callers": z.strictObject({ kind: z.literal("phone-callers"), formatVersion: z.literal(PHONE_FORMAT_VERSION), value: phoneCallers }),
  "phone-scripted-calls": z.strictObject({ kind: z.literal("phone-scripted-calls"), formatVersion: z.literal(PHONE_FORMAT_VERSION), value: scriptedCalls }),
} as const;

const codec = createGameDataCodec(phoneSchemas);
export const parsePhoneFile = codec.parseGameDataFile;
export const serializePhoneFile = codec.serializeGameDataFile;
