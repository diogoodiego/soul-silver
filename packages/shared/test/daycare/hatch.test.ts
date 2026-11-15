import { describe, expect, it } from "vitest";
import { EGG_CYCLE_PX, HATCH_ABILITIES, STEP_PX, cyclesToSubtract, eggWalk } from "../../src/daycare/hatch.ts";
import type { PartyMember } from "../../src/save/schema.ts";

// Spec 029, item 029.4: hatching, as pret/pokeheartgold HandleDaycareStep and GetEggCyclesToSubtract. Movement is
// free, so the original's steps become distance walked: a tile (16 px) is a step. Synthetic species; the abilities
// are the original's ids (Magma Armor 40, Flame Body 49).

const stats = (v: number) => ({ hp: v, attack: v, defense: v, speed: v, specialAttack: v, specialDefense: v });
const mon = (species: number, cycles?: number): PartyMember => ({ species, level: 1, moves: [33], hp: 10, friendship: 120, experience: 0, ivs: stats(0), evs: stats(0), nature: 0, ...(cycles === undefined ? {} : { egg: { cycles } }) });
const STEP = STEP_PX;

/** Walks `steps` tiles, one tick a tile, and returns the step the egg hatched on (1-based), or undefined. */
function walk(party: PartyMember[], steps: number, speedsUp = false): { at: number | undefined; px: number } {
  let px = 0;
  for (let i = 1; i <= steps; i++) {
    const r = eggWalk(px, STEP, party, speedsUp);
    px = r.px;
    if (r.hatch !== undefined) return { at: i, px };
  }
  return { at: undefined, px };
}

describe("egg cycles by distance", () => {
  it("a cycle is 255 steps of 16 px: the eggs lose a cycle each time, and the distance left over carries on", () => {
    expect(EGG_CYCLE_PX).toBe(255 * 16);
    const party = [mon(1), mon(2, 3)];
    const r = eggWalk(EGG_CYCLE_PX - 1, 5, party, false);
    expect(r).toEqual({ px: 4 });
    expect(party[1]!.egg!.cycles).toBe(2);
    expect(eggWalk(0, EGG_CYCLE_PX - 1, party, false)).toEqual({ px: EGG_CYCLE_PX - 1 });
    expect(party[1]!.egg!.cycles).toBe(2);
  });

  it("an egg with c cycles hatches after (c + 1) × 255 steps: it reaches 0, then hatches on the next cycle", () => {
    expect(walk([mon(1), mon(2, 5)], 6 * 255).at).toBe(6 * 255);
    expect(walk([mon(1), mon(2, 5)], 6 * 255 - 1).at).toBeUndefined();
  });

  it("Flame Body or Magma Armor in the party takes 2 cycles a time, and 1 when one is left", () => {
    // 5 → 3 → 1 → 0, then the hatch: 4 cycles instead of 6.
    expect(walk([mon(1), mon(2, 5)], 4 * 255, true).at).toBe(4 * 255);
    expect(walk([mon(1), mon(2, 5)], 4 * 255 - 1, true).at).toBeUndefined();
  });

  it("the ability counts on a Pokémon that is not an egg, of either of its species' abilities", () => {
    const abilities = (s: number) => ({ 1: [65], 2: [12, 49], 3: [40] })[s] ?? [];
    expect(HATCH_ABILITIES).toEqual([40, 49]);
    expect(cyclesToSubtract([mon(1), mon(2)], abilities)).toBe(2);
    expect(cyclesToSubtract([mon(3)], abilities)).toBe(2);
    expect(cyclesToSubtract([mon(1), mon(3, 5)], abilities)).toBe(1);
  });

  it("the first egg found at 0 hatches; eggs after it keep their cycles that time", () => {
    const party = [mon(2, 4), mon(3, 0), mon(4, 2)];
    expect(eggWalk(EGG_CYCLE_PX - 1, 1, party, false)).toEqual({ px: 0, hatch: 1 });
    expect(party.map((m) => m.egg?.cycles)).toEqual([3, 0, 2]);
  });

  it("walks with no egg in the party only count the distance", () => {
    const party = [mon(1)];
    expect(eggWalk(EGG_CYCLE_PX - 1, 2, party, false)).toEqual({ px: 1 });
    expect(party).toEqual([mon(1)]);
  });
});
