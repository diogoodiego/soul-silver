import { describe, expect, it } from "vitest";
import type { WorldMap } from "../../src/game/world-map.ts";
import { checkCoherence, COHERENCE_RULES, type CoherenceRule } from "../../src/save/coherence.ts";
import type { Save } from "../../src/save/schema.ts";

const save: Save = {
  schemaVersion: 1,
  name: "Gold",
  character: "male",
  area: "60",
  x: 100,
  y: 100,
  facing: "south",
  playTimeMs: 0,
  savedAt: "2026-10-24T12:00:00.000Z",
  rev: 0,
};
const map: WorldMap = { id: "60", levels: [], warps: [], neighbors: [], widthPx: 320, heightPx: 240 };
const world = (id: string) => (id === "60" ? map : undefined);

describe("checkCoherence", () => {
  it("accepts a position inside a known map", () => {
    expect(checkCoherence(save, world)).toEqual({ ok: true });
  });

  it("refuses an unknown area", () => {
    expect(checkCoherence({ ...save, area: "9999" }, world)).toMatchObject({ ok: false });
  });

  it.each([{ x: -1 }, { x: 321 }, { y: -1 }, { y: 241 }])("refuses %o outside the map", (patch) => {
    expect(checkCoherence({ ...save, ...patch }, world)).toMatchObject({ ok: false });
  });

  it("runs extra rules, such as an impossible level (SC-004 until the party exists)", () => {
    const withLevel = { ...save, level: 500 };
    const levelRule: CoherenceRule<typeof withLevel> = (s) => (s.level >= 1 && s.level <= 100 ? undefined : `level: ${s.level} fora de 1..100`);
    const rules: CoherenceRule<typeof withLevel>[] = [...COHERENCE_RULES, levelRule];
    const result = checkCoherence(withLevel, world, rules);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain("level");
  });
});
