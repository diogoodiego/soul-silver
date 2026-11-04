import { describe, expect, it } from "vitest";
import { headbuttTree } from "../../src/field/index.ts";

// Spec 025 (FR-013): the tree's table follows headbutt.c's lookup tables by the trainer id's last digit.

const group = (x: number) => [[x, 0] as [number, number], [x, 1] as [number, number]];

describe("headbuttTree", () => {
  it("picks common, rare or nothing for regular trees by the trainer id", () => {
    const two = { regularTrees: [group(10), group(20)], secretTrees: [] };
    expect(headbuttTree(two, 10, 1, 0)).toBe("common");
    expect(headbuttTree(two, 20, 0, 0)).toBe("rare");
    expect(headbuttTree(two, 10, 0, 11)).toBe("rare");
    const three = { regularTrees: [group(1), group(2), group(3)], secretTrees: [] };
    expect(headbuttTree(three, 3, 0, 0)).toBeUndefined();
    expect(headbuttTree(three, 1, 0, 4)).toBeUndefined();
  });

  it("wraps the column for five or more groups", () => {
    const seven = { regularTrees: [1, 2, 3, 4, 5, 6, 7].map(group), secretTrees: [] };
    expect(headbuttTree(seven, 6, 0, 0)).toBeUndefined(); // group 5 → column 0, LUT_5Plus[0][0] is none
    expect(headbuttTree(seven, 7, 0, 0)).toBe("common");
  });

  it("uses the secret table for secret trees and nothing elsewhere", () => {
    const r = { regularTrees: [group(1)], secretTrees: [group(9)] };
    expect(headbuttTree(r, 9, 1, 3)).toBe("secret");
    expect(headbuttTree(r, 50, 50, 0)).toBeUndefined();
  });
});
