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

describe("wildMoves by class (block C)", () => {
  // 28 Sand Attack and 45 Growl are status (special), 16 Gust and 33 Tackle normal, 98 Quick Attack normal, 18 Whirlwind status.
  const special = (m: number) => [28, 45, 18].includes(m);

  it("keeps the last two of each class, normals first", () => {
    expect(wildMoves(learnset, 13, special)).toEqual([16, 98, 45, 28]);
    expect(wildMoves(learnset, 20, special)).toEqual([16, 98, 28, 18]);
  });

  it("leaves a class empty when it learnt none", () => {
    expect(wildMoves(learnset, 4, (m) => m === 28)).toEqual([33, 45]);
  });
});
