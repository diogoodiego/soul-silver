// Hatching (spec 029, item 029.4), as pret/pokeheartgold HandleDaycareStep and GetEggCyclesToSubtract. The
// original counts steps on its grid; movement here is free, so a step is a tile's length of distance walked.
import type { PartyMember } from "../save/schema.ts";

/** One step of the original's grid: a map tile. */
export const STEP_PX = 16;
/** Daycare_GetEggCycleLength: steps in an egg cycle. */
export const EGG_CYCLE_STEPS = 255;
export const EGG_CYCLE_PX = STEP_PX * EGG_CYCLE_STEPS;
/** ABILITY_MAGMA_ARMOR and ABILITY_FLAME_BODY. */
export const HATCH_ABILITIES = [40, 49] as const;

/**
 * GetEggCyclesToSubtract: whether a Pokémon in the party that is not an egg has Magma Armor or Flame Body. The save
 * keeps no ability, so a species counts when either of its abilities is one; in Gen 4 every species that can have
 * one of them has no other kind (Magby, Magmar, Magmortar, Slugma, Magcargo, Camerupt), so this is exact.
 */
export function cyclesToSubtract(party: readonly PartyMember[], abilities: (species: number) => readonly number[]): 1 | 2 {
  return party.some((m) => !m.egg && abilities(m.species).some((a) => (HATCH_ABILITIES as readonly number[]).includes(a))) ? 2 : 1;
}

/**
 * Adds `distance` px to the cycle walked so far (`px`). On each full cycle the party's eggs lose `speedsUp` ? 2 : 1
 * cycles (never below 0), unless one is already at 0: that one hatches, the eggs after it keep theirs, and its slot
 * comes back as `hatch`. Mutates the eggs' cycles.
 */
export function eggWalk(px: number, distance: number, party: PartyMember[], speedsUp: boolean): { px: number; hatch?: number } {
  let walked = px + distance;
  const sub = speedsUp ? 2 : 1;
  while (walked >= EGG_CYCLE_PX) {
    walked -= EGG_CYCLE_PX;
    for (const [i, m] of party.entries()) {
      if (!m.egg) continue;
      if (m.egg.cycles === 0) return { px: walked, hatch: i };
      m.egg.cycles -= m.egg.cycles >= sub ? sub : 1;
    }
  }
  return { px: walked };
}
