import { describe, expect, it } from "vitest";
import { readMove } from "../../src/data/readers/move.ts";
import { move } from "../fixtures/game-data/builders.ts";

describe("readMove", () => {
  it("maps every field of a move", () => {
    const bytes = move({
      effect: 4,
      category: 1,
      power: 95,
      type: 10,
      accuracy: 100,
      pp: 15,
      chance: 10,
      target: 0,
      priority: 0,
      flags: 0x12,
      contestEffect: 17,
      contestType: 1,
    });
    expect(readMove(bytes, 53)).toEqual({
      id: 53,
      name: { catalog: "move-names", index: 53 },
      type: 10,
      category: "special",
      power: 95,
      accuracy: 100,
      pp: 15,
      priority: 0,
      target: "selected",
      targetRaw: 0,
      flags: { contact: false, protect: true, magicCoat: false, snatch: false, mirrorMove: true, kingsRock: false, keepHpBar: false, hideShadow: false },
      flagsRaw: 0x12,
      effect: { id: 4, chance: 10 },
      contest: { effect: 17, type: 1 },
    });
  });

  it.each([
    [0, "physical"],
    [1, "special"],
    [2, "status"],
  ] as const)("maps category %i to %s", (raw, key) => {
    expect(readMove(move({ category: raw }), 1).category).toBe(key);
  });

  it("throws for a category the game does not have", () => {
    expect(() => readMove(move({ category: 3 }), 9)).toThrow(/categoria.*9/i);
  });

  it("turns accuracy 0 into null and keeps other values", () => {
    expect(readMove(move({ accuracy: 0 }), 1).accuracy).toBeNull();
    expect(readMove(move({ accuracy: 70 }), 1).accuracy).toBe(70);
    expect(readMove(move({ accuracy: 150 }), 1).accuracy).toBe(150);
  });

  it("keeps power raw, including 0 and the variable-power value 1", () => {
    expect(readMove(move({ power: 0, category: 2 }), 1).power).toBe(0);
    expect(readMove(move({ power: 1 }), 1).power).toBe(1);
  });

  it("reads priority as a signed byte", () => {
    expect(readMove(move({ priority: 1 }), 1).priority).toBe(1);
    expect(readMove(move({ priority: -6 }), 1).priority).toBe(-6);
  });

  it.each([
    [0, "selected"],
    [1, "depends"],
    [2, "random"],
    [4, "both-foes"],
    [8, "all-others"],
    [16, "user"],
    [32, "user-side"],
    [64, "field"],
    [128, "foe-side"],
    [256, "ally"],
    [512, "user-or-ally"],
    [1024, "foe"],
  ] as const)("maps target %i to %s", (raw, key) => {
    expect(readMove(move({ target: raw }), 1)).toMatchObject({ target: key, targetRaw: raw });
  });

  it("maps an unlisted target to unknown and keeps the raw value", () => {
    expect(readMove(move({ target: 3 }), 1)).toMatchObject({ target: "unknown", targetRaw: 3 });
    expect(readMove(move({ target: 2048 }), 1)).toMatchObject({ target: "unknown", targetRaw: 2048 });
  });

  it.each([
    ["contact", 0],
    ["protect", 1],
    ["magicCoat", 2],
    ["snatch", 3],
    ["mirrorMove", 4],
    ["kingsRock", 5],
    ["keepHpBar", 6],
    ["hideShadow", 7],
  ] as const)("reads flag %s from bit %i", (name, bit) => {
    const record = readMove(move({ flags: 1 << bit }), 1);
    expect(record.flags[name]).toBe(true);
    expect(Object.values(record.flags).filter(Boolean)).toHaveLength(1);
    expect(record.flagsRaw).toBe(1 << bit);
  });

  it("keeps the original effect id without interpreting it", () => {
    expect(readMove(move({ effect: 272, chance: 30 }), 1).effect).toEqual({ id: 272, chance: 30 });
  });

  it("throws when the record is shorter than 16 bytes", () => {
    expect(() => readMove(move().subarray(0, 15), 1)).toThrow(/16/);
  });
});
