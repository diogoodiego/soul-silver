import type { StageKey, StatusId } from "../combat/schemas.ts";
import type { ItemRecord } from "../game-data/items.ts";
import type { ExplicitUseEffect, ItemEffects } from "./schemas.ts";

// What using an item does (spec 027, research R2): read from the extracted party-use bytes
// (ItemPartyParam in item_data, 20 bytes), from the pocket for balls and machines, and from
// content/items/effects.json for what the bytes do not say.

export type HealAmount = number | "full" | "half" | "quarter";
export type UseEffect =
  | { archetype: "heal"; amount: HealAmount; cures: StatusId[] }
  | { archetype: "revive"; amount: HealAmount }
  | { archetype: "cure"; cures: StatusId[] }
  | { archetype: "pp-ether"; all: boolean; pp: number | "full" }
  | { archetype: "pp-up"; max: boolean }
  | { archetype: "rare-candy" }
  | { archetype: "evolve" }
  | { archetype: "battle-stat"; stages: Partial<Record<StageKey, number>>; guard?: true }
  | { archetype: "ball" }
  | { archetype: "teach" }
  | ExplicitUseEffect;

/** Byte 0, one bit per status the item cures (poison also cures bad poison). */
const CURES: [number, StatusId[]][] = [
  [0x01, ["sleep"]],
  [0x02, ["poison", "toxic"]],
  [0x04, ["burn"]],
  [0x08, ["freeze"]],
  [0x10, ["paralysis"]],
  [0x20, ["confusion"]],
];
const GUARD_SPEC = 0x80;
/** Byte 1. */
const REVIVE = 0x01;
const LEVEL_UP = 0x04;
const EVOLVE = 0x08;
/** Byte 4. */
const PP_UP = 0x40;
const PP_MAX = 0x80;
/** Byte 5. */
const PP_ONE = 0x01;
const PP_ALL = 0x02;
const RESTORE_HP = 0x04;
const HP_AMOUNT = 13;
const PP_AMOUNT = 14;
const PP_FULL = 0x7f;
/** Stat stages as nibbles: [byte, high nibble?, stat]. */
const STAGES: [number, boolean, StageKey][] = [
  [1, true, "attack"],
  [2, false, "defense"],
  [2, true, "specialAttack"],
  [3, false, "specialDefense"],
  [3, true, "speed"],
  [4, false, "accuracy"],
];

function amountOf(byte: number): HealAmount {
  return byte === 0xff ? "full" : byte === 0xfe ? "half" : byte === 0xfd ? "quarter" : byte;
}

export function useEffectOf(record: Pick<ItemRecord, "id" | "pocket" | "partyUse">, effects: ItemEffects): UseEffect | undefined {
  const explicit = effects.use[String(record.id)];
  if (explicit) return explicit;
  if (record.pocket === "balls") return { archetype: "ball" };
  // Key items act through scripts and the field (the Bicycle, the rods, the Apricorn Box…), not from the bag.
  if (record.pocket === "key-items") return { archetype: "none", reason: "key" };
  if (record.pocket === "mail") return { archetype: "none", reason: "mail" };
  if (record.pocket === "machines") return { archetype: "teach" };
  const b = (i: number) => parseInt(record.partyUse.params.slice(i * 2, i * 2 + 2), 16);
  const cures = CURES.filter(([bit]) => b(0) & bit).flatMap(([, ids]) => ids);
  // Rare Candy sets the revive bit too (in Gen 4 it also wakes a fainted Pokémon): the level comes first.
  if (b(1) & LEVEL_UP) return { archetype: "rare-candy" };
  if (b(1) & REVIVE) return { archetype: "revive", amount: amountOf(b(HP_AMOUNT)) };
  if (b(5) & RESTORE_HP && b(HP_AMOUNT) > 0) return { archetype: "heal", amount: amountOf(b(HP_AMOUNT)), cures };
  if (b(5) & (PP_ONE | PP_ALL)) return { archetype: "pp-ether", all: (b(5) & PP_ALL) !== 0, pp: b(PP_AMOUNT) === PP_FULL ? "full" : b(PP_AMOUNT) };
  if (b(4) & (PP_UP | PP_MAX)) return { archetype: "pp-up", max: (b(4) & PP_MAX) !== 0 };
  if (b(1) & EVOLVE) return { archetype: "evolve" };
  if (cures.length) return { archetype: "cure", cures };
  const stages: Partial<Record<StageKey, number>> = {};
  for (const [i, high, stat] of STAGES) {
    const n = high ? b(i) >> 4 : b(i) & 0x0f;
    if (n) stages[stat] = n;
  }
  const crit = (b(4) >> 4) & 0x03;
  if (crit) stages.crit = crit;
  if (b(0) & GUARD_SPEC) return { archetype: "battle-stat", stages, guard: true };
  if (Object.keys(stages).length) return { archetype: "battle-stat", stages };
  return undefined;
}

/** HP an amount restores on a Pokémon with `max` HP. */
export function healHp(amount: HealAmount, max: number): number {
  if (amount === "full") return max;
  if (amount === "half") return Math.max(1, Math.floor(max / 2));
  if (amount === "quarter") return Math.max(1, Math.floor(max / 4));
  return amount;
}

/** PP Up as cooldown (research R4, block C): a special's cooldown shrinks by perLevel per use (PP Up −5%, PP Max −15%). */
export const ppUpCooldownMul = (uses: number, perLevel: number) => Math.max(0, 1 - perLevel * uses);
