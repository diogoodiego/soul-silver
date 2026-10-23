import { describe, expect, it } from "vitest";
import { parseGameDataFile } from "../../src/game-data/index.ts";

type Json = Record<string, unknown>;
type Kind = "learnsets" | "machines" | "tutors" | "evolutions" | "items" | "growth-rates";

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

const file = (kind: Kind, records: Json[]) => ({ kind, formatVersion: 1, records });
const check = (kind: Kind, record: Json) => parseGameDataFile(kind as never, file(kind, [record]), `${kind}.json`);

function rejects(kind: Kind, record: Json, field: string) {
  const result = check(kind, record);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.path.startsWith(`records.0.${field}`)).toBe(true);
}

const learnset: Json = { id: 1, levelUp: [{ level: 1, move: 33 }], machines: [1, 2], egg: [], tutors: [0] };
const machine: Json = { id: 1, kind: "tm", number: 1, move: 264 };
const tutor: Json = { id: 0, move: 291, cost: 40, area: 0 };
const evolution: Json = {
  id: 133,
  evolutions: [{ method: "use-item", methodId: 7, parameter: 83, condition: { kind: "item", item: 83 }, into: 135 }],
};
const item: Json = {
  id: 17,
  dataIndex: 17,
  name: { catalog: "item-names", index: 17 },
  price: 300,
  pocket: "medicine",
  battlePockets: 4,
  holdEffect: { id: 0, parameter: 20 },
  fling: { effect: 0, power: 30 },
  naturalGift: { power: 0, type: 31 },
  pluckEffect: 0,
  preventToss: false,
  selectable: false,
  fieldUse: 1,
  battleUse: 1,
  partyUse: { kind: 2, params: "14".padEnd(40, "0") },
};
const growth: Json = { id: 0, key: "medium-fast", experience: Array.from({ length: 100 }, (_, i) => i * i) };

describe("learnsets, machines and tutors schemas", () => {
  it("accepts valid records", () => {
    expect(check("learnsets", learnset).ok).toBe(true);
    expect(check("machines", machine).ok).toBe(true);
    expect(check("machines", { id: 93, kind: "hm", number: 1, move: 15 }).ok).toBe(true);
    expect(check("tutors", tutor).ok).toBe(true);
  });

  it("keeps odd level-up levels for the sanity report (7-bit field)", () => {
    expect(check("learnsets", patch(learnset, "levelUp", [{ level: 0, move: 1 }, { level: 127, move: 1 }])).ok).toBe(true);
    rejects("learnsets", patch(learnset, "levelUp", [{ level: 128, move: 1 }]), "levelUp.0.level");
  });

  it.each([
    ["negative move", "levelUp", [{ level: 1, move: -1 }]],
    ["machine id as text", "machines", ["1"]],
    ["egg move fraction", "egg", [1.5]],
    ["tutor id as text", "tutors", ["0"]],
  ])("rejects %s", (_name, field, value) => rejects("learnsets", patch(learnset, field, value), field));

  it.each([
    ["unknown kind", "kind", "tr"],
    ["TM number above 92", "number", 93],
    ["TM number zero", "number", 0],
    ["id above 100", "id", 101],
  ])("rejects a machine with %s", (_name, field, value) => rejects("machines", patch(machine, field, value), field));

  it("rejects an HM number above 8", () => {
    rejects("machines", { id: 93, kind: "hm", number: 9, move: 15 }, "number");
  });

  it("rejects a negative tutor cost", () => rejects("tutors", patch(tutor, "cost", -1), "cost"));
});

describe("evolutions schema", () => {
  it("accepts every condition kind", () => {
    const conditions: Json[] = [
      { kind: "none" },
      { kind: "level", level: 16 },
      { kind: "item", item: 83 },
      { kind: "move", move: 5 },
      { kind: "species", species: 223 },
      { kind: "beauty", minimum: 170 },
      { kind: "raw", value: 3 },
    ];
    for (const condition of conditions) {
      const entry = { method: "unknown", methodId: 99, parameter: 0, condition, into: 1 };
      expect(check("evolutions", patch(evolution, "evolutions", [entry])).ok).toBe(true);
    }
  });

  it("rejects a condition kind that does not exist", () => {
    const entry = { method: "level", methodId: 4, parameter: 1, condition: { kind: "weather" }, into: 1 };
    rejects("evolutions", patch(evolution, "evolutions", [entry]), "evolutions.0.condition");
  });

  it("rejects a condition missing its field", () => {
    const entry = { method: "level", methodId: 4, parameter: 1, condition: { kind: "level" }, into: 1 };
    rejects("evolutions", patch(evolution, "evolutions", [entry]), "evolutions.0.condition");
  });

  it("rejects an unknown method key", () => {
    const entry = { method: "dance", methodId: 4, parameter: 1, condition: { kind: "none" }, into: 1 };
    rejects("evolutions", patch(evolution, "evolutions", [entry]), "evolutions.0.method");
  });
});

describe("items schema", () => {
  it("accepts a valid record", () => expect(check("items", item).ok).toBe(true));

  it.each(["items", "medicine", "balls", "machines", "berries", "mail", "battle-items", "key-items"])("accepts pocket %s", (pocket) => {
    expect(check("items", patch(item, "pocket", pocket)).ok).toBe(true);
  });

  it.each([
    ["unknown pocket", "pocket", "bag"],
    ["params too short", "partyUse.params", "ab"],
    ["params in uppercase", "partyUse.params", "AB".repeat(20)],
    ["wrong name catalog", "name.catalog", "move-names"],
    ["selectable as number", "selectable", 1],
  ])("rejects %s", (_name, field, value) => rejects("items", patch(item, field, value), field));
});

describe("growth rates schema", () => {
  it("accepts a valid record", () => expect(check("growth-rates", growth).ok).toBe(true));

  it("leaves a decreasing curve to the sanity report", () => {
    const curve = Array.from({ length: 100 }, (_, i) => 1000 - i);
    expect(check("growth-rates", patch(growth, "experience", curve)).ok).toBe(true);
  });

  it.each([
    ["99 values", "experience", Array.from({ length: 99 }, () => 1)],
    ["101 values", "experience", Array.from({ length: 101 }, () => 1)],
    ["unknown key", "key", "turbo"],
    ["id above 5", "id", 6],
  ])("rejects %s", (_name, field, value) => rejects("growth-rates", patch(growth, field, value), field));
});
