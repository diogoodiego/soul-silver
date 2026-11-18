import { describe, expect, it } from "vitest";
import { spread } from "../../src/ui/callouts";

describe("spread", () => {
  it("keeps labels at their anchors when they do not touch", () => {
    expect(spread([{ y: 10, h: 20 }, { y: 100, h: 20 }], 0, 300)).toEqual([10, 100]);
  });

  it("pushes a label down past the one above it, keeping the gap", () => {
    expect(spread([{ y: 10, h: 20 }, { y: 15, h: 20 }], 0, 300, 4)).toEqual([10, 34]);
  });

  it("orders by anchor, whatever the input order", () => {
    expect(spread([{ y: 15, h: 20 }, { y: 10, h: 20 }], 0, 300, 4)).toEqual([34, 10]);
  });

  it("pulls the column up when it would run past the bottom", () => {
    const ys = spread([{ y: 250, h: 30 }, { y: 260, h: 30 }], 0, 300, 4);
    expect(ys[1]! + 30).toBeLessThanOrEqual(300);
    expect(ys[1]! - ys[0]!).toBeGreaterThanOrEqual(34);
  });

  it("never goes above the top", () => {
    expect(spread([{ y: -20, h: 20 }], 0, 300)).toEqual([0]);
  });
});
