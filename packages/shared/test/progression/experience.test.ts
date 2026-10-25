import { describe, expect, it } from "vitest";
import { GROWTH_RATE_KEYS } from "../../src/game-data/species.ts";
import { expForLevel, expGain, levelFor } from "../../src/progression/experience.ts";

// Total experience per level from the published Gen 3/4 tables.
const REFERENCE = {
  erratic: { 1: 0, 2: 15, 50: 125000, 68: 257834, 98: 583539, 100: 600000 },
  fast: { 1: 0, 2: 6, 50: 100000, 100: 800000 },
  "medium-fast": { 1: 0, 2: 8, 50: 125000, 100: 1000000 },
  "medium-slow": { 1: 0, 2: 9, 50: 117360, 100: 1059860 },
  slow: { 1: 0, 2: 10, 50: 156250, 100: 1250000 },
  fluctuating: { 1: 0, 2: 4, 15: 1957, 36: 46656, 50: 142500, 100: 1640000 },
} as const;

describe("expForLevel", () => {
  for (const rate of GROWTH_RATE_KEYS) {
    it(`matches the ${rate} table`, () => {
      for (const [level, exp] of Object.entries(REFERENCE[rate])) expect(expForLevel(rate, Number(level))).toBe(exp);
    });
    it(`never decreases (${rate})`, () => {
      for (let n = 2; n <= 100; n++) expect(expForLevel(rate, n)).toBeGreaterThan(expForLevel(rate, n - 1));
    });
  }

  it("is n³ on every level of medium-fast", () => {
    for (let n = 2; n <= 100; n++) expect(expForLevel("medium-fast", n)).toBe(n ** 3);
  });
});

describe("levelFor", () => {
  it("is the highest level whose total is reached", () => {
    expect(levelFor("medium-fast", 0)).toBe(1);
    expect(levelFor("medium-fast", 7)).toBe(1);
    expect(levelFor("medium-fast", 8)).toBe(2);
    expect(levelFor("medium-slow", 1611)).toBe(13);
    expect(levelFor("medium-slow", 1612)).toBe(14);
    expect(levelFor("fast", 9_999_999)).toBe(100);
  });
});

describe("expGain", () => {
  // Pidgey: base experience 55.
  it("follows floor(floor(b × L / 7) / s) × a", () => {
    expect(expGain({ baseExperience: 55, level: 3, participants: 1, trainer: false })).toBe(23);
    expect(expGain({ baseExperience: 55, level: 3, participants: 1, trainer: true })).toBe(34);
    expect(expGain({ baseExperience: 55, level: 3, participants: 2, trainer: false })).toBe(11);
    expect(expGain({ baseExperience: 55, level: 3, participants: 2, trainer: true })).toBe(16);
  });

  it("splits between up to six participants", () => {
    // Onix: 108 × 14 / 7 = 216.
    const gains = [1, 2, 3, 4, 5, 6].map((participants) => expGain({ baseExperience: 108, level: 14, participants, trainer: false }));
    expect(gains).toEqual([216, 108, 72, 54, 43, 36]);
  });
});
