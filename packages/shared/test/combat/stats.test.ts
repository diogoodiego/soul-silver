import { describe, expect, it } from "vitest";
import { applyStage, computeStats, stageMultiplier } from "../../src/combat/stats.ts";

const GARCHOMP = { hp: 108, attack: 130, defense: 95, speed: 102, specialAttack: 80, specialDefense: 85 };

describe("computeStats", () => {
  it("follows the Gen 4 formula (Bulbapedia's Garchomp example)", () => {
    const stats = computeStats(GARCHOMP, 78, {
      ivs: { hp: 24, attack: 12, defense: 30, speed: 5, specialAttack: 16, specialDefense: 23 },
      evs: { hp: 74, attack: 190, defense: 91, speed: 23, specialAttack: 48, specialDefense: 84 },
      nature: { up: "attack", down: "specialAttack" },
    });
    expect(stats).toEqual({ hp: 289, attack: 278, defense: 193, speed: 171, specialAttack: 135, specialDefense: 171 });
  });

  it("defaults to IV 31, EV 0 and a neutral nature", () => {
    // Cyndaquil (39/52/43/65/60/50) at level 10.
    expect(computeStats({ hp: 39, attack: 52, defense: 43, speed: 65, specialAttack: 60, specialDefense: 50 }, 10)).toEqual({
      hp: 30,
      attack: 18,
      defense: 16,
      speed: 21,
      specialAttack: 20,
      specialDefense: 18,
    });
  });
});

describe("stages", () => {
  it("uses 2/8 to 8/2", () => {
    expect([-6, -1, 0, 1, 2, 6].map(stageMultiplier)).toEqual([2 / 8, 2 / 3, 1, 3 / 2, 2, 4]);
  });

  it("clamps at ±6 and returns the change that applied", () => {
    expect(applyStage(5, 2)).toEqual({ stage: 6, applied: 1 });
    expect(applyStage(6, 1)).toEqual({ stage: 6, applied: 0 });
    expect(applyStage(-5, -3)).toEqual({ stage: -6, applied: -1 });
  });
});
