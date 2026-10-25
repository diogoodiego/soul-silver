import { describe, expect, it } from "vitest";
import { levelUpItems, type LevelUpInput } from "../../src/progression/queue.ts";

// Cyndaquil-like fixture: evolves at 14; the stone evolution must be ignored on level up.
const learnset = [
  { level: 1, move: 33 },
  { level: 6, move: 108 },
  { level: 10, move: 52 },
  { level: 13, move: 98 },
  { level: 13, move: 43 },
];
const evolutions: LevelUpInput["evolutions"] = [
  { method: "level", condition: { kind: "level", level: 14 }, into: 156 },
  { method: "use-item", condition: { kind: "item", item: 81 }, into: 999 },
];

describe("levelUpItems", () => {
  it("one level-up per level, with that level's moves after it", () => {
    expect(levelUpItems({ member: 0, from: 9, to: 11, moves: [33], learnset, evolutions: [] })).toEqual([
      { kind: "level-up", member: 0, level: 10 },
      { kind: "learn", member: 0, move: 52 },
      { kind: "level-up", member: 0, level: 11 },
    ]);
  });

  it("skips moves already known", () => {
    expect(levelUpItems({ member: 1, from: 12, to: 13, moves: [33, 98], learnset, evolutions: [] })).toEqual([
      { kind: "level-up", member: 1, level: 13 },
      { kind: "learn", member: 1, move: 43 },
    ]);
  });

  it("evolves once, after the levels, when the evolution level is reached", () => {
    expect(levelUpItems({ member: 0, from: 13, to: 14, moves: [33], learnset, evolutions })).toEqual([
      { kind: "level-up", member: 0, level: 14 },
      { kind: "evolve", member: 0, into: 156 },
    ]);
    const items = levelUpItems({ member: 0, from: 12, to: 16, moves: [33, 98, 43], learnset, evolutions });
    expect(items.filter((i) => i.kind === "evolve")).toEqual([{ kind: "evolve", member: 0, into: 156 }]);
    expect(items.at(-1)).toEqual({ kind: "evolve", member: 0, into: 156 });
  });

  it("offers a cancelled evolution again on the next level", () => {
    expect(levelUpItems({ member: 0, from: 14, to: 15, moves: [33], learnset, evolutions }).at(-1)).toEqual({ kind: "evolve", member: 0, into: 156 });
  });

  it("ignores evolutions that are not by level", () => {
    const stone = [evolutions[1]!];
    expect(levelUpItems({ member: 0, from: 13, to: 14, moves: [33], learnset, evolutions: stone }).some((i) => i.kind === "evolve")).toBe(false);
  });

  it("is empty without a level gained", () => {
    expect(levelUpItems({ member: 0, from: 14, to: 14, moves: [33], learnset, evolutions })).toEqual([]);
  });
});
