import { describe, expect, it } from "vitest";
import { migrate } from "../../src/save/migrate.ts";
import { newBoxes, newItemState, newPhone, SAVE_SCHEMA_VERSION, saveSchema } from "../../src/save/schema.ts";

// The game's clock can run ahead of or behind the PC's: the save keeps that difference.

const v20 = {
  schemaVersion: 20,
  name: "Gold",
  character: "male",
  area: "306",
  x: 1,
  y: 2,
  facing: "north",
  playTimeMs: 1000,
  savedAt: "2026-11-17T12:00:00.000Z",
  rev: 3,
  trainerId: 1234,
  party: [],
  money: 3000,
  badgeSet: 255,
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

describe("save v21", () => {
  it("is the current version", () => {
    expect(SAVE_SCHEMA_VERSION).toBe(21);
  });

  it("gives a v20 save the PC's clock", () => {
    expect(migrate(structuredClone(v20))).toEqual({ ok: true, save: { ...v20, schemaVersion: 21, clockOffsetMs: 0 } });
  });

  it.each([
    ["more than a day ahead", 86_400_000],
    ["more than a day behind", -86_400_000],
    ["a fraction", 0.5],
  ])("refuses an offset %s", (_, clockOffsetMs) => {
    expect(saveSchema.safeParse({ ...v20, schemaVersion: 21, clockOffsetMs }).success).toBe(false);
  });
});
