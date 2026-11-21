import { describe, expect, it } from "vitest";
import { etaSeconds } from "../../src/screens/eta";

describe("etaSeconds", () => {
  it("waits for enough data before estimating", () => {
    expect(etaSeconds({ t: 0, percent: 0 }, { t: 1000, percent: 2 })).toBeUndefined();
  });

  it("extrapolates the average rate since the first sample", () => {
    // 20% in 10 s -> 80% left takes 40 s
    expect(etaSeconds({ t: 0, percent: 0 }, { t: 10_000, percent: 20 })).toBe(40);
  });

  it("measures from the first sample, not from zero", () => {
    expect(etaSeconds({ t: 5000, percent: 50 }, { t: 15_000, percent: 60 })).toBe(40);
  });
});
