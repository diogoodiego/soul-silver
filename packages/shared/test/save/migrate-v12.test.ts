import { describe, expect, it } from "vitest";
import { migrate } from "../../src/save/migrate.ts";
import { newBoxes, newItemState, newPhone, SAVE_SCHEMA_VERSION, saveSchema } from "../../src/save/schema.ts";

// Spec 029, item 029.1: the Pokémon left at the Day Care live in the player's save (principle VII).

const member = { species: 155, level: 5, moves: [33, 43], hp: 20, friendship: 70, experience: 135, ivs: { hp: 1, attack: 1, defense: 1, speed: 1, specialAttack: 1, specialDefense: 1 }, evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 }, nature: 0 };
const v11 = {
  schemaVersion: 11,
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
};
const v12 = (daycare: object[]) => ({ ...v11, schemaVersion: 17, daycare, daycareEgg: false, eggWalk: 0, photos: [] });

describe("save v12", () => {
  it("is version 12 or later", () => {
    expect(SAVE_SCHEMA_VERSION).toBeGreaterThanOrEqual(12);
  });

  it("gives a v11 save an empty Day Care and touches nothing else", () => {
    expect(migrate(structuredClone(v11))).toEqual({ ok: true, save: v12([]) });
  });

  it("round-trips two Pokémon left with their steps", () => {
    const save = v12([{ mon: member, steps: 0 }, { mon: { ...member, species: 16, nickname: "Pidge" }, steps: 4321 }]);
    expect(migrate(save)).toEqual({ ok: true, save });
  });

  it.each([
    ["three Pokémon", [{ mon: member, steps: 0 }, { mon: member, steps: 0 }, { mon: member, steps: 0 }]],
    ["negative steps", [{ mon: member, steps: -1 }]],
    ["a Pokémon that is not valid", [{ mon: { ...member, level: 101 }, steps: 0 }]],
    ["an unknown field", [{ mon: member, steps: 0, egg: true }]],
  ])("refuses %s", (_, daycare) => {
    expect(saveSchema.safeParse(v12(daycare)).success).toBe(false);
  });
});
