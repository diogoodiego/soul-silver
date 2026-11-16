import { describe, expect, it } from "vitest";
import { badgeCount } from "../../src/save/badges.ts";
import { migrate } from "../../src/save/migrate.ts";
import { newBoxes, newItemState } from "../../src/save/schema.ts";

// Spec 025: the badge count becomes the set of badges, and Fly gets its visited points.

const rest = {
  schemaVersion: 8,
  name: "Gold",
  character: "male",
  area: "60",
  x: 1,
  y: 2,
  facing: "south",
  playTimeMs: 1000,
  savedAt: "2026-10-24T12:00:00.000Z",
  rev: 3,
  party: [],
  money: 3000,
  respawn: null,
  bag: [{ item: 4, count: 2 }],
  pokedex: { seen: [], caught: [] },
  boxes: newBoxes(),
  pcItems: [],
  pending: [],
  flags: [418],
  vars: { "16646": 1 },
  npcPlacement: {},
  rivalName: "Silver",
  storyRev: 1,
};
const v8 = (badges: number) => ({ ...rest, badges });

describe("save v9", () => {
  it.each([
    [0, 0],
    [1, 0b1],
    [3, 0b111],
    [16, 0xffff],
  ])("turns %i badges into the first bits (%i)", (count, set) => {
    const result = migrate(v8(count));
    if (!result.ok) throw new Error(result.message);
    expect(result.save).toEqual({ ...rest, schemaVersion: 16, daycare: [], daycareEgg: false, eggWalk: 0, photos: [], badgeSet: set, flyPoints: [], phone: { contacts: [], seeking: [], called: [], pending: [], log: [] }, ...newItemState() });
  });

  it("counts the set back", () => {
    expect(badgeCount(0b10110)).toBe(3);
    expect(badgeCount(0xffff)).toBe(16);
  });

  it("accepts a v9 save as it is", () => {
    const save = { ...rest, schemaVersion: 16, daycare: [], daycareEgg: false, eggWalk: 0, photos: [], badgeSet: 0b100, flyPoints: ["11", "15"], phone: { contacts: [], seeking: [], called: [], pending: [], log: [] }, ...newItemState() };
    expect(migrate(save)).toEqual({ ok: true, save });
  });

  it.each([
    ["a badge set above 16 bits", { badgeSet: 0x10000 }],
    ["a negative badge set", { badgeSet: -1 }],
    ["a repeated fly point", { flyPoints: ["11", "11"] }],
  ])("refuses %s", (_, spoil) => {
    expect(migrate({ ...rest, schemaVersion: 9, badgeSet: 0, flyPoints: [], ...spoil }).ok).toBe(false);
  });
});
