import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDataStages } from "../../src/data/stages.ts";
import { SYNTHETIC_EXPERIENCE, SYNTHETIC_MACHINE_MOVE, syntheticLayout } from "../fixtures/game-data/builders.ts";
import { sandbox, type Sandbox } from "../pipeline/helpers.ts";
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
const narc = { kind: "stage", stage: "rom-unpack", output: "narc" };
const filesystem = { kind: "stage", stage: "rom-unpack", output: "filesystem" };
const code = { kind: "stage", stage: "code-decompress", output: "code" };

describe("data stage metadata (progression)", () => {
  it.each([
    ["data-learnsets", "Lendo os golpes que cada Pokémon aprende", [narc, filesystem, code], 2],
    ["data-evolutions", "Lendo as evoluções", [narc], 1],
    ["data-items", "Lendo os itens", [narc, code], 1],
  ])("%s", (id, title, inputs, mib) => {
    expect(stage(id)).toMatchObject({ id, title, version: 1, weight: 1, inputs, outputs: ["json"] });
    expect(stage(id).estimateBytes(1)).toBe(mib * 1024 * 1024);
  });

  it("registers all six data stages", () => {
    expect(createDataStages(syntheticLayout()).map((s) => s.id).sort()).toEqual([
      "data-evolutions", "data-items", "data-learnsets", "data-moves", "data-species", "data-tables",
    ]);
  });
});

describe("data-learnsets", () => {
  it("writes one learnset per species and form", async () => {
    const { records } = await readData(box, "learnsets");
    expect(records.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 6, 9, 10]);
  });

  it("combines level-up, machine, egg and tutor lists", async () => {
    const { records } = await readData(box, "learnsets");
    const byId = new Map(records.map((r) => [r.id, r]));
    expect(byId.get(1)).toEqual({
      id: 1,
      levelUp: [{ level: 1, move: 1 }, { level: 3, move: 2 }, { level: 7, move: 3 }],
      machines: [1, 2, 93],
      egg: [4, 5],
      tutors: [0, 1],
    });
    expect(byId.get(2)).toMatchObject({ levelUp: [{ level: 1, move: 1 }, { level: 1, move: 2 }, { level: 20, move: 4 }], machines: [], egg: [], tutors: [] });
    expect(byId.get(4)).toMatchObject({ egg: [2], tutors: [] });
    expect(byId.get(6)).toMatchObject({ machines: [100], tutors: [0, 1, 2] });
  });

  it("gives forms their own lists, with no egg moves", async () => {
    const { records } = await readData(box, "learnsets");
    const byId = new Map(records.map((r) => [r.id, r]));
    expect(byId.get(9)).toMatchObject({ levelUp: [{ level: 1, move: 1 }, { level: 40, move: 7 }], egg: [], tutors: [0] });
    expect(byId.get(10)).toMatchObject({ egg: [], tutors: [0, 1, 2] });
  });

  it("writes the 100 machines, TMs first and then HMs", async () => {
    const { records } = await readData(box, "machines");
    expect(records).toHaveLength(100);
    expect(records[0]).toEqual({ id: 1, kind: "tm", number: 1, move: SYNTHETIC_MACHINE_MOVE(1) });
    expect(records[92]).toEqual({ id: 93, kind: "hm", number: 1, move: SYNTHETIC_MACHINE_MOVE(93) });
    expect(records.filter((m) => m.kind === "tm")).toHaveLength(92);
    expect(records.filter((m) => m.kind === "hm")).toHaveLength(8);
  });

  it("writes the tutors in game order", async () => {
    const { records } = await readData(box, "tutors");
    expect(records).toEqual([
      { id: 0, move: 3, cost: 40, area: 0 },
      { id: 1, move: 6, cost: 32, area: 1 },
      { id: 2, move: 8, cost: 0, area: 3 },
    ]);
  });
});

describe("data-evolutions", () => {
  it("writes only species and forms that evolve", async () => {
    const { records } = await readData(box, "evolutions");
    expect(records.map((r) => r.id)).toEqual([1, 2]);
  });

  it("keeps method, original id, parameter, condition and target", async () => {
    const { records } = await readData(box, "evolutions");
    expect(records[0]!.evolutions).toEqual([
      { method: "level", methodId: 4, parameter: 16, condition: { kind: "level", level: 16 }, into: 2 },
    ]);
    expect(records[1]!.evolutions.map((e) => [e.method, e.condition, e.into])).toEqual([
      ["level", { kind: "level", level: 32 }, 3],
      ["use-item", { kind: "item", item: 3 }, 4],
      ["knows-move", { kind: "move", move: 5 }, 5],
    ]);
  });
});

describe("data-items", () => {
  it("skips item ids that point to data 0", async () => {
    const { records } = await readData(box, "items");
    expect(records.map((r) => r.id)).toEqual([1, 2, 3, 5, 6, 7, 8, 9]);
  });

  it("reads price, pocket, uses and the raw effect fields", async () => {
    const { records } = await readData(box, "items");
    const byId = new Map(records.map((r) => [r.id, r]));
    expect(byId.get(1)).toMatchObject({ dataIndex: 1, price: 200, pocket: "balls", battleUse: 1, battlePockets: 4, selectable: true });
    expect(byId.get(2)).toMatchObject({ pocket: "medicine", fieldUse: 1, partyUse: { kind: 2 } });
    expect(byId.get(2)!.partyUse.params.startsWith("14")).toBe(true);
    expect(byId.get(2)!.partyUse.params.endsWith("ab")).toBe(true);
    expect(byId.get(3)).toMatchObject({ pocket: "key-items", preventToss: true, price: 0 });
    expect(byId.get(5)).toMatchObject({ dataIndex: 4, pocket: "berries", naturalGift: { power: 60, type: 12 }, fling: { power: 10 } });
    expect(byId.get(6)).toMatchObject({ pocket: "machines" });
    expect(byId.get(7)).toMatchObject({ holdEffect: { id: 70, parameter: 20 }, price: 600 });
    expect(byId.get(9)).toMatchObject({ pocket: "battle-items", battleUse: 2 });
  });
});

describe("data-tables (experience)", () => {
  it("writes the six growth groups with 100 levels each", async () => {
    const { records } = await readData(box, "growth-rates");
    expect(records.map((r) => r.key)).toEqual(["medium-fast", "erratic", "fluctuating", "medium-slow", "fast", "slow"]);
    expect(records[3]!.experience[49]).toBe(SYNTHETIC_EXPERIENCE(3, 50));
    expect(records[5]!.experience).toHaveLength(100);
  });
});
