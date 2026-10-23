import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDataStages } from "../../src/data/stages.ts";
import { sandbox, type Sandbox } from "../pipeline/helpers.ts";
import { syntheticLayout } from "../fixtures/game-data/builders.ts";
import { extractSynthetic, readData } from "./helpers.ts";

let box: Sandbox;
beforeEach(async () => {
  box = await sandbox();
  await extractSynthetic(box);
});
afterEach(async () => {
  await box.cleanup();
});

const stage = (id: string) => createDataStages(syntheticLayout()).find((s) => s.id === id)!;

describe("data stage metadata", () => {
  it.each([
    ["data-species", "Lendo os Pokémon", [{ kind: "stage", stage: "rom-unpack", output: "narc" }]],
    ["data-moves", "Lendo os golpes", [{ kind: "stage", stage: "rom-unpack", output: "narc" }]],
    [
      "data-tables",
      "Lendo tipos, naturezas e experiência",
      [
        { kind: "stage", stage: "rom-unpack", output: "narc" },
        { kind: "stage", stage: "code-decompress", output: "code" },
      ],
    ],
  ])("%s", (id, title, inputs) => {
    expect(stage(id)).toMatchObject({ id, title, version: 1, weight: 1, inputs, outputs: ["json"] });
    expect(stage(id).estimateBytes(1)).toBe(1024 * 1024);
  });
});

describe("data-species", () => {
  it("writes species and forms in id order, leaving out the egg entries", async () => {
    const file = await readData(box, "species");
    expect(file.records.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 6, 9, 10]);
  });

  it("reads every field of a species", async () => {
    const { records } = await readData(box, "species");
    expect(records[0]).toEqual({
      id: 1,
      species: 1,
      form: 0,
      name: { catalog: "species-names", index: 1 },
      baseStats: { hp: 45, attack: 49, defense: 49, speed: 45, specialAttack: 65, specialDefense: 65 },
      types: [12, 3],
      abilities: [65],
      catchRate: 45,
      baseExperience: 64,
      evYield: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 1, specialDefense: 0 },
      gender: { kind: "mixed", raw: 31 },
      growthRate: "medium-slow",
      eggGroups: ["monster", "grass"],
      heldItems: { common: null, rare: null },
      hatchCycles: 20,
      baseFriendship: 70,
      safariFleeRate: 0,
      color: { id: 0, flip: false },
      forms: [],
    });
  });

  it("covers the special cases: single type, color flip, genderless, held items", async () => {
    const { records } = await readData(box, "species");
    const byId = new Map(records.map((r) => [r.id, r]));
    expect(byId.get(4)).toMatchObject({ types: [10], color: { id: 1, flip: true } });
    expect(byId.get(5)).toMatchObject({
      types: [14],
      gender: { kind: "genderless", raw: 255 },
      eggGroups: ["undiscovered"],
      heldItems: { common: 2, rare: 5 },
      growthRate: "slow",
    });
    expect(byId.get(6)).toMatchObject({ gender: { kind: "male-only", raw: 0 }, abilities: [1, 3], growthRate: "medium-fast" });
  });

  it("ties alternate forms to their base species", async () => {
    const { records } = await readData(box, "species");
    const byId = new Map(records.map((r) => [r.id, r]));
    expect(byId.get(3)).toMatchObject({ forms: [9] });
    expect(byId.get(9)).toMatchObject({ species: 3, form: 1, forms: [], name: { catalog: "species-names", index: 3 } });
    expect(byId.get(5)).toMatchObject({ forms: [10] });
    expect(byId.get(10)).toMatchObject({ species: 5, form: 1, types: [14, 15] });
  });
});

describe("data-moves", () => {
  it("writes moves 1 to the count, skipping the empty entry and the unused ones", async () => {
    const { records } = await readData(box, "moves");
    expect(records.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("reads the cases the spec calls out", async () => {
    const { records } = await readData(box, "moves");
    const byId = new Map(records.map((r) => [r.id, r]));
    expect(byId.get(1)).toMatchObject({ category: "physical", power: 40, accuracy: 100, pp: 35, flagsRaw: 0x73 });
    expect(byId.get(2)).toMatchObject({ category: "status", power: 0, target: "all-others", effect: { id: 45, chance: 0 } });
    expect(byId.get(3)).toMatchObject({ accuracy: null });
    expect(byId.get(4)).toMatchObject({ power: 1, effect: { id: 197, chance: 0 } });
    expect(byId.get(5)).toMatchObject({ priority: 1 });
    expect(byId.get(6)).toMatchObject({ priority: -6 });
    expect(byId.get(7)).toMatchObject({ category: "special", type: 10, effect: { id: 4, chance: 10 } });
    expect(byId.get(8)).toMatchObject({ target: "unknown", targetRaw: 3 });
  });
});

describe("data-tables", () => {
  it("writes the 18 types and the type chart with the Foresight pairs", async () => {
    const types = await readData(box, "types");
    expect(types.records).toHaveLength(18);
    const chart = await readData(box, "type-chart");
    expect(chart.records).toHaveLength(18);
    expect(chart.records[10]!.against[10]).toBe(5);
    expect(chart.records[10]!.against[12]).toBe(20);
    expect(chart.records[13]!.against[4]).toBe(0);
    expect(chart.records[0]!.against[7]).toBe(0);
    expect(chart.foresightIgnored).toEqual([
      { attacker: 0, defender: 7 },
      { attacker: 1, defender: 7 },
    ]);
  });

  it("writes the 25 natures", async () => {
    const { records } = await readData(box, "natures");
    expect(records).toHaveLength(25);
    expect(records[1]).toMatchObject({ increased: "attack", decreased: "defense" });
    expect(records[0]).toMatchObject({ increased: null, decreased: null });
  });

  it("writes abilities 1 to the bank's entry count minus one", async () => {
    const { records } = await readData(box, "abilities");
    expect(records.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(records[2]).toEqual({ id: 3, name: { catalog: "ability-names", index: 3 } });
  });
});
