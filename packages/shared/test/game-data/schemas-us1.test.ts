import { describe, expect, it } from "vitest";
import { parseGameDataFile } from "../../src/game-data/index.ts";

type Json = Record<string, unknown>;

/** Deep copy of `base` with the value at a dotted `path` replaced (or removed with `undefined`). */
function patch(base: Json, path: string, value: unknown): Json {
  const copy = structuredClone(base);
  const keys = path.split(".");
  let node: Json = copy;
  for (const key of keys.slice(0, -1)) node = node[key] as Json;
  const last = keys.at(-1)!;
  if (value === undefined) delete node[last];
  else node[last] = value;
  return copy;
}

const file = (kind: string, records: Json[], extra: Json = {}) => ({ kind, formatVersion: 1, ...extra, records });

function check(kind: "species" | "moves" | "types" | "type-chart" | "natures" | "abilities", value: unknown) {
  return parseGameDataFile(kind as never, value, `${kind}.json`);
}

function expectPath(kind: Parameters<typeof check>[0], record: Json, path: string, extra: Json = {}) {
  const result = check(kind, file(kind, [record], extra));
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.path).toBe(path);
}

// ------------------------------------------------------------------ species

const species: Json = {
  id: 6,
  species: 6,
  form: 0,
  name: { catalog: "species-names", index: 6 },
  baseStats: { hp: 78, attack: 84, defense: 78, speed: 100, specialAttack: 109, specialDefense: 85 },
  types: [10, 2],
  abilities: [66],
  catchRate: 45,
  baseExperience: 209,
  evYield: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 3, specialDefense: 0 },
  gender: { kind: "mixed", raw: 31 },
  growthRate: "medium-slow",
  eggGroups: ["monster", "dragon"],
  heldItems: { common: null, rare: null },
  hatchCycles: 20,
  baseFriendship: 70,
  safariFleeRate: 0,
  color: { id: 0, flip: false },
  forms: [],
};

describe("species schema", () => {
  it("accepts a valid record and its variants", () => {
    expect(check("species", file("species", [species])).ok).toBe(true);
    for (const [path, value] of [
      ["types", [10]],
      ["abilities", [66, 67]],
      ["eggGroups", ["undiscovered"]],
      ["heldItems", { common: 2, rare: 5 }],
      ["gender", { kind: "genderless", raw: 255 }],
      ["forms", [496, 497]],
    ] as const) {
      expect(check("species", file("species", [patch(species, path, value)])).ok).toBe(true);
    }
  });

  it.each<[string, unknown, string]>([
    ["hp above a byte", 256, "baseStats.hp"],
    ["negative speed", -1, "baseStats.speed"],
  ])("rejects %s", (_name, value, field) => {
    expectPath("species", patch(species, field, value), `records.0.${field}`);
  });

  it.each<[string, string, unknown]>([
    ["no type", "types", []],
    ["three types", "types", [1, 2, 3]],
    ["type above a byte", "types", [300]],
    ["no ability", "abilities", []],
    ["three abilities", "abilities", [1, 2, 3]],
    ["catch rate above a byte", "catchRate", 256],
    ["base experience above a byte", "baseExperience", 256],
    ["EV yield above 3", "evYield.attack", 4],
    ["unknown gender kind", "gender.kind", "other"],
    ["gender raw above a byte", "gender.raw", 256],
    ["unknown growth rate", "growthRate", "turbo"],
    ["no egg group", "eggGroups", []],
    ["three egg groups", "eggGroups", ["monster", "dragon", "bug"]],
    ["unknown egg group", "eggGroups", ["nope"]],
    ["negative held item", "heldItems.common", -1],
    ["held item as zero string", "heldItems.rare", "0"],
    ["wrong name catalog", "name.catalog", "move-names"],
    ["fractional form", "forms", [1.5]],
    ["missing gender", "gender", undefined],
  ])("rejects %s", (_name, field, value) => {
    const result = check("species", file("species", [patch(species, field, value)]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.path.startsWith(`records.0.${field}`)).toBe(true);
  });

  it("rejects unknown fields", () => {
    expectPath("species", { ...species, secret: 1 }, "records.0.secret");
  });
});

// ------------------------------------------------------------------ moves

const move: Json = {
  id: 53,
  name: { catalog: "move-names", index: 53 },
  type: 10,
  category: "special",
  power: 95,
  accuracy: 100,
  pp: 15,
  priority: 0,
  target: "selected",
  targetRaw: 0,
  flags: { contact: false, protect: true, magicCoat: false, snatch: false, mirrorMove: true, kingsRock: false, keepHpBar: false, hideShadow: false },
  flagsRaw: 18,
  effect: { id: 4, chance: 10 },
  contest: { effect: 17, type: 1 },
};

const TARGETS = ["selected", "depends", "random", "both-foes", "all-others", "user", "user-side", "field", "foe-side", "ally", "user-or-ally", "foe", "unknown"];

describe("moves schema", () => {
  it("accepts a valid record, a null accuracy and every target key", () => {
    expect(check("moves", file("moves", [move])).ok).toBe(true);
    expect(check("moves", file("moves", [patch(move, "accuracy", null)])).ok).toBe(true);
    for (const target of TARGETS) expect(check("moves", file("moves", [patch(move, "target", target)])).ok).toBe(true);
  });

  it("keeps out-of-range game values for the sanity report to flag", () => {
    expect(check("moves", file("moves", [patch(move, "accuracy", 150)])).ok).toBe(true);
    expect(check("moves", file("moves", [patch(move, "pp", 99)])).ok).toBe(true);
    expect(check("moves", file("moves", [patch(move, "priority", -100)])).ok).toBe(true);
  });

  it.each<[string, string, unknown]>([
    ["unknown category", "category", "magic"],
    ["accuracy above a byte", "accuracy", 300],
    ["accuracy zero (stored as null)", "accuracy", "always"],
    ["unknown target", "target", "everywhere"],
    ["missing flag", "flags.contact", undefined],
    ["flag that is not a boolean", "flags.protect", 1],
    ["chance above a byte", "effect.chance", 256],
    ["effect id above 16 bits", "effect.id", 70000],
    ["wrong name catalog", "name.catalog", "item-names"],
    ["missing pp", "pp", undefined],
    ["priority out of a signed byte", "priority", 128],
  ])("rejects %s", (_name, field, value) => {
    const result = check("moves", file("moves", [patch(move, field, value)]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.path.startsWith(`records.0.${field}`)).toBe(true);
  });
});

// ------------------------------------------------------------------ tables

describe("types and type chart schemas", () => {
  const type: Json = { id: 10, key: "fire", name: { catalog: "type-names", index: 10 } };
  const row = Array.from({ length: 18 }, () => 10);
  const chart: Json = { id: 10, against: row };

  it("accepts valid records", () => {
    expect(check("types", file("types", [type])).ok).toBe(true);
    expect(check("type-chart", file("type-chart", [chart], { foresightIgnored: [{ attacker: 0, defender: 7 }] })).ok).toBe(true);
    expect(check("type-chart", file("type-chart", [patch(chart, "against.3", 20)], { foresightIgnored: [] })).ok).toBe(true);
  });

  it("rejects an unknown type key", () => {
    expectPath("types", patch(type, "key", "cosmic"), "records.0.key");
  });

  it("rejects a row that does not have 18 values", () => {
    const result = check("type-chart", file("type-chart", [{ id: 0, against: row.slice(1) }], { foresightIgnored: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.path).toBe("records.0.against");
  });

  it("rejects a multiplier outside 0, 5, 10 and 20", () => {
    expectPath("type-chart", patch(chart, "against.3", 15), "records.0.against.3", { foresightIgnored: [] });
  });

  it("requires foresightIgnored with attacker/defender pairs", () => {
    expect(check("type-chart", file("type-chart", [chart])).ok).toBe(false);
    expectPath("type-chart", chart, "foresightIgnored.0.attacker", { foresightIgnored: [{ attacker: "normal", defender: 7 }] });
  });
});

describe("natures schema", () => {
  const nature: Json = { id: 1, name: { catalog: "nature-names", index: 1 }, increased: "attack", decreased: "defense" };

  it("accepts boosted/lowered and neutral natures", () => {
    expect(check("natures", file("natures", [nature])).ok).toBe(true);
    expect(check("natures", file("natures", [{ ...nature, id: 0, increased: null, decreased: null }])).ok).toBe(true);
  });

  it("rejects hp as a boosted or lowered stat", () => {
    expectPath("natures", patch(nature, "increased", "hp"), "records.0.increased");
  });

  it("rejects one null and one set", () => {
    const result = check("natures", file("natures", [patch(nature, "decreased", null)]));
    expect(result.ok).toBe(false);
  });

  it("rejects the same stat raised and lowered", () => {
    expect(check("natures", file("natures", [patch(nature, "decreased", "attack")])).ok).toBe(false);
  });
});

describe("abilities schema", () => {
  const ability: Json = { id: 66, name: { catalog: "ability-names", index: 66 } };

  it("accepts a valid record", () => {
    expect(check("abilities", file("abilities", [ability])).ok).toBe(true);
  });

  it("rejects a wrong catalog", () => {
    expectPath("abilities", patch(ability, "name.catalog", "move-names"), "records.0.name.catalog");
  });
});
