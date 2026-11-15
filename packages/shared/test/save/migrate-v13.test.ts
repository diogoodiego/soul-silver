import { describe, expect, it } from "vitest";
import { migrate } from "../../src/save/migrate.ts";
import { newBoxes, newItemState, newPhone, SAVE_SCHEMA_VERSION, saveSchema } from "../../src/save/schema.ts";

// Spec 029, item 029.2: members have a gender and may be eggs; the Day Care remembers an egg waiting.

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
const v13 = (over: object = {}) => ({ ...v12, schemaVersion: 15, daycareEgg: false, eggWalk: 0, photos: [], ...over });

describe("save v13", () => {
  it("is version 13 or later", () => {
    expect(SAVE_SCHEMA_VERSION).toBeGreaterThanOrEqual(13);
  });

  it("gives a v12 save no egg waiting and leaves the members without a gender, for the server to roll", () => {
    expect(migrate(structuredClone(v12))).toEqual({ ok: true, save: v13() });
  });

  it("round-trips genders, an egg in the party and an egg waiting", () => {
    const egg = { ...member, level: 1, experience: 0, gender: "female", egg: { cycles: 20 } };
    const save = v13({ party: [{ ...member, gender: "male" }, egg], daycare: [{ mon: { ...member, gender: "female" }, steps: 255 }], daycareEgg: true });
    expect(migrate(save)).toEqual({ ok: true, save });
  });

  it.each([
    ["an unknown gender", { party: [{ ...member, gender: "other" }] }],
    ["an egg with negative cycles", { party: [{ ...member, egg: { cycles: -1 } }] }],
    ["an egg with an unknown field", { party: [{ ...member, egg: { cycles: 3, shiny: true } }] }],
    ["an egg flag that is not a boolean", { daycareEgg: 1 }],
  ])("refuses %s", (_, over) => {
    expect(saveSchema.safeParse(v13(over)).success).toBe(false);
  });
});
