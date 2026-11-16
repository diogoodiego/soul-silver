import { describe, expect, it } from "vitest";
import { migrate } from "../../src/save/migrate.ts";
import { newBoxes, newItemState, newPhone, SAVE_SCHEMA_VERSION, saveSchema } from "../../src/save/schema.ts";

// Item 030.10: in-game trades. A member remembers the trade it came from (MonIsInGameTradePoke) and, for
// Kenya's Spearow, the trade whose trainer wrote the mail it holds (KenyaCheckPartyOrMailbox).

const member = { species: 155, level: 5, moves: [33, 43], hp: 20, friendship: 70, experience: 135, ivs: { hp: 1, attack: 1, defense: 1, speed: 1, specialAttack: 1, specialDefense: 1 }, evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 }, nature: 0 };
const v15 = {
  schemaVersion: 15,
  name: "Gold",
  character: "male",
  area: "60",
  x: 1,
  y: 2,
  facing: "south",
  playTimeMs: 1000,
  savedAt: "2026-11-15T12:00:00.000Z",
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
  daycare: [],
  daycareEgg: false,
  eggWalk: 0,
  photos: [],
};
const v16 = (over: object = {}) => ({ ...v15, schemaVersion: 17, ...over });

describe("save v16", () => {
  it("is the current version", () => {
    expect(SAVE_SCHEMA_VERSION).toBeGreaterThanOrEqual(16);
  });

  it("keeps a v15 save as it was: no member came from a trade", () => {
    expect(migrate(structuredClone(v15))).toEqual({ ok: true, save: v16() });
  });

  it("round-trips a traded member and Kenya's mail", () => {
    const save = v16({ party: [member, { ...member, species: 21, nickname: "Kenya", held: 137, trade: 7, mail: 7 }] });
    expect(migrate(save)).toEqual({ ok: true, save });
  });

  it.each([
    ["a negative trade", { party: [{ ...member, trade: -1 }] }],
    ["a trade that is not a whole number", { party: [{ ...member, trade: 1.5 }] }],
    ["mail from a trade out of range", { party: [{ ...member, mail: 256 }] }],
  ])("refuses %s", (_, over) => {
    expect(saveSchema.safeParse(v16(over)).success).toBe(false);
  });
});
