import { describe, expect, it } from "vitest";
import { addEvs, friendshipOnFaint, friendshipOnLevelUp, memberStats, natureMods } from "../../src/progression/index.ts";

const zero = { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 };
const all = (v: number) => ({ hp: v, attack: v, defense: v, speed: v, specialAttack: v, specialDefense: v });

describe("natureMods", () => {
  it("follows the Gen 4 nature order", () => {
    expect(natureMods(0)).toBeUndefined(); // Hardy
    expect(natureMods(24)).toBeUndefined(); // Quirky
    expect(natureMods(1)).toEqual({ up: "attack", down: "defense" }); // Lonely
    expect(natureMods(3)).toEqual({ up: "attack", down: "specialAttack" }); // Adamant
    expect(natureMods(5)).toEqual({ up: "defense", down: "attack" }); // Bold
    expect(natureMods(10)).toEqual({ up: "speed", down: "attack" }); // Timid
    expect(natureMods(15)).toEqual({ up: "specialAttack", down: "attack" }); // Modest
    expect(natureMods(23)).toEqual({ up: "specialDefense", down: "specialAttack" }); // Careful
  });
});

describe("memberStats", () => {
  it("Garchomp L78 Adamant (Bulbapedia)", () => {
    const base = { hp: 108, attack: 130, defense: 95, speed: 102, specialAttack: 80, specialDefense: 85 };
    const member = {
      level: 78,
      nature: 3,
      ivs: { hp: 24, attack: 12, defense: 30, speed: 5, specialAttack: 16, specialDefense: 23 },
      evs: { hp: 74, attack: 190, defense: 91, speed: 23, specialAttack: 48, specialDefense: 84 },
    };
    expect(memberStats(base, member)).toEqual({ hp: 289, attack: 278, defense: 193, speed: 171, specialAttack: 135, specialDefense: 171 });
  });

  it("Cyndaquil L14 Timid, IV 31, no EVs", () => {
    const base = { hp: 39, attack: 52, defense: 43, speed: 65, specialAttack: 60, specialDefense: 50 };
    // (2×65+31)×14/100 = 22 → (22+5)×1.1 = 29; attack (104+31)×14/100 = 18 → 23×0.9 = 20.
    expect(memberStats(base, { level: 14, nature: 10, ivs: all(31), evs: zero })).toEqual({ hp: 39, attack: 20, defense: 21, speed: 29, specialAttack: 26, specialDefense: 23 });
  });

  it("Pidgey L50 Hardy, IV 0, 252 HP EVs", () => {
    const base = { hp: 40, attack: 45, defense: 40, speed: 56, specialAttack: 35, specialDefense: 35 };
    expect(memberStats(base, { level: 50, nature: 0, ivs: zero, evs: { ...zero, hp: 252 } })).toEqual({ hp: 131, attack: 50, defense: 45, speed: 61, specialAttack: 40, specialDefense: 40 });
  });
});

describe("addEvs", () => {
  it("adds the yield", () => {
    expect(addEvs(zero, { ...zero, speed: 1 })).toEqual({ ...zero, speed: 1 });
  });

  it("stops at 255 per stat", () => {
    expect(addEvs({ ...zero, attack: 254 }, { ...zero, attack: 3 }).attack).toBe(255);
  });

  it("stops at 510 in total, in stat order", () => {
    const evs = { ...zero, hp: 255, attack: 254 };
    expect(addEvs(evs, { ...zero, attack: 2, defense: 2 })).toEqual({ ...zero, hp: 255, attack: 255, defense: 0 });
  });
});

describe("friendship", () => {
  it("grows by 5, 3 or 2 on level up", () => {
    expect(friendshipOnLevelUp(70)).toBe(75);
    expect(friendshipOnLevelUp(99)).toBe(104);
    expect(friendshipOnLevelUp(100)).toBe(103);
    expect(friendshipOnLevelUp(199)).toBe(202);
    expect(friendshipOnLevelUp(200)).toBe(202);
    expect(friendshipOnLevelUp(254)).toBe(255);
  });

  it("drops by 1 on fainting, never below 0", () => {
    expect(friendshipOnFaint(70)).toBe(69);
    expect(friendshipOnFaint(0)).toBe(0);
  });
});
