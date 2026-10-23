import { describe, expect, it } from "vitest";
import { readPersonal } from "../../src/data/readers/personal.ts";
import { personal, syntheticLayout } from "../fixtures/game-data/builders.ts";

const layout = syntheticLayout();

describe("readPersonal", () => {
  it("maps every field of a species", () => {
    const bytes = personal({
      stats: [78, 84, 78, 100, 109, 85],
      types: [10, 2],
      catchRate: 45,
      baseExperience: 209,
      evYield: [0, 0, 0, 0, 3, 0],
      heldItems: [2, 5],
      gender: 31,
      hatchCycles: 20,
      friendship: 70,
      growth: 3,
      eggGroups: [1, 14],
      abilities: [66, 0],
      flee: 7,
      color: 0x83,
    });
    expect(readPersonal(bytes, 1, layout)).toEqual({
      id: 1,
      species: 1,
      form: 0,
      name: { catalog: "species-names", index: 1 },
      baseStats: { hp: 78, attack: 84, defense: 78, speed: 100, specialAttack: 109, specialDefense: 85 },
      types: [10, 2],
      abilities: [66],
      catchRate: 45,
      baseExperience: 209,
      evYield: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 3, specialDefense: 0 },
      gender: { kind: "mixed", raw: 31 },
      growthRate: "medium-slow",
      eggGroups: ["monster", "dragon"],
      heldItems: { common: 2, rare: 5 },
      hatchCycles: 20,
      baseFriendship: 70,
      safariFleeRate: 7,
      color: { id: 3, flip: true },
      forms: [],
    });
  });

  it("reads the stats in file order: hp, attack, defense, speed, special attack, special defense", () => {
    const { baseStats } = readPersonal(personal({ stats: [1, 2, 3, 4, 5, 6] }), 1, layout);
    expect(baseStats).toEqual({ hp: 1, attack: 2, defense: 3, speed: 4, specialAttack: 5, specialDefense: 6 });
  });

  it("decodes two EV bits per stat in the same order", () => {
    const { evYield } = readPersonal(personal({ evYield: [1, 2, 3, 0, 1, 2] }), 1, layout);
    expect(evYield).toEqual({ hp: 1, attack: 2, defense: 3, speed: 0, specialAttack: 1, specialDefense: 2 });
  });

  it("keeps a single type, a single ability and a single egg group when the pair repeats or is empty", () => {
    const record = readPersonal(personal({ types: [14, 14], abilities: [26, 0], eggGroups: [15, 15] }), 1, layout);
    expect(record.types).toEqual([14]);
    expect(record.abilities).toEqual([26]);
    expect(record.eggGroups).toEqual(["undiscovered"]);
  });

  it("keeps two abilities when both are set", () => {
    expect(readPersonal(personal({ abilities: [1, 3] }), 1, layout).abilities).toEqual([1, 3]);
  });

  it.each([
    [0, "male-only"],
    [254, "female-only"],
    [255, "genderless"],
    [31, "mixed"],
    [127, "mixed"],
  ] as const)("classifies gender raw %i as %s", (raw, kind) => {
    expect(readPersonal(personal({ gender: raw }), 1, layout).gender).toEqual({ kind, raw });
  });

  it("turns held item 0 into null", () => {
    expect(readPersonal(personal({ heldItems: [0, 7] }), 1, layout).heldItems).toEqual({ common: null, rare: 7 });
  });

  it("maps the six growth groups", () => {
    const keys = ["medium-fast", "erratic", "fluctuating", "medium-slow", "fast", "slow"];
    keys.forEach((key, group) => expect(readPersonal(personal({ growth: group }), 1, layout).growthRate).toBe(key));
  });

  it("reads the color id and the flip bit", () => {
    expect(readPersonal(personal({ color: 0x05 }), 1, layout).color).toEqual({ id: 5, flip: false });
    expect(readPersonal(personal({ color: 0x85 }), 1, layout).color).toEqual({ id: 5, flip: true });
  });

  it("resolves alternate forms to their species and form number", () => {
    const form = readPersonal(personal(), 9, layout);
    expect(form).toMatchObject({ id: 9, species: 3, form: 1, name: { catalog: "species-names", index: 3 }, forms: [] });
  });

  it("lists the forms of a base species", () => {
    expect(readPersonal(personal(), 3, layout).forms).toEqual([9]);
    expect(readPersonal(personal(), 5, layout).forms).toEqual([10]);
    expect(readPersonal(personal(), 1, layout).forms).toEqual([]);
  });

  it("throws when the record is shorter than 44 bytes", () => {
    expect(() => readPersonal(personal().subarray(0, 43), 1, layout)).toThrow(/44/);
  });

  it("throws, naming the record, for an egg group or growth group the game never uses", () => {
    expect(() => readPersonal(personal({ eggGroups: [0, 0] }), 4, layout)).toThrow(/grupo de ovo.*4/i);
    expect(() => readPersonal(personal({ growth: 9 }), 4, layout)).toThrow(/crescimento.*4/i);
  });
});
