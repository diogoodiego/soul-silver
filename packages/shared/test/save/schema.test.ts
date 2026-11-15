import { describe, expect, it } from "vitest";
import { newBoxes, newItemState, saveSchema } from "../../src/save/schema.ts";

const all = (v: number) => ({ hp: v, attack: v, defense: v, speed: v, specialAttack: v, specialDefense: v });
const stats = { experience: 125, ivs: all(31), evs: all(0), nature: 0 };

const valid = {
  schemaVersion: 15, daycare: [], daycareEgg: false, eggWalk: 0, photos: [],
  name: "Gold",
  character: "male",
  area: "60",
  x: 120,
  y: 88,
  facing: "south",
  playTimeMs: 0,
  savedAt: "2026-10-24T12:00:00.000Z",
  rev: 0,
  party: [{ species: 25, level: 5, moves: [84, 45], hp: 19, friendship: 70, ...stats }],
  money: 3000,
  badgeSet: 0,
  flyPoints: [],
  respawn: null,
  bag: [{ item: 4, count: 10 }],
  pokedex: { seen: [16, 25], caught: [25] },
  boxes: newBoxes().map((b, i) => (i === 0 ? { ...b, slots: [{ species: 16, level: 3, moves: [33], hp: 15, friendship: 70, shiny: true, ...stats, experience: 27 }, ...b.slots.slice(1)] } : b)),
  pcItems: [{ item: 17, count: 3 }],
  pending: [
    { kind: "level-up", member: 0, level: 6 },
    { kind: "learn", member: 0, move: 86 },
    { kind: "evolve", member: 0, into: 26 },
  ],
  flags: [400],
  npcPlacement: {},
  vars: { "16510": 1 },
  rivalName: "",
  storyRev: 1,
  phone: { contacts: [], seeking: [], called: [], pending: [], log: [] },
  ...newItemState(),
};

describe("saveSchema", () => {
  it("accepts the documented example", () => {
    expect(saveSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts exactly 510 EVs", () => {
    expect(saveSchema.safeParse({ ...valid, party: [{ ...valid.party[0], evs: all(85) }] }).success).toBe(true);
  });

  it.each([
    { name: "" },
    { name: "   " },
    { name: "x".repeat(17) },
    { character: "other" },
    { facing: "northeast" },
    { x: Number.NaN },
    { y: Infinity },
    { playTimeMs: -1 },
    { playTimeMs: 1.5 },
    { rev: -1 },
    { savedAt: "yesterday" },
    { schemaVersion: 0 },
    { extra: true },
    { money: -1 },
    { badgeSet: 0x10000 },
    { party: Array.from({ length: 7 }, () => valid.party[0]) },
    { party: [{ species: 0, level: 5, moves: [1], hp: 1, friendship: 0 }] },
    { party: [{ species: 1, level: 5, moves: [], hp: 1, friendship: 0 }] },
    { bag: [{ item: 4, count: 0 }] },
    { bag: [{ item: 4, count: 1000 }] },
    { bag: [{ item: 4, count: 1 }, { item: 4, count: 2 }] },
    { pokedex: { seen: [0], caught: [] } },
    { pokedex: { seen: [16, 16], caught: [] } },
    { boxes: newBoxes().slice(1) },
    { pcItems: [{ item: 4, count: 1000 }] },
    { party: [{ ...valid.party[0], ivs: { ...all(31), hp: 32 } }] },
    { party: [{ ...valid.party[0], evs: { ...all(0), attack: 256 } }] },
    { party: [{ ...valid.party[0], evs: { ...all(85), hp: 86 } }] },
    { party: [{ ...valid.party[0], nature: 25 }] },
    { party: [{ ...valid.party[0], experience: -1 }] },
    { pending: [{ kind: "level-up", member: 6, level: 6 }] },
    { pending: [{ kind: "teach", member: 0, move: 1 }] },
  ])("rejects %o", (patch) => {
    expect(saveSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});
