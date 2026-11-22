import { describe, expect, it } from "vitest";
import { migrate } from "../../src/save/migrate.ts";
import { newBoxes, newItemState, newPhone, partyMember, SAVE_SCHEMA_VERSION } from "../../src/save/schema.ts";

// Block C: a member may keep the moves it lost to the 2 normal + 2 special slots.

const stats = { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 };
const member = { species: 155, level: 10, moves: [33, 52, 43, 98], hp: 30, friendship: 70, experience: 1000, ivs: stats, evs: stats, nature: 0 };

const v21 = {
  schemaVersion: 21,
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
  party: [member],
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
  clockOffsetMs: 0,
};

describe("save v22", () => {
  it("is the current version", () => {
    expect(SAVE_SCHEMA_VERSION).toBe(22);
  });

  it("keeps a v21 save's moves as they were (the server fits them on join)", () => {
    expect(migrate(structuredClone(v21))).toEqual({ ok: true, save: { ...v21, schemaVersion: 22 } });
  });

  it("accepts forgotten moves on a member", () => {
    expect(partyMember.safeParse({ ...member, forgottenMoves: [10, 45] }).success).toBe(true);
    expect(partyMember.safeParse({ ...member, forgottenMoves: [-1] }).success).toBe(false);
  });
});
