import { describe, expect, it } from "vitest";
import { wildMoves } from "../../src/wild/moves.ts";

const learnset = [
  { level: 1, move: 33 },
  { level: 1, move: 45 },
  { level: 5, move: 28 },
  { level: 9, move: 16 },
  { level: 13, move: 98 },
  { level: 17, move: 18 },
  { level: 17, move: 33 },
];

describe("wildMoves", () => {
  it("knows the last four moves learnt up to its level", () => {
    expect(wildMoves(learnset, 13)).toEqual([45, 28, 16, 98]);
  });

  it("knows fewer when the learnset is short at that level", () => {
    expect(wildMoves(learnset, 4)).toEqual([33, 45]);
  });

  it("does not learn a move it already knows twice", () => {
    expect(wildMoves(learnset, 20)).toEqual([16, 98, 18, 33]);
  });

  it("falls back to Tackle with an empty learnset", () => {
    expect(wildMoves([], 10)).toEqual([33]);
  });
});
