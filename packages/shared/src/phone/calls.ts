import type { CallHeader, PhoneContact } from "./schemas.ts";

// When the Pokégear rings on its own (spec 026, research R7.3), after overlay_2_gear_phone.c:
// ov02_02251F20 (the step count and the roll), ov02_02252218 (story calls first) and ov02_02251FDC
// (the tier, then a contact of it). The server counts the player's tile steps and calls this on each.

/** unk_varC: the steps before any call. */
export const CALL_MIN_STEPS = 10;
/** unk_var12: a roll of MTRandom() % 100 up to this rings. */
export const CALL_CHANCE = 50;
/** PhoneBookEntry types that ring on their own: trainers (0) and the others the original lists. */
const RANDOM_TYPES = new Set([0, 10, 11, 12, 14]);

export interface CallState {
  steps: number;
  /** Registered contacts, in the order they were registered. */
  contacts: readonly number[];
  /** Who called this round (sub_0202AA44); a tier's part is cleared once all of it called. */
  called: readonly number[];
  /** Story calls waiting (call triggers), oldest first: the caller and the PHONE_SCRIPT. */
  pending: readonly { caller: number; call: number }[];
}

export type DueCall = { caller: number; tier: number } | { caller: number; story: number };

export interface CallResult {
  call?: DueCall;
  steps: number;
  called: number[];
}

export function callDue(state: CallState, book: readonly PhoneContact[], map: number, rng: { nextInt(n: number): number }): CallResult {
  const called = [...state.called];
  if (state.steps < CALL_MIN_STEPS) return { steps: state.steps, called };
  const entry = (id: number) => book.find((c) => c.id === id);
  // shortcut: the Day-Care man's exception (he rings from his own map) is left out; no stretch reaches him.
  const story = state.pending.filter((p) => entry(p.caller)?.map !== map);
  // In the order they came (spec 026, FR-011); the original draws among its call triggers (ov02_02252218).
  if (story.length) {
    const p = story[0]!;
    return { call: { caller: p.caller, story: p.call }, steps: 0, called };
  }
  if (rng.nextInt(100) > CALL_CHANCE) return { steps: 0, called };
  const roll = rng.nextInt(1000);
  const tier = roll < 500 ? 0 : roll < 800 ? 1 : 2;
  const inTier = state.contacts.filter((id) => {
    const c = entry(id);
    return c?.tier === tier && RANDOM_TYPES.has(c.type);
  });
  if (!inTier.length) return { steps: 0, called };
  const round = inTier.every((id) => called.includes(id)) ? called.filter((id) => !inTier.includes(id)) : called;
  // shortcut: Buena's late-night rule and the Bug-Catching Contest's are left out; neither is in this spec's stretch.
  const free = inTier.filter((id) => entry(id)!.map !== map && !round.includes(id));
  if (!free.length) return { steps: 0, called: round };
  const caller = free[rng.nextInt(free.length)]!;
  return { call: { caller, tier }, steps: 0, called: [...round, caller] };
}

/** What the header conditions read (phone_scripts_generic.c). */
export interface CallContext {
  contact: PhoneContact;
  /** The player's PhoneRematch.seeking for this contact. */
  seeking: boolean;
  /** FLAG_BEAT_RADIO_TOWER_ROCKETS: no rematch call before it. */
  radioTower: boolean;
  /** 0 Sunday … 6. */
  weekday: number;
  /** The wild time band of the hour: 0 morning, 1 day, 2 night (as rematchTime). */
  band: number;
  /** Whether a PHONE_SCRIPT is of PHONESCRIPTTYPE_REMATCH. */
  isRematch(script: number): boolean;
}

/** PhoneScriptGeneric_GetScriptIdInternal: the first header whose condition and roll pass, else the last one tried. */
export function pickCallScript(headers: readonly CallHeader[], ctx: CallContext, rng: { nextInt(n: number): number }): number | undefined {
  const roll = (chance: number) => rng.nextInt(100) <= chance;
  // shortcut: no gift items (PhoneRematches_GiftItemIdGet), Bug-Catching Contest or Rocket takeover yet; each reads as not happening.
  const passes = (h: CallHeader): boolean => {
    switch (h.type) {
      case 2: // FIGHTPOSTROCKETS
        if (ctx.seeking || (!ctx.radioTower && h.scriptType === 0 && ctx.isRematch(h.script))) return false;
        return roll(h.chance);
      case 3: // POSTROCKETWEEKTIME
        return ctx.radioTower && ctx.weekday === ctx.contact.rematchWeekday && ctx.band === ctx.contact.rematchTime && roll(h.chance);
      case 4: // BUGCONTESTDAYS
        return [2, 4, 6].includes(ctx.weekday) && roll(h.chance);
      case 5: // DURINGROCKETS
      case 8: // GIFTNOTBUGCONTEST
        return false;
      case 7: // FIGHTPOSTROCKETSNOTBUGCONTEST
        return ctx.radioTower && ctx.seeking && roll(h.chance);
      default: // RAND1, RAND6
        return roll(h.chance);
    }
  };
  for (const h of headers) if (passes(h)) return h.script;
  return headers.at(-1)?.script;
}
