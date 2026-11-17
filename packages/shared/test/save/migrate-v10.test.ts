import { describe, expect, it } from "vitest";
import { migrate } from "../../src/save/migrate.ts";
import { newBoxes, newItemState, newPhone, saveSchema } from "../../src/save/schema.ts";

// Spec 026, contracts/save-v10.md: the Pokégear phone, per player (principle VII).

const v9 = {
  schemaVersion: 9,
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
  badgeSet: 0b1,
  flyPoints: ["60"],
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

const v10 = (phone: unknown) => ({ ...v9, schemaVersion: 19, daycare: [], daycareEgg: false, eggWalk: 0, photos: [], phone, ...newItemState() });

describe("save v10", () => {
  it("gives a v9 save an empty phone and leaves the rest alone", () => {
    expect(migrate(structuredClone(v9))).toEqual({ ok: true, save: v10(newPhone()) });
    expect(newPhone()).toEqual({ contacts: [], seeking: [], called: [], pending: [], log: [] });
  });

  it("round-trips a phone with a pending story call", () => {
    const phone = { contacts: [1, 10], seeking: [10], called: [10], pending: [{ caller: 1, call: 2 }], log: [{ contact: 10, direction: "in", at: "2026-11-02T10:00:00.000Z" }] };
    expect(migrate(v10(phone))).toEqual({ ok: true, save: v10(phone) });
  });

  it.each([
    ["a contact above 74", { contacts: [75] }],
    ["a contact listed twice", { contacts: [10, 10] }],
    ["a rematch for a number not registered", { contacts: [1], seeking: [10] }],
    ["a log of more than 20 calls", { contacts: [10], log: Array.from({ length: 21 }, () => ({ contact: 10, direction: "out", at: "2026-11-02T10:00:00.000Z" })) }],
    ["a call direction other than in or out", { contacts: [10], log: [{ contact: 10, direction: "missed", at: "2026-11-02T10:00:00.000Z" }] }],
    ["a pending call with extra fields (random calls are never saved)", { pending: [{ caller: 10, call: 33, kind: "contact" }] }],
  ])("refuses %s", (_, phone) => {
    expect(saveSchema.safeParse(v10({ ...newPhone(), ...phone })).success).toBe(false);
  });
});
