import { describe, expect, it } from "vitest";
import { moneyLoss } from "../../src/companion/blackout.ts";

const BASE = [8, 16, 24, 36, 48, 64, 80, 100, 120];

describe("moneyLoss (Gen 4)", () => {
  it("is the highest party level times the base for the badges", () => {
    expect(moneyLoss(10000, [5, 12, 7], 0, BASE)).toBe(12 * 8);
    expect(moneyLoss(10000, [20], 3, BASE)).toBe(20 * 36);
    expect(moneyLoss(100000, [50, 45], 8, BASE)).toBe(50 * 120);
  });

  it("uses the 8-badge base past 8 badges (Kanto)", () => {
    expect(moneyLoss(100000, [60], 16, BASE)).toBe(60 * 120);
  });

  it("never takes more than the player has", () => {
    expect(moneyLoss(50, [30], 2, BASE)).toBe(50);
    expect(moneyLoss(0, [30], 2, BASE)).toBe(0);
  });
});
