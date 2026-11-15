import { describe, expect, it } from "vitest";
import { mapBlocks, parseBlocksFile, type BlocksFile } from "../map-blocks.ts";

const plan: BlocksFile = {
  blocks: { "030": "Violet", "029": "Creche" },
  sections: { "Town A": "030", "Cave B": { pending: "between blocks" } },
  maps: { "4": "029", "7": { pending: "odd one" } },
  outside: ["Kanto C"],
};
const names = ["Town A", "Cave B", "Kanto C", "Nowhere D"];
const header = (id: number, mapsec: number, scripts = id) => ({ id, mapsec, refs: { scripts } });
const scripts: Record<number, { entries: unknown[]; code: ({ name: string } | { raw: true; id: number })[] }> = {
  1: { entries: [0], code: [{ name: "Message" }, { name: "Fly" }, { name: "Fly" }, { raw: true, id: 9 }] },
  2: { entries: [0], code: [{ name: "Message" }] },
  3: { entries: [], code: [] },
  4: { entries: [0], code: [{ name: "GiveEgg" }] },
  5: { entries: [0], code: [{ name: "Fly" }] },
  7: { entries: [0], code: [{ name: "Message" }] },
};
const run = (headers: ReturnType<typeof header>[]) =>
  mapBlocks({ headers, sectionName: (m) => names[m] ?? `#${m}`, script: (f) => scripts[f], implemented: new Set(["Message"]), plan });

describe("mapBlocks", () => {
  it("gives each map its section's block and lists the commands with no handler, raw ones included", () => {
    const { rows, unknownSections } = run([header(1, 0)]);
    expect(unknownSections).toEqual([]);
    expect(rows).toEqual([{ map: 1, section: "Town A", block: "030", missing: { Fly: 2, "raw:9": 1 } }]);
  });

  it("lets a map override its section, pending or not", () => {
    const { rows } = run([header(4, 0), header(7, 0)]);
    expect(rows.map((r) => [r.map, r.block, r.pending])).toEqual([[4, "029", undefined], [7, null, "odd one"]]);
  });

  it("marks a pending section with its reason", () => {
    expect(run([header(2, 1)]).rows).toEqual([{ map: 2, section: "Cave B", block: null, pending: "between blocks", missing: {} }]);
  });

  it("skips maps outside Johto and maps without scripts", () => {
    expect(run([header(5, 2), header(3, 0), header(9, 0)]).rows).toEqual([]);
  });

  it("reports a section with scripts that is neither assigned nor outside", () => {
    const { rows, unknownSections } = run([header(5, 3)]);
    expect(rows).toEqual([]);
    expect(unknownSections).toEqual([{ section: "Nowhere D", maps: [5] }]);
  });
});

describe("parseBlocksFile", () => {
  it("accepts a valid file", () => {
    expect(parseBlocksFile(plan, "f.json")).toEqual(plan);
  });

  it.each([
    [{ ...plan, sections: { "Town A": "099" } }, "f.json: sections.Town A: bloco 099 não está em blocks"],
    [{ ...plan, maps: { x: "030" } }, "f.json: maps.x: id de mapa inválido"],
    [{ ...plan, maps: { "4": { pending: "" } } }, "f.json: maps.4: esperado um bloco ou { \"pending\": motivo }"],
    [{ ...plan, outside: ["Town A"] }, "f.json: outside: Town A também está em sections"],
    [{ ...plan, outside: "Kanto C" }, "f.json: outside: esperada uma lista de nomes"],
    [null, "f.json: (raiz): esperado um objeto"],
  ])("rejects %j with a clear error", (value, message) => {
    expect(() => parseBlocksFile(value, "f.json")).toThrow(message);
  });
});
