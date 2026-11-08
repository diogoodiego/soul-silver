import { describe, expect, it } from "vitest";
import { createRng } from "../../src/game/rng.ts";
import { biteChance, castLine, pickCatch, reel, RODS, stepFishing, type FishingRules } from "../../src/field/index.ts";

// Spec 025 US3 (FR-010, FR-011, SC-002): every rod draws from its own table by the slot chances, the
// bite chance grows with the companion's friendship, and a bite left unanswered escapes.

const RULES: FishingRules = {
  rods: {
    old: { item: 445, waitS: [2, 5], windowS: 1.5, baseBite: 0.5 },
    good: { item: 446, waitS: [1.5, 4], windowS: 1.2, baseBite: 0.65 },
    super: { item: 447, waitS: [1, 3], windowS: 1, baseBite: 0.8 },
  },
  friendshipBite: 0.2,
};
/** The fishing slot chances of the original, five species per rod. */
const CHANCES = [40, 30, 15, 10, 5];
const table = (first: number) => CHANCES.map((chance, i) => ({ species: first + i, form: 0, minLevel: 10, maxLevel: 20, chance }));
const TABLES = { old: table(100), good: table(200), super: table(300) };

describe("fishing", () => {
  it("draws each rod's species within 3σ of its table's chances over 1,000 casts", () => {
    for (const rod of RODS) {
      const rng = createRng(25);
      const counts = new Map<number, number>();
      for (let i = 0; i < 1000; i++) {
        const slot = pickCatch(TABLES[rod], rng);
        counts.set(slot.species, (counts.get(slot.species) ?? 0) + 1);
      }
      for (const slot of TABLES[rod]) {
        const p = slot.chance / 100;
        const sigma = Math.sqrt(1000 * p * (1 - p));
        expect(Math.abs((counts.get(slot.species) ?? 0) - 1000 * p), `${rod} ${slot.species}`).toBeLessThanOrEqual(3 * sigma);
      }
      expect([...counts.keys()].every((s) => TABLES[rod].some((t) => t.species === s))).toBe(true);
    }
  });

  it("bites more often with more friendship, and never less as it grows", () => {
    for (const rod of RODS) {
      let previous = 0;
      for (let f = 0; f <= 255; f += 15) {
        expect(biteChance(RULES, rod, f)).toBeGreaterThanOrEqual(previous);
        previous = biteChance(RULES, rod, f);
      }
      const rate = (friendship: number) => {
        const rng = createRng(7);
        let bites = 0;
        for (let i = 0; i < 1000; i++) {
          const f = stepFishing({ ...castLine(RULES, rod, 0, rng), deadline: 0 }, RULES, friendship, 0, rng);
          if (f.state === "bite") bites++;
        }
        return bites;
      };
      expect(rate(255)).toBeGreaterThan(rate(0));
    }
  });

  it("waits within the rod's range, then hooks only inside the reaction window", () => {
    const rng = createRng(3);
    const cast = castLine(RULES, "good", 100, rng);
    expect(cast.state).toBe("waiting");
    expect(cast.deadline).toBeGreaterThanOrEqual(100 + 1.5 * 20);
    expect(cast.deadline).toBeLessThanOrEqual(100 + 4 * 20);
    // A base chance of 1 always bites.
    const always = { ...RULES, rods: { ...RULES.rods, good: { ...RULES.rods.good, baseBite: 1 } } };
    const bite = stepFishing(cast, always, 0, cast.deadline, rng);
    expect(bite).toMatchObject({ state: "bite", deadline: cast.deadline + 24 });
    expect(stepFishing(bite, always, 0, bite.deadline - 1, rng).state).toBe("bite");
    expect(reel(bite, bite.deadline - 1).state).toBe("hooked");
    expect(reel(bite, bite.deadline).state).toBe("escaped");
    expect(stepFishing(bite, always, 0, bite.deadline, rng).state).toBe("escaped");
    // Reeling in before the bite scares the fish off.
    expect(reel(cast, cast.deadline - 1).state).toBe("escaped");
  });

  it("puts the night species in the Good Rod's slot 3 and the Super Rod's slot 1 at night, never the Old Rod's", () => {
    const rng = createRng(1);
    const cast = (rod: "old" | "good" | "super") => Array.from({ length: 2000 }, () => pickCatch(TABLES[rod], rng, 999, rod).species);
    expect(cast("good")).toContain(999);
    expect(cast("good")).not.toContain(203);
    expect(cast("super")).toContain(999);
    expect(cast("super")).not.toContain(301);
    expect(cast("old")).not.toContain(999);
    expect(Array.from({ length: 2000 }, () => pickCatch(TABLES.super, rng).species)).not.toContain(999);
  });
});
