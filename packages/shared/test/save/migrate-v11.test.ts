import { describe, expect, it } from "vitest";
import { migrate } from "../../src/save/migrate.ts";
import { newBoxes, newItemState, newPhone, saveSchema } from "../../src/save/schema.ts";

// Spec 027, contracts/save-v11.md: the Apricorn Box, Berry Pots, Kurt and Repel, per player (principle VII);
// held items and PP Ups on the members, both optional.

const member = { species: 155, level: 5, moves: [33, 43], hp: 20, friendship: 70, experience: 135, ivs: { hp: 1, attack: 1, defense: 1, speed: 1, specialAttack: 1, specialDefense: 1 }, evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 }, nature: 0 };
const v10 = {
  schemaVersion: 10,
  name: "Gold",
  character: "male",
  area: "60",
  x: 1,
  y: 2,
  facing: "south",
  playTimeMs: 1000,
  savedAt: "2026-10-24T12:00:00.000Z",
  rev: 3,
  party: [member],
  money: 3000,
  badgeSet: 0,
  flyPoints: [],
  respawn: null,
  bag: [{ item: 4, count: 2 }],
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
};
const v11 = (items: object, party: object[] = [member]) => ({ ...v10, schemaVersion: 17, daycare: [], daycareEgg: false, eggWalk: 0, photos: [], party, ...newItemState(), ...items });

describe("save v11", () => {
  it("gives a v10 save an empty Apricorn Box and Berry Pots, and touches nothing else", () => {
    expect(migrate(structuredClone(v10))).toEqual({ ok: true, save: v11({}) });
    expect(newItemState()).toEqual({ apricorns: [0, 0, 0, 0, 0, 0, 0], apricornTrees: { day: "", trees: [] }, berryPots: [null, null, null, null], kurt: null, repel: null });
  });

  it("round-trips a held item, PP Ups, a growing berry, Kurt's apricorns and a Repel", () => {
    const save = v11(
      { apricorns: [2, 0, 0, 0, 0, 0, 1], apricornTrees: { day: "2026-11-07", trees: [0, 3] }, berryPots: [{ berry: 155, plantedAt: "2026-11-07T10:00:00.000Z" }, null, null, null], kurt: { apricorn: 0, count: 2, given: "2026-11-07" }, repel: { item: 79, endsAt: "2026-11-07T10:00:26.000Z" } },
      [{ ...member, held: 155, ppUps: [3, 0] }],
    );
    expect(migrate(save)).toEqual({ ok: true, save });
  });

  it.each([
    ["PP Ups above 3", {}, [{ ...member, ppUps: [4] }]],
    ["more than 4 PP Up slots", {}, [{ ...member, ppUps: [0, 0, 0, 0, 0] }]],
    ["a held item 0", {}, [{ ...member, held: 0 }]],
    ["an Apricorn Box of 6 colours", { apricorns: [0, 0, 0, 0, 0, 0] }],
    ["more than 99 of a colour", { apricorns: [100, 0, 0, 0, 0, 0, 0] }],
    ["a tree picked twice", { apricornTrees: { day: "2026-11-07", trees: [3, 3] } }],
    ["a pot with something that is not a berry", { berryPots: [{ berry: 17, plantedAt: "2026-11-07T10:00:00.000Z" }, null, null, null] }],
    ["five Berry Pots", { berryPots: [null, null, null, null, null] }],
    ["Kurt with a colour past black", { kurt: { apricorn: 7, count: 1, given: "2026-11-07" } }],
    ["Kurt's day in another format", { kurt: { apricorn: 0, count: 1, given: "07/11/2026" } }],
  ] as [string, object, object[]?][])("refuses %s", (_, items, party = [member]) => {
    expect(saveSchema.safeParse(v11(items, party)).success).toBe(false);
  });
});
