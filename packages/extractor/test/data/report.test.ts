import { readFile, rm, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSanityReport, type ExpectedCounts, type SanityReport } from "../../src/data/report.ts";
import type { GameDataFileOf, GameDataKind } from "@soulsilver/shared/game-data";
import { type SyntheticInputs, syntheticInputs, syntheticLayout } from "../fixtures/game-data/builders.ts";
import { sandbox, type Sandbox } from "../pipeline/helpers.ts";
import { dataFilePath, extractSynthetic } from "./helpers.ts";

const EXPECTED: ExpectedCounts = {
  species: 6,
  forms: 2,
  moves: 8,
  abilities: 3,
  items: 8,
  tms: 92,
  hms: 8,
  tutors: 3,
  natures: 25,
  types: 18,
  growthRates: 6,
  learnsets: 8,
};

/** The default world uses real ability ids (65, 66…) but a 3-entry name bank; keep ids inside it. */
function inputsWithValidAbilities(): SyntheticInputs {
  const inputs = syntheticInputs();
  inputs.personal = inputs.personal.map((bytes, index) => {
    if (index === 0 || index === 7 || index === 8) return bytes;
    const copy = bytes.slice();
    copy[0x16] = ((copy[0x16]! - 1) % 3) + 1;
    return copy;
  });
  return inputs;
}

let box: Sandbox;
beforeEach(async () => {
  box = await sandbox();
  await extractSynthetic(box, { inputs: inputsWithValidAbilities() });
});
afterEach(async () => {
  await box.cleanup();
});

const report = () => buildSanityReport(box.workspaceDir, { expected: EXPECTED, layout: syntheticLayout() });
const count = (r: SanityReport, name: string) => r.counts.find((c) => c.name === name)!;

/** Edits a generated file in place, the way a hand edit or a reader bug would. */
async function edit<K extends GameDataKind>(kind: K, change: (file: GameDataFileOf<K>) => void): Promise<void> {
  const path = dataFilePath(box, kind);
  const file = JSON.parse(await readFile(path, "utf8")) as GameDataFileOf<K>;
  change(file);
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`);
}

describe("buildSanityReport on correct data", () => {
  it("is ok, with every file valid, every count matching and no warnings", async () => {
    const r = await report();
    expect(r.ok).toBe(true);
    expect(r.files).toHaveLength(12);
    expect(r.files.every((f) => f.status === "ok")).toBe(true);
    expect(r.counts.every((c) => c.ok)).toBe(true);
    expect(r.counts).toHaveLength(12);
    expect(r.warnings).toEqual([]);
  });

  it("reports the counts by name", async () => {
    const r = await report();
    expect(count(r, "espécies")).toEqual({ name: "espécies", expected: 6, actual: 6, ok: true });
    expect(count(r, "formas alternativas").actual).toBe(2);
    expect(count(r, "TMs").actual).toBe(92);
    expect(count(r, "HMs").actual).toBe(8);
  });

  it("lists what the extraction deliberately ignores", async () => {
    const r = await report();
    const text = r.ignored.map((i) => `${i.kind}: ${i.detail}`).join("\n");
    expect(text).toMatch(/moves/);
    expect(text).toMatch(/growth-rates/);
    expect(text).toMatch(/items/);
    expect(r.ignored.find((i) => i.kind === "items")!.detail).toMatch(/^2 ids/);
  });
});

describe("buildSanityReport failures", () => {
  it("fails with status missing when a file is absent", async () => {
    await rm(dataFilePath(box, "moves"));
    const r = await report();
    expect(r.ok).toBe(false);
    expect(r.files.find((f) => f.kind === "moves")).toMatchObject({ status: "missing", file: "moves.json" });
    expect(count(r, "golpes")).toMatchObject({ actual: 0, ok: false });
  });

  it("fails with status invalid, path and problem when a file breaks its schema", async () => {
    await edit("species", (file) => {
      (file.records[0] as { types: number[] }).types = [];
    });
    const r = await report();
    expect(r.ok).toBe(false);
    const entry = r.files.find((f) => f.kind === "species")!;
    expect(entry.status).toBe("invalid");
    expect(entry.error?.path.startsWith("records.0.types")).toBe(true);
    expect(entry.error?.problem.length).toBeGreaterThan(0);
  });

  it("fails when a count does not match, showing actual and expected", async () => {
    await edit("moves", (file) => {
      file.records.pop();
    });
    const r = await report();
    expect(r.ok).toBe(false);
    expect(count(r, "golpes")).toEqual({ name: "golpes", expected: 8, actual: 7, ok: false });
  });

  it("fails when an expected count is not what the files hold", async () => {
    const r = await buildSanityReport(box.workspaceDir, { expected: { ...EXPECTED, species: 493 } });
    expect(r.ok).toBe(false);
    expect(count(r, "espécies")).toMatchObject({ expected: 493, actual: 6, ok: false });
  });
});

describe("buildSanityReport warnings", () => {
  async function warningsAfter<K extends GameDataKind>(kind: K, change: (file: GameDataFileOf<K>) => void) {
    await edit(kind, change);
    const r = await report();
    expect(r.ok).toBe(true);
    return r.warnings;
  }

  it("flags a base stat of 0", async () => {
    const warnings = await warningsAfter("species", (f) => {
      f.records[0]!.baseStats.hp = 0;
    });
    expect(warnings).toEqual([{ kind: "species", recordId: 1, field: "baseStats.hp", value: "0", expected: "1–255" }]);
  });

  it("flags an ability the name bank does not have", async () => {
    const warnings = await warningsAfter("species", (f) => {
      f.records[1]!.abilities = [99];
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ kind: "species", recordId: 2, field: "abilities.0", value: "99" });
  });

  it("flags a held item that does not exist", async () => {
    const warnings = await warningsAfter("species", (f) => {
      f.records.find((r) => r.id === 5)!.heldItems.common = 4;
    });
    expect(warnings).toEqual([expect.objectContaining({ kind: "species", recordId: 5, field: "heldItems.common", value: "4" })]);
  });

  it("flags an accuracy above 100", async () => {
    const warnings = await warningsAfter("moves", (f) => {
      f.records[0]!.accuracy = 150;
    });
    expect(warnings).toEqual([{ kind: "moves", recordId: 1, field: "accuracy", value: "150", expected: "1–100 ou null" }]);
  });

  it("flags a PP, a priority and an effect chance out of range", async () => {
    const warnings = await warningsAfter("moves", (f) => {
      f.records[1]!.pp = 0;
      f.records[2]!.priority = 9;
      f.records[3]!.effect.chance = 150;
    });
    expect(warnings.map((w) => `${w.recordId}:${w.field}`)).toEqual(["2:pp", "3:priority", "4:effect.chance"]);
  });

  it("flags a learnset move that is not in moves.json", async () => {
    const warnings = await warningsAfter("learnsets", (f) => {
      f.records[0]!.levelUp[0]!.move = 400;
    });
    expect(warnings).toEqual([expect.objectContaining({ kind: "learnsets", recordId: 1, field: "levelUp.0.move", value: "400" })]);
  });

  it("flags a level-up level outside 1–100", async () => {
    const warnings = await warningsAfter("learnsets", (f) => {
      f.records[0]!.levelUp[0]!.level = 0;
    });
    expect(warnings).toEqual([expect.objectContaining({ field: "levelUp.0.level", value: "0", expected: "1–100" })]);
  });

  it("flags an evolution with an unknown method", async () => {
    const warnings = await warningsAfter("evolutions", (f) => {
      Object.assign(f.records[0]!.evolutions[0]!, { method: "unknown", methodId: 99, condition: { kind: "raw", value: 16 } });
    });
    expect(warnings).toEqual([expect.objectContaining({ kind: "evolutions", recordId: 1, field: "evolutions.0.method", value: "unknown" })]);
  });

  it("flags an evolution into a species that does not exist", async () => {
    const warnings = await warningsAfter("evolutions", (f) => {
      f.records[0]!.evolutions[0]!.into = 400;
    });
    expect(warnings).toEqual([expect.objectContaining({ field: "evolutions.0.into", value: "400" })]);
  });

  it("flags an experience curve that decreases", async () => {
    const warnings = await warningsAfter("growth-rates", (f) => {
      f.records[2]!.experience[5] = 0;
    });
    expect(warnings).toEqual([expect.objectContaining({ kind: "growth-rates", recordId: 2, field: "experience.5" })]);
  });

  it("flags a type id that does not exist", async () => {
    const warnings = await warningsAfter("moves", (f) => {
      f.records[0]!.type = 40;
    });
    expect(warnings).toEqual([expect.objectContaining({ kind: "moves", field: "type", value: "40", expected: "tipo de 0 a 17" })]);
  });
});
