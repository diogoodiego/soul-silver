import { describe, expect, it } from "vitest";
import { migrate } from "../../src/save/migrate.ts";
import { applyNewGame } from "../../src/save/new-game.ts";
import { newBoxes, newItemState, newPhone, SAVE_SCHEMA_VERSION, saveSchema, trainerIdFor } from "../../src/save/schema.ts";

// Block H: the trainer card shows an ID and, for games started from now on, the day they began.

const v19 = {
  schemaVersion: 19,
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

describe("save v20", () => {
  it("is the current version", () => {
    expect(SAVE_SCHEMA_VERSION).toBeGreaterThanOrEqual(20);
  });

  it("gives a v19 save an ID from its name and when it was saved, and no start date", () => {
    const result = migrate(structuredClone(v19));
    expect(result).toEqual({ ok: true, save: { ...v19, schemaVersion: 22, clockOffsetMs: 0, trainerId: trainerIdFor("Gold", "2026-11-17T12:00:00.000Z") } });
  });

  it("derives a stable five-digit ID that changes with the save it came from", () => {
    const id = trainerIdFor("Gold", "2026-11-17T12:00:00.000Z");
    expect(id).toBe(trainerIdFor("Gold", "2026-11-17T12:00:00.000Z"));
    expect(id).toBeGreaterThanOrEqual(0);
    expect(id).toBeLessThanOrEqual(65535);
    expect(trainerIdFor("Gold", "2026-11-17T12:00:01.000Z")).not.toBe(id);
  });

  it("dates a new game from its creation", () => {
    const created = migrate({ schemaVersion: 1, name: "Lyra", character: "female", area: "60", x: 0, y: 0, facing: "north", playTimeMs: 0, savedAt: "2026-11-18T09:30:00.000Z", rev: 0 });
    if (!created.ok) throw new Error(created.message);
    const save = applyNewGame(created.save, { map: 64, tx: 6, ty: 6, facing: "south" });
    expect(save.startedAt).toBe("2026-11-18T09:30:00.000Z");
    expect(migrate(save).ok).toBe(true);
  });

  it.each([
    ["an ID past 65535", { trainerId: 65536 }],
    ["no ID", { trainerId: undefined }],
    ["a start date that is not a date", { trainerId: 1, startedAt: "ontem" }],
  ])("refuses %s", (_, over) => {
    expect(saveSchema.safeParse({ ...v19, schemaVersion: 20, ...over }).success).toBe(false);
  });
});
