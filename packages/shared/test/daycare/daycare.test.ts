import { describe, expect, it } from "vitest";
import { daycareState, daycareStep, deposit, grownLevel, levelsGained, retrieve, withdrawCost, type DaycareSlot } from "../../src/daycare/index.ts";
import { expForLevel } from "../../src/progression/experience.ts";
import type { PartyMember } from "../../src/save/schema.ts";

// Spec 029, item 029.1: the Route 34 Day Care, as pret/pokeheartgold get_egg.c (synthetic data, principle II).

const stats = (v: number) => ({ hp: v, attack: v, defense: v, speed: v, specialAttack: v, specialDefense: v });
const mon = (over: Partial<PartyMember> = {}): PartyMember => ({ species: 10, level: 5, moves: [1], hp: 20, friendship: 70, experience: expForLevel("medium-fast", 5), ivs: stats(0), evs: stats(0), nature: 0, ...over });
/** Medium fast: level n needs n³ experience. */
const growth = { rate: "medium-fast" as const, levelUp: [{ level: 6, move: 2 }, { level: 7, move: 3 }, { level: 7, move: 4 }, { level: 8, move: 5 }, { level: 9, move: 1 }] };
/** Max HP 10 + 2 per level, enough to see HP follow the new maximum. */
const hpMax = (m: PartyMember) => 10 + 2 * m.level;

describe("daycare state", () => {
  it("is 0 empty, 2 with one Pokémon and 3 with two (1, the egg, is not made here)", () => {
    const d: DaycareSlot[] = [];
    expect(daycareState(d)).toBe(0);
    d.push({ mon: mon(), steps: 0 });
    expect(daycareState(d)).toBe(2);
    d.push({ mon: mon(), steps: 0 });
    expect(daycareState(d)).toBe(3);
  });
});

describe("deposit", () => {
  it("takes the member out of the party with no steps yet, at most two", () => {
    const party = [mon({ species: 1 }), mon({ species: 2 }), mon({ species: 3 })];
    const d: DaycareSlot[] = [];
    deposit(party, 1, d);
    expect(party.map((m) => m.species)).toEqual([1, 3]);
    expect(d).toEqual([{ mon: mon({ species: 2 }), steps: 0 }]);
    deposit(party, 0, d);
    expect(() => deposit(party, 0, d)).toThrow();
    expect(party.map((m) => m.species)).toEqual([3]);
  });
});

describe("experience while walking", () => {
  it("gives each Pokémon 1 experience per step", () => {
    const d: DaycareSlot[] = [{ mon: mon(), steps: 0 }, { mon: mon({ level: 8, experience: 512 }), steps: 3 }];
    for (let i = 0; i < 91; i++) daycareStep(d);
    expect(d.map((s) => s.steps)).toEqual([91, 94]);
    // 125 + 91 = 216 = 6³: level 6, one level gained.
    expect(grownLevel(d[0]!, growth.rate)).toBe(6);
    expect(levelsGained(d[0]!, growth.rate)).toBe(1);
    expect(grownLevel({ mon: mon(), steps: 90 }, growth.rate)).toBe(5);
  });

  it("stops at level 100", () => {
    const top = expForLevel("medium-fast", 100);
    expect(grownLevel({ mon: mon({ level: 99, experience: expForLevel("medium-fast", 99) }), steps: 10 ** 7 }, growth.rate)).toBe(100);
    expect(levelsGained({ mon: mon({ level: 100, experience: top }), steps: 500 }, growth.rate)).toBe(0);
  });
});

describe("withdraw cost", () => {
  it("is 100 plus 100 per level gained", () => {
    expect(withdrawCost(0)).toBe(100);
    expect(withdrawCost(1)).toBe(200);
    expect(withdrawCost(12)).toBe(1300);
  });
});

describe("retrieve", () => {
  it("applies the steps as experience, learns each level's moves dropping the first when full, and keeps the damage taken", () => {
    // 125 + 387 = 512 = 8³: levels 6, 7 and 8.
    const d: DaycareSlot[] = [{ mon: mon({ hp: 15 }), steps: 387 }];
    const back = retrieve(d, 0, growth, hpMax);
    expect(back.level).toBe(8);
    expect(back.experience).toBe(512);
    // 1 → 1,2 → 1,2,3,4 (full) → 2,3,4,5.
    expect(back.moves).toEqual([2, 3, 4, 5]);
    // Max HP 20 → 26; 5 damage stays.
    expect(back.hp).toBe(21);
    expect(d).toEqual([]);
  });

  it("does not learn a move it already knows", () => {
    const back = retrieve([{ mon: mon({ level: 8, experience: 512, moves: [2, 3, 4, 5] }), steps: 217 }], 0, growth, hpMax);
    expect(back.level).toBe(9);
    expect(back.moves).toEqual([3, 4, 5, 1]);
    expect(retrieve([{ mon: mon({ level: 8, experience: 512, moves: [1, 5] }), steps: 217 }], 0, growth, hpMax).moves).toEqual([1, 5]);
  });

  it("leaves a fainted Pokémon fainted and one at level 100 untouched", () => {
    expect(retrieve([{ mon: mon({ hp: 0 }), steps: 387 }], 0, growth, hpMax).hp).toBe(0);
    const top = mon({ level: 100, experience: expForLevel("medium-fast", 100), hp: 50 });
    expect(retrieve([{ mon: top, steps: 999 }], 0, growth, hpMax)).toEqual(top);
  });

  it("moves the second Pokémon to the first slot when the first leaves", () => {
    const d: DaycareSlot[] = [{ mon: mon({ species: 1 }), steps: 0 }, { mon: mon({ species: 2 }), steps: 7 }];
    expect(retrieve(d, 0, growth, hpMax).species).toBe(1);
    expect(d).toEqual([{ mon: mon({ species: 2 }), steps: 7 }]);
  });
});
