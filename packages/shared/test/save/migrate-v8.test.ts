import { describe, expect, it } from "vitest";
import { PLAYER_NAME_MAX } from "../../src/game/limits.ts";
import { migrate } from "../../src/save/migrate.ts";
import { newBoxes } from "../../src/save/schema.ts";

// Spec 024: the rival's name and the story revision; saves from before are marked stale.

const v7 = {
  schemaVersion: 7,
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
  badges: 0,
  respawn: null,
  bag: [{ item: 4, count: 2 }],
  pokedex: { seen: [], caught: [] },
  boxes: newBoxes(),
  pcItems: [],
  pending: [],
  flags: [418],
  vars: { "16646": 1 },
  npcPlacement: {},
};

describe("save v8", () => {
  it("adds an empty rival name and a stale story, touching nothing else", () => {
    const result = migrate(structuredClone(v7));
    if (!result.ok) throw new Error(result.message);
    expect(result.save).toEqual({ ...v7, badges: undefined, schemaVersion: 9, rivalName: "", storyRev: 0, badgeSet: 0, flyPoints: [] });
  });

  it("hands a v8 save on to the next version", () => {
    const save = { ...v7, badges: undefined, schemaVersion: 9, rivalName: "Silver", storyRev: 1, badgeSet: 0, flyPoints: [] };
    expect(migrate({ ...v7, schemaVersion: 8, rivalName: "Silver", storyRev: 1 })).toEqual({ ok: true, save });
  });

  it.each([
    ["a rival name over the limit", { rivalName: "x".repeat(PLAYER_NAME_MAX + 1) }],
    ["a negative story revision", { storyRev: -1 }],
  ])("refuses %s", (_, spoil) => {
    expect(migrate({ ...v7, schemaVersion: 8, rivalName: "", storyRev: 1, ...spoil }).ok).toBe(false);
  });
});
