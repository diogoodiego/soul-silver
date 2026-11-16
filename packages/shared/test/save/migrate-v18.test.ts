import { describe, expect, it } from "vitest";
import { migrate } from "../../src/save/migrate.ts";
import { newBoxes, newItemState, newPhone, SAVE_SCHEMA_VERSION, saveSchema } from "../../src/save/schema.ts";

// Item 031.7: the Seal Case keeps how many of each seal the player holds.

const v17 = {
  schemaVersion: 17,
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
const v18 = (over: object = {}) => ({ ...v17, schemaVersion: 18, ...over });

describe("save v18", () => {
  it("is the current version", () => {
    expect(SAVE_SCHEMA_VERSION).toBe(18);
  });

  it("keeps a v17 save as it was: the Seal Case is empty", () => {
    expect(migrate(structuredClone(v17))).toEqual({ ok: true, save: v18() });
  });

  it("round-trips the seals", () => {
    const save = v18({ seals: { "1": 3, "80": 99 } });
    expect(migrate(save)).toEqual({ ok: true, save });
  });

  it.each([
    ["seal 0 (an empty name)", { seals: { "0": 1 } }],
    ["seal 81", { seals: { "81": 1 } }],
    ["a kind with none left (it would be gone)", { seals: { "5": 0 } }],
    ["more than the case holds", { seals: { "5": 100 } }],
  ])("refuses %s", (_, over) => {
    expect(saveSchema.safeParse(v18(over)).success).toBe(false);
  });
});
