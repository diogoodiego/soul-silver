import { toTicks } from "../combat/status.ts";
import type { EncounterSlot } from "../events/schemas.ts";
import type { Rng } from "../game/rng.ts";
import { rollSlot } from "../wild/spawn.ts";
import type { FishingRules, Rod } from "./schemas.ts";

// Fishing (spec 025, research R4): the original rolls "a bite?" once per wait; in real time the bite
// opens a reaction window instead. Pure: every roll comes from the rng passed in; times are ticks.

export type FishingState = "waiting" | "bite" | "hooked" | "escaped";

export interface Fishing {
  rod: Rod;
  state: FishingState;
  /** Tick the wait or the reaction window ends. */
  deadline: number;
}

/** base(rod) + friendshipBite · friendship/255, as research R4 settles. */
export const biteChance = (rules: FishingRules, rod: Rod, friendship: number): number =>
  Math.min(1, rules.rods[rod].baseBite + (rules.friendshipBite * Math.min(255, Math.max(0, friendship))) / 255);

export const rollBite = (rules: FishingRules, rod: Rod, friendship: number, rng: Rng): boolean => rng.nextFloat() < biteChance(rules, rod, friendship);

/** The line in the water: a wait drawn from the rod's range. */
export function castLine(rules: FishingRules, rod: Rod, tick: number, rng: Rng): Fishing {
  const [min, max] = rules.rods[rod].waitS;
  return { rod, state: "waiting", deadline: tick + toTicks(min + (max - min) * rng.nextFloat()) };
}

/** One tick: the wait ends in a bite or in nothing; a bite nobody answers gets away. */
export function stepFishing(f: Fishing, rules: FishingRules, friendship: number, tick: number, rng: Rng): Fishing {
  if (tick < f.deadline) return f;
  if (f.state === "waiting") return rollBite(rules, f.rod, friendship, rng) ? { ...f, state: "bite", deadline: tick + toTicks(rules.rods[f.rod].windowS) } : { ...f, state: "escaped" };
  if (f.state === "bite") return { ...f, state: "escaped" };
  return f;
}

/** The reaction: inside the window it hooks; before the bite or after it, the fish is gone. */
export const reel = (f: Fishing, tick: number): Fishing => ({ ...f, state: f.state === "bite" && tick < f.deadline ? "hooked" : "escaped" });

/** The slot `nightFish` takes at night, by rod (encounter_check.c, EncSlotArray_Update_NightFishing); the Old Rod has none. */
const NIGHT_SLOT: Partial<Record<Rod, number>> = { good: 3, super: 1 };

/** A slot of the rod's table by its chance; at night (`nightFish` given) that species takes the rod's night slot. */
export function pickCatch(table: readonly EncounterSlot[], rng: Rng, nightFish?: number, rod?: Rod): EncounterSlot {
  const at = rod && NIGHT_SLOT[rod];
  const slots = nightFish === undefined || at === undefined ? table : table.map((s, i) => (i === at ? { ...s, species: nightFish, form: 0 } : s));
  return rollSlot(slots, rng);
}
