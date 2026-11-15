import { describe, expect, it } from "vitest";
import { compatibility, compatibilityScore, eggCheckDue, eggRoll, eggSpecies, makeEgg, makeGiftEgg, rollGender, type BreedingData, type Parent } from "../../src/daycare/breeding.ts";
import { createRng, type Rng } from "../../src/game/rng.ts";
import type { PartyMember } from "../../src/save/schema.ts";

// Spec 029, item 029.2: compatibility, the egg chance and the egg itself, as pret/pokeheartgold get_egg.c and
// include/constants/daycare.h. Synthetic species; the ids the original names in code (Ditto, Nidoran, Illumise,
// Manaphy, the incense babies) are used as such (principle II).

const DITTO = 132;
const parent = (species: number, gender: Parent["gender"], eggGroups: Parent["eggGroups"] = ["field"]): Parent => ({ species, gender, eggGroups });

describe("rollGender", () => {
  it("follows the species' ratio byte: 0 male, 254 female, 255 none, else female below the ratio", () => {
    const rng = createRng(7);
    expect(rollGender(0, rng)).toBe("male");
    expect(rollGender(254, rng)).toBe("female");
    expect(rollGender(255, rng)).toBeUndefined();
    const rolls = Array.from({ length: 4000 }, () => rollGender(31, createRng(rng.next())));
    // 31/256 female: about 12%.
    const females = rolls.filter((g) => g === "female").length / rolls.length;
    expect(females).toBeGreaterThan(0.1);
    expect(females).toBeLessThan(0.145);
  });
});

describe("compatibility", () => {
  it("is 0 with an Undiscovered parent, two Dittos, the same gender, a genderless non-Ditto or no shared group", () => {
    expect(compatibility(parent(1, "male", ["undiscovered"]), parent(2, "female"))).toBe(0);
    expect(compatibility(parent(DITTO, undefined, ["ditto"]), parent(DITTO, undefined, ["ditto"]))).toBe(0);
    expect(compatibility(parent(1, "male"), parent(2, "male"))).toBe(0);
    expect(compatibility(parent(1, undefined, ["mineral"]), parent(2, "female", ["mineral"]))).toBe(0);
    expect(compatibility(parent(1, "male", ["bug"]), parent(2, "female", ["grass", "fairy"]))).toBe(0);
  });

  it("with the same trainer (the save keeps no other): 20 with Ditto, 50 for the same species, 20 for two species sharing a group", () => {
    expect(compatibility(parent(DITTO, undefined, ["ditto"]), parent(1, "male"))).toBe(20);
    expect(compatibility(parent(1, undefined, ["mineral"]), parent(DITTO, undefined, ["ditto"]))).toBe(20);
    expect(compatibility(parent(1, "male"), parent(1, "female"))).toBe(50);
    expect(compatibility(parent(1, "male", ["water-1", "field"]), parent(2, "female", ["field"]))).toBe(20);
  });

  it("an Undiscovered parent stays at 0 even with Ditto", () => {
    expect(compatibility(parent(DITTO, undefined, ["ditto"]), parent(1, undefined, ["undiscovered"]))).toBe(0);
  });

  it("scores 70 as 0, 50 as 1, 20 as 2 and 0 as 3, as GetDaycareCompatibility tells the script", () => {
    expect([70, 50, 20, 0].map(compatibilityScore)).toEqual([0, 1, 2, 3]);
  });
});

describe("egg chance", () => {
  it("is checked when the second Pokémon's steps reach 255 of every 256, with two Pokémon and no egg waiting", () => {
    const two = (steps: number) => [{ steps: 9 }, { steps }];
    expect(eggCheckDue(two(255), false)).toBe(true);
    expect(eggCheckDue(two(511), false)).toBe(true);
    expect(eggCheckDue(two(254), false)).toBe(false);
    expect(eggCheckDue(two(256), false)).toBe(false);
    expect(eggCheckDue(two(255), true)).toBe(false);
    expect(eggCheckDue([{ steps: 255 }], false)).toBe(false);
  });

  it("succeeds when the compatibility is above LCRandom × 100 / 0xFFFF", () => {
    expect(eggRoll(70, 0)).toBe(true);
    // 45874 × 100 / 65535 = 69.99…: 69 < 70.
    expect(eggRoll(70, 45874)).toBe(true);
    // 45875 × 100 / 65535 = 70.0…: not above.
    expect(eggRoll(70, 45875)).toBe(false);
    expect(eggRoll(0, 0)).toBe(false);
  });

  it("with a fixed seed, gives an egg about as often as the compatibility says", () => {
    for (const [compat, low, high] of [[70, 0.68, 0.72], [50, 0.48, 0.52], [20, 0.18, 0.22]] as const) {
      const rng = createRng(2029);
      const eggs = Array.from({ length: 10_000 }, () => eggRoll(compat, rng.nextInt(0x10000))).filter(Boolean).length / 10_000;
      expect(eggs).toBeGreaterThan(low);
      expect(eggs).toBeLessThan(high);
    }
  });
});

describe("egg species", () => {
  // Synthetic chain 1 → 2 → 3.
  const pre = (s: number) => ({ 2: 1, 3: 2, 30: 29, 31: 30, 315: 406, 183: 298 })[s];
  it("is the base form of the mother, or of the parent that is not Ditto", () => {
    const rng = createRng(1);
    expect(eggSpecies(parent(3, "female"), parent(9, "male"), pre, rng)).toBe(1);
    expect(eggSpecies(parent(9, "male"), parent(2, "female"), pre, rng)).toBe(1);
    expect(eggSpecies(parent(3, "male"), parent(DITTO, undefined, ["ditto"]), pre, rng)).toBe(1);
    expect(eggSpecies(parent(DITTO, undefined, ["ditto"]), parent(3, undefined, ["mineral"]), pre, rng)).toBe(1);
  });

  it("makes Nidoran♀ and Illumise eggs male half the time, and Manaphy eggs Phione", () => {
    const rng = createRng(3);
    const nidoran = new Set(Array.from({ length: 40 }, () => eggSpecies(parent(31, "female"), parent(32, "male"), pre, rng)));
    expect(nidoran).toEqual(new Set([29, 32]));
    const illumise = new Set(Array.from({ length: 40 }, () => eggSpecies(parent(314, "female", ["bug"]), parent(313, "male", ["bug"]), pre, rng)));
    expect(illumise).toEqual(new Set([313, 314]));
    expect(eggSpecies(parent(490, undefined, ["water-1"]), parent(DITTO, undefined, ["ditto"]), pre, rng)).toBe(489);
  });

  it("without an incense held, a baby that needs one gives its evolution instead", () => {
    const rng = createRng(4);
    // Roselia's base is Budew, Marill's is Azurill: no incense, so Roselia and Marill.
    expect(eggSpecies(parent(315, "female"), parent(9, "male"), pre, rng)).toBe(315);
    expect(eggSpecies(parent(183, "female"), parent(9, "male"), pre, rng)).toBe(183);
  });

  it("029.3: with the incense held by either parent, the baby hatches (Rose Incense 318 → Budew, Sea Incense 254 → Azurill)", () => {
    const rng = createRng(4);
    expect(eggSpecies({ ...parent(315, "female"), held: 318 }, parent(9, "male"), pre, rng)).toBe(406);
    expect(eggSpecies(parent(183, "female"), { ...parent(9, "male"), held: 254 }, pre, rng)).toBe(298);
    // The wrong incense does not count.
    expect(eggSpecies({ ...parent(183, "female"), held: 318 }, parent(9, "male"), pre, rng)).toBe(183);
  });
});

describe("makeEgg", () => {
  const stats = (v: number) => ({ hp: v, attack: v, defense: v, speed: v, specialAttack: v, specialDefense: v });
  const mon = (species: number, ivs: number, moves: number[], gender: "male" | "female"): PartyMember => ({ species, level: 30, moves, hp: 50, friendship: 70, experience: 27000, ivs: stats(ivs), evs: stats(0), nature: 3, gender });
  const data: BreedingData = {
    levelUp: () => [{ level: 1, move: 10 }, { level: 1, move: 11 }, { level: 20, move: 12 }],
    eggMoves: () => [40, 41],
    machineMoves: () => [50],
    hatchCycles: () => 20,
    genderRatio: () => 127,
    hpMax: (m) => 10 + m.level,
  };

  it("is a level 1 egg with the hatch cycles, its level 1 moves and the father's egg, machine and shared level-up moves", () => {
    const mother = mon(1, 30, [12, 40, 7], "female");
    const father = mon(1, 31, [12, 41, 50, 8], "male");
    const egg = makeEgg(mother, father, 1, data, createRng(5));
    expect(egg).toMatchObject({ species: 1, level: 1, experience: 0, hp: 11, egg: { cycles: 20 } });
    // 10, 11 at level 1; then the father's egg move 41, machine move 50, and 12 known by both (dropping 10 when full).
    expect(egg.moves).toEqual([11, 41, 50, 12]);
    expect(["male", "female"]).toContain(egg.gender);
    expect(egg.nickname).toBeUndefined();
  });

  it("inherits three IVs from the parents and rolls the rest (fixed seed)", () => {
    const egg = makeEgg(mon(1, 30, [10], "female"), mon(1, 31, [10], "male"), 1, data, createRng(6));
    const inherited = Object.values(egg.ivs).filter((v) => v === 30 || v === 31).length;
    expect(inherited).toBeGreaterThanOrEqual(3);
    expect(makeEgg(mon(1, 30, [10], "female"), mon(1, 31, [10], "male"), 1, data, createRng(6))).toEqual(egg);
  });

  it("takes no moves from Ditto as the father", () => {
    const egg = makeEgg(mon(1, 30, [41, 50], "female"), { ...mon(DITTO, 31, [144], "male"), gender: undefined }, 1, data, createRng(8));
    expect(egg.moves).toEqual([10, 11]);
  });

  // Spec 029, item 029.3: one test per inheritance rule (get_egg.c InheritMoves, InheritIVs, Daycare_EverstoneCheck,
  // Daycare_LightBallCheck). Item ids are the original's (Everstone 229, Light Ball 236, Power items 289-294).
  /** Every draw is 0: each pick takes the first choice, the mother, and every roll is 0. */
  const zeros: Rng = { next: () => 0, nextFloat: () => 0, nextInt: () => 0 };
  const held = (m: PartyMember, item: number): PartyMember => ({ ...m, held: item });

  it("egg moves come from the father only", () => {
    expect(makeEgg(mon(1, 30, [40], "female"), mon(1, 31, [41], "male"), 1, data, createRng(9)).moves).toEqual([10, 11, 41]);
  });

  it("machine moves come from the father only", () => {
    expect(makeEgg(mon(1, 30, [50], "female"), mon(1, 31, [7], "male"), 1, data, createRng(9)).moves).toEqual([10, 11]);
    expect(makeEgg(mon(1, 30, [7], "female"), mon(1, 31, [50], "male"), 1, data, createRng(9)).moves).toEqual([10, 11, 50]);
  });

  it("level-up moves pass only when both parents know them and the baby learns them", () => {
    expect(makeEgg(mon(1, 30, [12], "female"), mon(1, 31, [12], "male"), 1, data, createRng(9)).moves).toEqual([10, 11, 12]);
    expect(makeEgg(mon(1, 30, [7], "female"), mon(1, 31, [12], "male"), 1, data, createRng(9)).moves).toEqual([10, 11]);
    expect(makeEgg(mon(1, 30, [7], "female"), mon(1, 31, [7], "male"), 1, data, createRng(9)).moves).toEqual([10, 11]);
  });

  it("a Pichu egg learns Volt Tackle (344) when either parent holds a Light Ball", () => {
    const pikachu = (g: "male" | "female") => mon(25, 30, [7], g);
    expect(makeEgg(held(pikachu("female"), 236), pikachu("male"), 172, data, createRng(9)).moves).toEqual([10, 11, 344]);
    expect(makeEgg(pikachu("female"), held(pikachu("male"), 236), 172, data, createRng(9)).moves).toEqual([10, 11, 344]);
    expect(makeEgg(pikachu("female"), pikachu("male"), 172, data, createRng(9)).moves).toEqual([10, 11]);
    expect(makeEgg(held(mon(1, 30, [7], "female"), 236), mon(1, 31, [7], "male"), 1, data, createRng(9)).moves).toEqual([10, 11]);
  });

  it("three distinct IVs come from a random parent each; the others are rolled", () => {
    // All picks are the first stat left and the mother; the rolled IVs are 0.
    const egg = makeEgg(mon(1, 30, [10], "female"), mon(1, 31, [10], "male"), 1, data, zeros);
    expect(egg.ivs).toEqual({ hp: 30, attack: 30, defense: 30, speed: 0, specialAttack: 0, specialDefense: 0 });
  });

  it("a Power item forces its stat from the holder, and it counts toward the three", () => {
    // Power Anklet (293) is Speed: the father's 31, then two more picks (HP, Attack) from the mother.
    const egg = makeEgg(mon(1, 30, [10], "female"), held(mon(1, 31, [10], "male"), 293), 1, data, zeros);
    expect(egg.ivs).toEqual({ hp: 30, attack: 30, defense: 0, speed: 31, specialAttack: 0, specialDefense: 0 });
    const ids = { 289: "attack", 290: "defense", 291: "specialAttack", 292: "specialDefense", 293: "speed", 294: "hp" } as const;
    for (const [item, stat] of Object.entries(ids)) {
      expect(makeEgg(mon(1, 0, [10], "female"), held(mon(1, 31, [10], "male"), Number(item)), 1, data, zeros).ivs[stat]).toBe(31);
    }
  });

  it("with Power items on both parents, one of them is picked at random (fixed seed)", () => {
    const rng = createRng(10);
    const forced = Array.from({ length: 60 }, () => {
      const egg = makeEgg(held(mon(1, 30, [10], "female"), 294), held(mon(1, 31, [10], "male"), 293), 1, data, rng);
      return egg.ivs.hp === 30 ? "mother" : egg.ivs.speed === 31 ? "father" : "none";
    });
    expect(forced).not.toContain("none");
    expect(new Set(forced)).toEqual(new Set(["mother", "father"]));
  });

  it("without an Everstone the nature is rolled", () => {
    const rng = createRng(11);
    const natures = new Set(Array.from({ length: 60 }, () => makeEgg(mon(1, 30, [10], "female"), mon(1, 31, [10], "male"), 1, data, rng).nature));
    expect(natures.size).toBeGreaterThan(10);
  });

  it("an Everstone passes its holder's nature about half the time, held by the mother, the father or Ditto (fixed seed)", () => {
    const rng = createRng(12);
    const mother = { ...mon(1, 30, [10], "female"), nature: 7 };
    const father = { ...mon(1, 31, [10], "male"), nature: 19 };
    const ditto = { ...mon(DITTO, 31, [144], "male"), gender: undefined, nature: 21 };
    const rate = (m: PartyMember, f: PartyMember, nature: number) => Array.from({ length: 400 }, () => makeEgg(m, f, 1, data, rng).nature).filter((n) => n === nature).length;
    for (const n of [rate(held(mother, 229), father, 7), rate(mother, held(father, 229), 19), rate(mother, held(ditto, 229), 21)]) {
      // 50% forced plus 1/25 of the rest: about 208 of 400.
      expect(n).toBeGreaterThan(170);
      expect(n).toBeLessThan(250);
    }
    expect(makeEgg(mother, held(father, 229), 1, data, zeros).nature).toBe(19);
  });

  it("with Everstones on both parents, either holder's nature can pass (fixed seed)", () => {
    const rng = createRng(13);
    const mother = held({ ...mon(1, 30, [10], "female"), nature: 7 }, 229);
    const father = held({ ...mon(1, 31, [10], "male"), nature: 19 }, 229);
    const natures = Array.from({ length: 200 }, () => makeEgg(mother, father, 1, data, rng).nature);
    expect(natures).toContain(7);
    expect(natures).toContain(19);
    expect(natures.filter((n) => n === 7 || n === 19).length).toBeGreaterThan(80);
  });
});

describe("makeGiftEgg (spec 029.5)", () => {
  // SetEggStats, as ScrCmd_GiveEgg and ScrCmd_GiveTogepiEgg use it: a level 1 egg with its hatch cycles, its level 1
  // moves and rolled IVs; GiveTogepiEgg puts Extrasensory (326) in the first empty slot, or the last when full.
  const data = { levelUp: () => [{ level: 1, move: 45 }, { level: 1, move: 204 }, { level: 9, move: 7 }], hatchCycles: () => 10, genderRatio: () => 31, hpMax: (m: PartyMember) => 10 + m.level };

  it("is a level 1 egg of the species with its level 1 moves and hatch cycles", () => {
    const egg = makeGiftEgg(175, data, createRng(1));
    expect(egg).toMatchObject({ species: 175, level: 1, experience: 0, moves: [45, 204], hp: 11, friendship: 120, egg: { cycles: 10 } });
    expect(["male", "female"]).toContain(egg.gender);
    expect(makeGiftEgg(175, data, createRng(1))).toEqual(egg);
  });

  it("adds the gift move in the first empty slot, or over the last when four are known", () => {
    expect(makeGiftEgg(175, data, createRng(1), 326).moves).toEqual([45, 204, 326]);
    const full = { ...data, levelUp: () => [1, 2, 3, 4].map((move) => ({ level: 1, move })) };
    expect(makeGiftEgg(175, full, createRng(1), 326).moves).toEqual([1, 2, 3, 326]);
  });
});
