import { describe, expect, it } from "vitest";
import { migrate } from "../../src/save/migrate.ts";
import { newBoxes, newItemState, newPhone, SAVE_SCHEMA_VERSION, saveSchema } from "../../src/save/schema.ts";

// Spec 030, item 030.2: ribbons on party members (MonHasRibbon, GiveRibbon) and Cameron's photo album.

const member = { species: 155, level: 5, moves: [33, 43], hp: 20, friendship: 70, experience: 135, ivs: { hp: 1, attack: 1, defense: 1, speed: 1, specialAttack: 1, specialDefense: 1 }, evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 }, nature: 0 };
const v14 = {
  schemaVersion: 14, daycareEgg: false, eggWalk: 0,
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

const v15 = (over: object = {}) => ({ ...v14, schemaVersion: 15, photos: [], ...over });
const photo = { map: 36, spot: 5, species: [155], takenAt: "2026-11-14T12:00:00.000Z" };

describe("save v15", () => {
  it("is the current version", () => {
    expect(SAVE_SCHEMA_VERSION).toBe(15);
  });

  it("gives a v14 save an empty photo album and its members no ribbons", () => {
    expect(migrate(structuredClone(v14))).toEqual({ ok: true, save: v15() });
  });

  it("round-trips ribbons and photos", () => {
    const save = v15({ party: [{ ...member, ribbons: [63] }], photos: [photo] });
    expect(migrate(save)).toEqual({ ok: true, save });
  });

  it.each([
    ["a repeated ribbon", { party: [{ ...member, ribbons: [63, 63] }] }],
    ["a ribbon out of range", { party: [{ ...member, ribbons: [80] }] }],
    ["a photo with an unknown field", { photos: [{ ...photo, frame: 1 }] }],
    ["a photo with seven Pokémon", { photos: [{ ...photo, species: [1, 2, 3, 4, 5, 6, 7] }] }],
    ["a 37th photo", { photos: Array.from({ length: 37 }, () => photo) }],
  ])("refuses %s", (_, over) => {
    expect(saveSchema.safeParse(v15(over)).success).toBe(false);
  });
});
