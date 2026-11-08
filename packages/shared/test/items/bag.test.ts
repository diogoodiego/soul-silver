import { describe, expect, it } from "vitest";
import { addItem, canAdd, POCKET_LIMITS, removeItem, type PocketOf } from "../../src/items/bag.ts";

// Spec 027, US8: the one way into and out of the bag, with the original pocket limits.

const pocketOf: PocketOf = (item) => (item >= 328 && item <= 427 ? "machines" : item === 4 ? "balls" : item < 1000 ? "items" : undefined);
const bag = (...rows: [number, number][]) => rows.map(([item, count]) => ({ item, count }));

describe("bag", () => {
  it("adds to a stack and opens a new one", () => {
    const b = bag([17, 2]);
    expect(addItem(b, 17, 3, pocketOf)).toBe(true);
    expect(addItem(b, 18, 1, pocketOf)).toBe(true);
    expect(b).toEqual(bag([17, 5], [18, 1]));
  });

  it("refuses past the stack limit and leaves the bag as it was", () => {
    const b = bag([17, 998]);
    expect(canAdd(b, 17, 2, pocketOf)).toBe(false);
    expect(addItem(b, 17, 2, pocketOf)).toBe(false);
    expect(b).toEqual(bag([17, 998]));
  });

  it("machines stack to 99", () => {
    expect(canAdd(bag([328, 99]), 328, 1, pocketOf)).toBe(false);
    expect(canAdd(bag([328, 98]), 328, 1, pocketOf)).toBe(true);
  });

  it("refuses a new kind when the pocket is full, counting only that pocket", () => {
    const full = Array.from({ length: POCKET_LIMITS.balls.kinds }, (_, i) => ({ item: 4, count: 1 + i })).map((r, i) => ({ ...r, item: i === 0 ? 4 : 2000 + i }));
    const pocket: PocketOf = (item) => (item === 4 || item >= 2000 || item === 3 ? "balls" : "items");
    expect(canAdd(full, 3, 1, pocket)).toBe(false);
    expect(canAdd(full, 4, 1, pocket)).toBe(true);
    expect(canAdd(full, 17, 1, pocket)).toBe(true);
  });

  it("refuses an unknown item and a non-positive count", () => {
    expect(canAdd([], 5000, 1, pocketOf)).toBe(false);
    expect(canAdd([], 17, 0, pocketOf)).toBe(false);
  });

  it("removes and drops an empty stack; refuses taking more than there is", () => {
    const b = bag([17, 2], [18, 1]);
    expect(removeItem(b, 18, 1)).toBe(true);
    expect(removeItem(b, 17, 3)).toBe(false);
    expect(b).toEqual(bag([17, 2]));
  });
});
