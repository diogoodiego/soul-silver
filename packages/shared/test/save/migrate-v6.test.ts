import { describe, expect, it } from "vitest";
import { migrate } from "../../src/save/migrate.ts";
import { v7 } from "./v7.ts";

// Spec 021: per-player NPC placement joins the save (contracts in specs/021-cutscenes-npcs/data-model.md).

const v5 = {
  schemaVersion: 5,
  name: "Gold",
  character: "male",
  area: "60",
  x: 1,
  y: 2,
  facing: "south",
  playTimeMs: 0,
  savedAt: "2026-10-24T12:00:00.000Z",
  rev: 0,
  party: [],
  money: 3000,
  badges: 0,
  respawn: null,
  bag: [],
  pokedex: { seen: [], caught: [] },
  storage: [],
  pending: [],
  flags: [400],
  vars: { "16510": 2 },
};

describe("save v6", () => {
  it("gives a v5 save no NPC placement, keeping every field", () => {
    expect(migrate(v5)).toEqual({ ok: true, save: v7({ ...v5, npcPlacement: {} }) });
  });

  it("keeps the placement of a v6 save", () => {
    const v6 = { ...v5, schemaVersion: 6, npcPlacement: { "60": { "2": { x: 4, z: 7, facing: "west" } } } };
    expect(migrate(v6)).toEqual({ ok: true, save: v7(v6) });
  });

  it.each([
    ["a facing that is not a direction", { "60": { "2": { x: 4, z: 7, facing: "up" } } }],
    ["a negative coordinate", { "60": { "2": { x: -1, z: 7, facing: "west" } } }],
    ["a person id that is not a number", { "60": { abc: { x: 4, z: 7, facing: "west" } } }],
  ])("refuses %s", (_, npcPlacement) => {
    expect(migrate({ ...v5, schemaVersion: 6, npcPlacement }).ok).toBe(false);
  });
});
