import { describe, expect, it } from "vitest";
import { migrate } from "../../src/save/migrate.ts";
import { HALL_OF_FAME_MAX, newBoxes, newItemState, newPhone, SAVE_SCHEMA_VERSION, saveSchema, trainerIdFor } from "../../src/save/schema.ts";

// Item 034.4: the Hall of Fame keeps each team that beat the League.

const v18 = {
  schemaVersion: 18,
  name: "Gold",
  character: "male",
  area: "306",
  x: 1,
  y: 2,
  facing: "north",
  playTimeMs: 1000,
  savedAt: "2026-11-17T12:00:00.000Z",
  rev: 3,
  party: [],
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
};
const v19 = (over: object = {}) => ({ ...v18, schemaVersion: 22, clockOffsetMs: 0, trainerId: trainerIdFor("Gold", "2026-11-17T12:00:00.000Z"), ...over });
const entry = { at: "2026-11-17T12:00:00.000Z", party: [{ species: 157, level: 60, nickname: "Fogo" }, { species: 16, level: 55 }] };

describe("save v19", () => {
  it("is the current version", () => {
    expect(SAVE_SCHEMA_VERSION).toBeGreaterThanOrEqual(19);
  });

  it("keeps a v18 save as it was: no team in the Hall of Fame yet", () => {
    expect(migrate(structuredClone(v18))).toEqual({ ok: true, save: v19() });
  });

  it("round-trips the Hall of Fame", () => {
    const save = v19({ hallOfFame: [entry] });
    expect(migrate(save)).toEqual({ ok: true, save });
  });

  it.each([
    ["an empty team", { hallOfFame: [{ ...entry, party: [] }] }],
    ["seven members", { hallOfFame: [{ ...entry, party: Array(7).fill({ species: 16, level: 5 }) }] }],
    ["more entries than the Hall keeps", { hallOfFame: Array(HALL_OF_FAME_MAX + 1).fill(entry) }],
  ])("refuses %s", (_, over) => {
    expect(saveSchema.safeParse(v19(over)).success).toBe(false);
  });
});
