import { describe, expect, it } from "vitest";
import { migrate } from "../../src/save/migrate.ts";
import { v7 } from "./v7.ts";
import { newBoxes, newItemState, saveSchema } from "../../src/save/schema.ts";

const v1 = {
  schemaVersion: 1,
  name: "Gold",
  character: "male",
  area: "60",
  x: 1,
  y: 2,
  facing: "south",
  playTimeMs: 0,
  savedAt: "2026-10-24T12:00:00.000Z",
  rev: 0,
};

// A fictional v2 (on top of the real fields) that renames `area` to `map`, to exercise the chain without a real migration.
const v2Schema = saveSchema.omit({ area: true }).extend({ map: saveSchema.shape.area });
const fake = {
  current: 2,
  schema: v2Schema,
  migrations: {
    1: (s: Record<string, unknown>) => {
      const { area, ...rest } = s;
      return { ...rest, map: area, schemaVersion: 2 };
    },
  },
};

const all = (v: number) => ({ hp: v, attack: v, defense: v, speed: v, specialAttack: v, specialDefense: v });
/** What 3 → 4 adds to a party member: IV 31, no EVs, Hardy and the medium-fast minimum for its level. */
const v4Member = <M extends { level: number }>(m: M) => ({ ...m, experience: m.level === 1 ? 0 : m.level ** 3, ivs: all(31), evs: all(0), nature: 0 });

describe("migrate", () => {
  const v2 = { ...v1, schemaVersion: 2, party: [{ species: 25, level: 5, moves: [84], hp: 20, friendship: 70 }], money: 120, badges: 1, respawn: { area: "69", x: 8, y: 8 } };

  const v3 = { ...v2, schemaVersion: 3, bag: [{ item: 4, count: 5 }], pokedex: { seen: [16, 25], caught: [25] }, storage: [{ species: 16, level: 3, moves: [33], hp: 15, friendship: 70 }] };

  it("passes a current save through", () => {
    const v4 = v7({ ...v3, party: v3.party.map(v4Member), storage: v3.storage.map(v4Member), pending: [{ kind: "evolve", member: 0, into: 26 }], flags: [], vars: {}, npcPlacement: {} });
    expect(migrate(v4)).toEqual({ ok: true, save: v4 });
  });

  it("gives a v3 save's Pokémon IVs, EVs, a nature and experience, and an empty queue", () => {
    expect(migrate(v3)).toEqual({ ok: true, save: v7({ ...v3, party: v3.party.map(v4Member), storage: v3.storage.map(v4Member), pending: [], flags: [], vars: {}, npcPlacement: {} }) });
  });

  it("gives a v1 save an empty party, 3000 money, no badges and no respawn point", () => {
    expect(migrate(v1)).toEqual({ ok: true, save: v7({ ...v1, party: [], money: 3000, badges: 0, respawn: null, bag: [], pokedex: { seen: [], caught: [] }, storage: [], pending: [], flags: [], vars: {}, npcPlacement: {} }) });
  });

  it("gives a v2 save an empty bag and storage, and a Pokédex with its party species", () => {
    expect(migrate(v2)).toEqual({ ok: true, save: v7({ ...v2, party: v2.party.map(v4Member), bag: [], pokedex: { seen: [25], caught: [25] }, storage: [], pending: [], flags: [], vars: {}, npcPlacement: {} }) });
  });

  it("applies the chain up to the current version", () => {
    expect(migrate({ ...v1, party: [], money: 0, badgeSet: 0, flyPoints: [], respawn: null, bag: [], pokedex: { seen: [], caught: [] }, boxes: newBoxes(), pcItems: [], pending: [], flags: [], vars: {}, npcPlacement: {}, rivalName: "", storyRev: 0, phone: { contacts: [], seeking: [], called: [], pending: [], log: [] }, daycare: [], daycareEgg: false, eggWalk: 0, photos: [], ...newItemState() }, fake)).toMatchObject({ ok: true, save: { schemaVersion: 2, map: "60" } });
  });

  it("refuses a save newer than the app", () => {
    expect(migrate({ ...v1, schemaVersion: 16 })).toMatchObject({ ok: false, code: "save-too-new" });
  });

  it("fails when a step is missing", () => {
    expect(migrate(v1, { ...fake, current: 3, migrations: {} })).toMatchObject({ ok: false, code: "invalid" });
  });

  it.each([null, "x", [], {}, { schemaVersion: "1" }])("rejects %o", (raw) => {
    expect(migrate(raw)).toMatchObject({ ok: false, code: "invalid" });
  });

  it("names the invalid field", () => {
    const result = migrate({ ...v1, name: "" });
    expect(result).toMatchObject({ ok: false, code: "invalid" });
    expect(!result.ok && result.message).toContain("name");
  });
});
