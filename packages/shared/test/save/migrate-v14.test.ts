import { describe, expect, it } from "vitest";
import { migrate } from "../../src/save/migrate.ts";
import { newBoxes, newItemState, newPhone, SAVE_SCHEMA_VERSION, saveSchema, trainerIdFor } from "../../src/save/schema.ts";

// Spec 029, item 029.4: the distance walked in the current egg cycle.

const member = { species: 155, level: 5, moves: [33, 43], hp: 20, friendship: 70, experience: 135, ivs: { hp: 1, attack: 1, defense: 1, speed: 1, specialAttack: 1, specialDefense: 1 }, evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 }, nature: 0 };
const v12 = {
  schemaVersion: 12,
  name: "Gold",
  character: "male",
  area: "60",
  x: 1,
  y: 2,
  facing: "south",
  playTimeMs: 1000,
  savedAt: "2026-11-13T12:00:00.000Z",
  rev: 3,
  party: [member],
  money: 3000,
  badgeSet: 1,
  flyPoints: [],
  respawn: null,
  bag: [],
  pokedex: { seen: [155], caught: [155] },
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
  daycare: [{ mon: member, steps: 40 }],
};
const v13 = { ...v12, schemaVersion: 13, daycareEgg: false };
const v14 = (over: object = {}) => ({ ...v13, schemaVersion: 22, clockOffsetMs: 0, trainerId: trainerIdFor("Gold", "2026-11-13T12:00:00.000Z"), eggWalk: 0, photos: [], ...over });

describe("save v14", () => {
  it("is version 14 or later", () => {
    expect(SAVE_SCHEMA_VERSION).toBeGreaterThanOrEqual(14);
  });

  it("starts a v13 save's egg cycle from nothing walked", () => {
    expect(migrate(structuredClone(v13))).toEqual({ ok: true, save: v14() });
  });

  it("round-trips the distance walked", () => {
    const save = v14({ eggWalk: 4079.5 });
    expect(migrate(save)).toEqual({ ok: true, save });
  });

  it.each([
    ["a negative distance", { eggWalk: -1 }],
    ["a distance past a cycle", { eggWalk: 255 * 16 }],
    ["a distance that is not a number", { eggWalk: "10" }],
  ])("refuses %s", (_, over) => {
    expect(saveSchema.safeParse(v14(over)).success).toBe(false);
  });
});
