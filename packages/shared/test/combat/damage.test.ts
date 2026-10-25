import { describe, expect, it } from "vitest";
import { computeDamage, rollCrit, rollRandom, type DamageInput } from "../../src/combat/damage.ts";
import { createRng } from "../../src/game/rng.ts";

// Glaceon (Lv 75, Atk 123) uses Ice Fang (65) on Garchomp (Def 163): Bulbapedia's worked example, 168 to 196.
const ICE_FANG: DamageInput = {
  level: 75,
  power: 65,
  attack: 123,
  defense: 163,
  attackStage: 0,
  defenseStage: 0,
  stab: true,
  typeMultipliers: [2, 2],
  burned: false,
  weather: 1,
  crit: false,
  random: 100,
};

describe("computeDamage", () => {
  it("lands in the original range", () => {
    expect(computeDamage({ ...ICE_FANG, random: 85 })).toBe(168);
    expect(computeDamage({ ...ICE_FANG, random: 100 })).toBe(196);
  });

  it("truncates at each step like the original", () => {
    // base 31 → +2 = 33 → crit 66 → random 92%: 60 → STAB 90 → 180 → 360
    expect(computeDamage({ ...ICE_FANG, crit: true, random: 92 })).toBe(360);
    // Without STAB: 33 → 30 (92%) → 60 → 120.
    expect(computeDamage({ ...ICE_FANG, stab: false, random: 92 })).toBe(120);
  });

  it("halves physical damage when burned, before the +2", () => {
    // base 31 → 15 → 17 → 17 → STAB 25 → 50 → 100
    expect(computeDamage({ ...ICE_FANG, burned: true })).toBe(100);
  });

  it("applies weather before the +2", () => {
    // base 31 → ×1.5 = 46 → 48 → STAB 72 → 144 → 288
    expect(computeDamage({ ...ICE_FANG, weather: 1.5 })).toBe(288);
  });

  it("uses stat stages, and a crit ignores the ones against the attacker", () => {
    const boosted = computeDamage({ ...ICE_FANG, attackStage: 2 });
    expect(boosted).toBeGreaterThan(computeDamage(ICE_FANG));
    expect(computeDamage({ ...ICE_FANG, attackStage: -2, defenseStage: 2, crit: true })).toBe(computeDamage({ ...ICE_FANG, crit: true }));
    expect(computeDamage({ ...ICE_FANG, attackStage: 2, crit: true })).toBeGreaterThan(computeDamage({ ...ICE_FANG, crit: true }));
  });

  it("is at least 1, and 0 on an immunity", () => {
    expect(computeDamage({ ...ICE_FANG, level: 1, power: 10, attack: 5, defense: 300, stab: false, typeMultipliers: [0.5, 0.5], random: 85 })).toBe(1);
    expect(computeDamage({ ...ICE_FANG, typeMultipliers: [0, 2] })).toBe(0);
  });

  it("doubles on a 2× type against the same roll at 1×", () => {
    const neutral = computeDamage({ ...ICE_FANG, typeMultipliers: [1] });
    expect(computeDamage({ ...ICE_FANG, typeMultipliers: [2] })).toBe(neutral * 2);
  });
});

describe("rolls", () => {
  it("random is an integer from 85 to 100", () => {
    const rng = createRng(7);
    const seen = new Set(Array.from({ length: 2000 }, () => rollRandom(rng)));
    expect(Math.min(...seen)).toBe(85);
    expect(Math.max(...seen)).toBe(100);
    expect(seen.size).toBe(16);
  });

  it("crit chance follows the stage table", () => {
    const rng = createRng(3);
    const rate = (stage: number) => Array.from({ length: 20000 }, () => rollCrit(rng, stage, [16, 8, 4, 3, 2])).filter(Boolean).length / 20000;
    expect(rate(0)).toBeCloseTo(1 / 16, 1);
    expect(rate(4)).toBeCloseTo(1 / 2, 1);
    expect(rate(9)).toBeCloseTo(1 / 2, 1);
  });
});
