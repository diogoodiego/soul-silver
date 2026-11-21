import { describe, expect, it } from "vitest";
import { migrate } from "../../src/save/migrate.ts";
import { newBoxes, newItemState, newPhone, SAVE_SCHEMA_VERSION, saveSchema, trainerIdFor } from "../../src/save/schema.ts";

// Item 031.2: Raikou and Entei roam for each player; the save keeps where each is and what the last encounter left.

const v16 = {
  schemaVersion: 16,
  name: "Gold",
  character: "male",
  area: "41",
  x: 1,
  y: 2,
  facing: "south",
  playTimeMs: 1000,
  savedAt: "2026-11-15T12:00:00.000Z",
  rev: 3,
  party: [],
  money: 3000,
  badgeSet: 15,
  flyPoints: [],
  respawn: null,
  bag: [],
  pokedex: { seen: [], caught: [] },
  boxes: newBoxes(),
  pcItems: [],
  pending: [],
  flags: [],
  vars: {},
  npcPlacement: {},
  rivalName: "Silver",
  storyRev: 1,
  phone: newPhone(),
  ...newItemState(),
  daycare: [],
  daycareEgg: false,
  eggWalk: 0,
  photos: [],
};
const v17 = (over: object = {}) => ({ ...v16, schemaVersion: 21, clockOffsetMs: 0, trainerId: trainerIdFor("Gold", "2026-11-15T12:00:00.000Z"), ...over });

describe("save v17", () => {
  it("is the current version", () => {
    expect(SAVE_SCHEMA_VERSION).toBeGreaterThanOrEqual(17);
  });

  it("keeps a v16 save as it was: nothing roams yet", () => {
    expect(migrate(structuredClone(v16))).toEqual({ ok: true, save: v17() });
  });

  it("round-trips the roamers", () => {
    const save = v17({ roamers: [{ id: 0, area: "33", hp: 12, status: "sleep" }, { id: 1, area: "48" }] });
    expect(migrate(save)).toEqual({ ok: true, save });
  });

  it.each([
    ["the same roamer twice", { roamers: [{ id: 0, area: "33" }, { id: 0, area: "34" }] }],
    ["a roamer with no HP left (it would be gone)", { roamers: [{ id: 0, area: "33", hp: 0 }] }],
    ["confusion, which is not kept", { roamers: [{ id: 0, area: "33", status: "confusion" }] }],
    ["an unknown roamer", { roamers: [{ id: 4, area: "33" }] }],
  ])("refuses %s", (_, over) => {
    expect(saveSchema.safeParse(v17(over)).success).toBe(false);
  });
});
