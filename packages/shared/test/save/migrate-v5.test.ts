import { describe, expect, it } from "vitest";
import { migrate } from "../../src/save/migrate.ts";

// Spec 020: story flags and variables join the save (contracts/save-v5.md).

const all = (v: number) => ({ hp: v, attack: v, defense: v, speed: v, specialAttack: v, specialDefense: v });
const v4 = {
  schemaVersion: 4,
  name: "Gold",
  character: "male",
  area: "60",
  x: 1,
  y: 2,
  facing: "south",
  playTimeMs: 0,
  savedAt: "2026-10-24T12:00:00.000Z",
  rev: 0,
  party: [{ species: 155, level: 5, moves: [33], hp: 20, friendship: 70, experience: 125, ivs: all(31), evs: all(0), nature: 0 }],
  money: 3000,
  badges: 0,
  respawn: null,
  bag: [],
  pokedex: { seen: [155], caught: [155] },
  storage: [],
  pending: [],
};

describe("save v5", () => {
  it("gives a v4 save no flags and no variables, keeping every field", () => {
    expect(migrate(v4)).toEqual({ ok: true, save: { ...v4, schemaVersion: 5, flags: [], vars: {} } });
  });

  it("keeps flags and variables of a v5 save", () => {
    const v5 = { ...v4, schemaVersion: 5, flags: [400, 1], vars: { "16510": 2, "16646": 0 } };
    expect(migrate(v5)).toEqual({ ok: true, save: v5 });
  });

  it.each([
    ["a repeated flag", { flags: [7, 7], vars: {} }],
    ["flag 0", { flags: [0], vars: {} }],
    ["a flag past 65535", { flags: [65536], vars: {} }],
    ["a variable value past 65535", { flags: [], vars: { "16510": 65536 } }],
    ["a negative variable value", { flags: [], vars: { "16510": -1 } }],
    ["a variable id that is not a number", { flags: [], vars: { abc: 1 } }],
  ])("refuses %s", (_, fields) => {
    const result = migrate({ ...v4, schemaVersion: 5, ...fields });
    expect(result.ok).toBe(false);
  });
});
