import { describe, expect, it } from "vitest";
import { createRng } from "../../src/game/rng";
import { expForLevel, memberStats, STARTER_LEVEL, STARTERS, starterMember } from "../../src/progression";

// Spec 017: the starter picked on a new game, built like the original's gift Pokémon.

const species = { id: 155, baseStats: { hp: 39, attack: 52, defense: 43, speed: 65, specialAttack: 60, specialDefense: 50 }, growthRate: "medium-slow" as const, baseFriendship: 70 };
const levelUp = [
  { level: 1, move: 33 },
  { level: 1, move: 43 },
  { level: 6, move: 108 },
];

describe("starterMember", () => {
  it("offers Chikorita, Cyndaquil and Totodile", () => {
    expect(STARTERS).toEqual([152, 155, 158]);
  });

  it("is level 5 with full HP, the learnset moves up to that level and the curve's experience", () => {
    const m = starterMember(species, levelUp, createRng(1));
    expect(m).toMatchObject({ species: 155, level: STARTER_LEVEL, moves: [33, 43], friendship: 70, experience: expForLevel("medium-slow", 5) });
    expect(m.hp).toBe(memberStats(species.baseStats, m).hp);
    expect(m.evs).toEqual({ hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 });
  });

  it("rolls IVs 0–31 and a nature 0–24", () => {
    for (let seed = 1; seed < 30; seed++) {
      const m = starterMember(species, levelUp, createRng(seed));
      for (const v of Object.values(m.ivs)) expect(v >= 0 && v <= 31).toBe(true);
      expect(m.nature).toBeGreaterThanOrEqual(0);
      expect(m.nature).toBeLessThanOrEqual(24);
    }
  });
});
