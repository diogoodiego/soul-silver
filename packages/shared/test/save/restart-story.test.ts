import { describe, expect, it } from "vitest";
import { applyNewGame, migrate, NEW_GAME_FLAGS, newBoxes, restartStory, storyUnstarted, STORY_REV, type Save } from "../../src/save/index.ts";

// Spec 024 US7 (research R5, data-model "restartStory"): an outdated save starts the story again in its slot.

const start = { map: 64, tx: 6, ty: 6, facing: "south" as const };
const fresh = () => {
  const r = migrate({ schemaVersion: 1, name: "Gold", character: "female", area: "0", x: 0, y: 0, facing: "south", playTimeMs: 0, savedAt: "2026-10-24T12:00:00.000Z", rev: 0 });
  if (!r.ok) throw new Error(r.message);
  return r.save;
};
const played = (): Save => ({
  ...fresh(),
  area: "34",
  x: 300,
  y: 200,
  facing: "west",
  playTimeMs: 2_078_700,
  rev: 99,
  savedAt: "2026-10-30T06:15:14.437Z",
  party: [{ species: 155, level: 7, moves: [33], hp: 20, friendship: 80, experience: 285, ivs: { hp: 1, attack: 1, defense: 1, speed: 1, specialAttack: 1, specialDefense: 1 }, evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 }, nature: 2 }],
  bag: [{ item: 17, count: 5 }],
  money: 9000,
  badges: 1,
  pokedex: { seen: [155, 16], caught: [155] },
  flags: [106, 418, 960],
  vars: { [String(0x4108)]: 3 },
  rivalName: "Blue",
  storyRev: 0,
});

describe("restartStory", () => {
  it("keeps the name, character, play time and save count", () => {
    expect(restartStory(played(), start)).toMatchObject({ name: "Gold", character: "female", playTimeMs: 2_078_700, rev: 99 });
  });

  it("makes the rest a new game's, at the current story revision", () => {
    const restarted = restartStory(played(), start);
    expect(restarted).toEqual({ ...applyNewGame(fresh(), start), playTimeMs: 2_078_700, rev: 99, savedAt: "2026-10-30T06:15:14.437Z" });
    expect(restarted).toMatchObject({ area: "64", party: [], bag: [], badges: 0, flags: [...NEW_GAME_FLAGS], vars: {}, rivalName: "", storyRev: STORY_REV, boxes: newBoxes() });
  });
});

describe("storyUnstarted", () => {
  it("holds for a new game and a restarted story, so the init script runs", () => {
    expect(storyUnstarted(applyNewGame(fresh(), start))).toBe(true);
    expect(storyUnstarted(restartStory(played(), start))).toBe(true);
  });

  it("does not hold once the story moved", () => {
    expect(storyUnstarted(played())).toBe(false);
    expect(storyUnstarted({ ...applyNewGame(fresh(), start), vars: { [String(0x403c)]: 7 } })).toBe(false);
    expect(storyUnstarted({ ...fresh(), flags: [] })).toBe(false);
  });
});
