import { describe, expect, it } from "vitest";
import { parseGameDataJson } from "../../src/game-data/index.ts";

// SC-004: a hand-edited file is refused at load time, saying file, field path and problem.

const move = (id: number) => ({
  id,
  name: { catalog: "move-names", index: id },
  type: 0,
  category: "physical",
  power: 40,
  accuracy: 100,
  pp: 35,
  priority: 0,
  target: "selected",
  targetRaw: 0,
  flags: { contact: true, protect: true, magicCoat: false, snatch: false, mirrorMove: true, kingsRock: true, keepHpBar: false, hideShadow: false },
  flagsRaw: 115,
  effect: { id: 0, chance: 0 },
  contest: { effect: 5, type: 4 },
});

const valid = () => ({ kind: "moves", formatVersion: 1, records: [move(1), move(2), move(3)] });
const load = (value: unknown) => parseGameDataJson("moves", JSON.stringify(value, null, 2), "moves.json");

describe("loading a moves file", () => {
  it("accepts the untouched file", () => {
    expect(load(valid()).ok).toBe(true);
  });

  it.each<[string, (file: ReturnType<typeof valid>) => unknown, string]>([
    ["accuracy above a byte", (f) => ((f.records[1] as { accuracy: number }).accuracy = 300, f), "records.1.accuracy"],
    ["a category that does not exist", (f) => ((f.records[0] as { category: string }).category = "magic", f), "records.0.category"],
    ["a missing pp", (f) => (delete (f.records[2] as { pp?: number }).pp, f), "records.2.pp"],
    ["an extra field", (f) => ((f.records[0] as Record<string, unknown>)["foo"] = 1, f), "records.0.foo"],
    ["ids out of order", (f) => (f.records.reverse(), f), "records.1.id"],
    ["another format version", (f) => ((f as { formatVersion: number }).formatVersion = 2, f), "formatVersion"],
  ])("refuses %s", (_name, edit, path) => {
    const result = load(edit(valid()));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.file).toBe("moves.json");
      expect(result.error.path).toBe(path);
      expect(result.error.problem.length).toBeGreaterThan(0);
    }
  });

  it("refuses text that is not JSON", () => {
    const result = parseGameDataJson("moves", "{records: [", "moves.json");
    expect(result).toMatchObject({ ok: false, error: { file: "moves.json", path: "" } });
  });
});
