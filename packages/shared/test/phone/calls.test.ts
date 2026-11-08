import { describe, expect, it } from "vitest";
import { createRng } from "../../src/game/rng.ts";
import { callDue, CALL_MIN_STEPS, pickCallScript, type CallState } from "../../src/phone/calls.ts";
import type { PhoneContact } from "../../src/phone/schemas.ts";

// Spec 026, T032 (research R7.3, overlay_2_gear_phone.c ov02_02251F20 and ov02_02251FDC): from 10 steps on,
// each step rolls MTRandom() % 100 <= 50; a hit draws the tier (LCRandom() % 1000: < 500 tier 0, < 800 tier 1,
// else 2), then one registered contact of that tier and of type 0, 10, 11, 12 or 14, not on the player's map
// and not called yet this round; the round restarts when the whole tier has called.

const contact = (id: number, over: Partial<PhoneContact> = {}): PhoneContact => ({ id, type: 0, trainerClass: 0, trainer: 0, map: 100 + id, gift: 0, localScript: 0, rematchWeekday: 7, rematchTime: 3, tier: 0, greeting: 255, bank: 640, outgoing: [], incoming: [], ...over });
const BOOK = [contact(10), contact(11), contact(12, { tier: 1 }), contact(13, { type: 2 }), contact(14, { type: 14 }), contact(15, { tier: 2 })];
/** Draws in order: the step roll, the tier roll, then the pick. */
const rolls = (...values: number[]) => ({ nextInt: (n: number) => Math.min(values.shift() ?? 0, n - 1) });
const state = (over: Partial<CallState> = {}): CallState => ({ steps: CALL_MIN_STEPS, contacts: [10, 11, 12, 13, 14, 15], called: [], pending: [], ...over });

describe("callDue", () => {
  it("never calls before 10 steps, and keeps counting", () => {
    expect(callDue(state({ steps: 9 }), BOOK, 1, rolls(0, 0, 0))).toEqual({ steps: 9, called: [] });
  });

  it("from 10 steps a roll above 50 starts the count again", () => {
    expect(callDue(state(), BOOK, 1, rolls(51))).toEqual({ steps: 0, called: [] });
  });

  it("a roll of 50 or less calls a contact of the drawn tier", () => {
    expect(callDue(state(), BOOK, 1, rolls(50, 499, 0))).toEqual({ call: { caller: 10, tier: 0 }, steps: 0, called: [10] });
    expect(callDue(state(), BOOK, 1, rolls(0, 500, 0))).toMatchObject({ call: { caller: 12, tier: 1 } });
    expect(callDue(state(), BOOK, 1, rolls(0, 800, 0))).toMatchObject({ call: { caller: 15, tier: 2 } });
  });

  it("only draws registered contacts of the random-call types", () => {
    // Tier 0 is 10, 11 and 14 (type 14); 13 is type 2 (a professor) and never rings on its own.
    const picks = [0, 1, 2].map((pick) => callDue(state(), BOOK, 1, rolls(0, 0, pick)).call?.caller);
    expect(picks).toEqual([10, 11, 14]);
    expect(callDue(state({ contacts: [13, 12] }), BOOK, 1, rolls(0, 0, 0))).toEqual({ steps: 0, called: [] });
  });

  it("leaves out the contact on the player's map and the ones who called this round", () => {
    expect(callDue(state({ called: [10] }), BOOK, 111, rolls(0, 0, 0)).call?.caller).toBe(14);
    expect(callDue(state({ called: [10, 11] }), BOOK, 114, rolls(0, 0, 0))).toEqual({ steps: 0, called: [10, 11] });
  });

  it("starts the tier's round again once all of it called", () => {
    expect(callDue(state({ called: [10, 11, 14, 12] }), BOOK, 1, rolls(0, 0, 0))).toEqual({ call: { caller: 10, tier: 0 }, steps: 0, called: [12, 10] });
  });

  it("a story call waiting comes first, without the step roll", () => {
    expect(callDue(state({ pending: [{ caller: 1, call: 2 }] }), BOOK, 1, rolls(99))).toEqual({ call: { caller: 1, story: 2 }, steps: 0, called: [] });
    // In the order they came (FR-011), not drawn among them as the original's call triggers are.
    expect(callDue(state({ pending: [{ caller: 1, call: 2 }, { caller: 2, call: 5 }] }), BOOK, 1, rolls(1)).call).toEqual({ caller: 1, story: 2 });
    // Not while the caller is on the same map (ov02_02252218).
    expect(callDue(state({ pending: [{ caller: 10, call: 2 }] }), BOOK, 110, rolls(99)).call).toBeUndefined();
  });

  it("is the same for the same seed", () => {
    const run = (rng = createRng(7)) => Array.from({ length: 50 }, () => callDue(state(), BOOK, 1, rng).call?.caller);
    expect(run()).toEqual(run());
  });
});

// phone_scripts_generic.c: each header's condition, then rollPercentChance (MTRandom() % 100 <= chance); when none
// passes, the last header tried plays. Joey's incoming list (PHONE_CONTACT_JOEY/2) and outgoing list (/1).
describe("pickCallScript", () => {
  const JOEY_IN = [
    { type: 2, chance: 60, scriptType: 0, script: 33 },
    { type: 1, chance: 40, scriptType: 1, script: 30 },
    { type: 1, chance: 40, scriptType: 1, script: 31 },
    { type: 1, chance: 100, scriptType: 1, script: 32 },
  ];
  const JOEY_OUT = [
    { type: 7, chance: 100, scriptType: 0, script: 34 },
    { type: 3, chance: 100, scriptType: 0, script: 33 },
    { type: 1, chance: 100, scriptType: 1, script: 35 },
  ];
  const REMATCH = new Set([33]);
  const joey = contact(10, { rematchWeekday: 1, rematchTime: 1 });
  const ctx = (over: Partial<Parameters<typeof pickCallScript>[1]> = {}) => ({ contact: joey, seeking: false, radioTower: false, weekday: 1, band: 1, isRematch: (s: number) => REMATCH.has(s), ...over });

  it("before the Radio Tower Joey's call never asks for a rematch, and only chats", () => {
    expect(pickCallScript(JOEY_IN, ctx(), rolls(0, 0))).toBe(30);
    expect(pickCallScript(JOEY_IN, ctx(), rolls(41, 0))).toBe(31);
    expect(pickCallScript(JOEY_IN, ctx(), rolls(41, 41, 99))).toBe(32);
  });

  it("after it, 60% of his calls ask for the rematch, unless he already does", () => {
    expect(pickCallScript(JOEY_IN, ctx({ radioTower: true }), rolls(60))).toBe(33);
    expect(pickCallScript(JOEY_IN, ctx({ radioTower: true }), rolls(61, 0))).toBe(30);
    expect(pickCallScript(JOEY_IN, ctx({ radioTower: true, seeking: true }), rolls(0, 0))).toBe(30);
  });

  it("calling him: the rematch on his day and time only, the fight reminder while he seeks one", () => {
    expect(pickCallScript(JOEY_OUT, ctx({ radioTower: true }), rolls(0))).toBe(33);
    expect(pickCallScript(JOEY_OUT, ctx({ radioTower: true, weekday: 2 }), rolls(0))).toBe(35);
    expect(pickCallScript(JOEY_OUT, ctx({ radioTower: true, band: 2 }), rolls(0))).toBe(35);
    expect(pickCallScript(JOEY_OUT, ctx({ radioTower: true, seeking: true }), rolls(0))).toBe(34);
  });

  it("an empty list plays nothing", () => {
    expect(pickCallScript([], ctx(), rolls(0))).toBeUndefined();
  });
});
