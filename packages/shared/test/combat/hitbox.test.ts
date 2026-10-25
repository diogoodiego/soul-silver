import { describe, expect, it } from "vitest";
import { overlaps, segmentHits } from "../../src/combat/hitbox.ts";

const east = { x: 1, y: 0 };
const at = (x: number, y: number, r = 4) => ({ x, y, r });
const o = { x: 0, y: 0 };

describe("overlaps", () => {
  it("circle", () => {
    const c = { shape: "circle", radiusPx: 10 } as const;
    expect(overlaps(c, o, east, at(13, 0))).toBe(true);
    expect(overlaps(c, o, east, at(14, 0))).toBe(true); // tangent
    expect(overlaps(c, o, east, at(15, 0))).toBe(false);
  });

  it("capsule follows the aim", () => {
    const beam = { shape: "capsule", lengthPx: 100, widthPx: 8 } as const;
    expect(overlaps(beam, o, east, at(90, 7))).toBe(true);
    expect(overlaps(beam, o, east, at(90, 9))).toBe(false);
    expect(overlaps(beam, o, east, at(-10, 0))).toBe(false);
    expect(overlaps(beam, o, { x: 0, y: 1 }, at(1, 90))).toBe(true);
    expect(overlaps(beam, o, { x: 0, y: 1 }, at(90, 0))).toBe(false);
  });

  it("arc is a sector around the aim", () => {
    const fan = { shape: "arc", radiusPx: 20, angleDeg: 90 } as const;
    expect(overlaps(fan, o, east, at(15, 0))).toBe(true);
    expect(overlaps(fan, o, east, at(10, 9))).toBe(true); // inside the 45° half angle
    expect(overlaps(fan, o, east, at(-15, 0))).toBe(false); // behind
    expect(overlaps(fan, o, east, at(10, 13))).toBe(true); // outside the angle, but the body touches the edge ray
    expect(overlaps(fan, o, east, at(0, 30))).toBe(false);
    expect(overlaps(fan, o, east, at(25, 0))).toBe(false);
  });
});

describe("segmentHits", () => {
  it("a projectile cannot pass through a target between ticks", () => {
    expect(segmentHits({ x: 0, y: 0 }, { x: 50, y: 0 }, 3, at(25, 0))).toBe(true);
    expect(segmentHits({ x: 0, y: 0 }, { x: 50, y: 0 }, 3, at(25, 8))).toBe(false);
    expect(segmentHits({ x: 0, y: 0 }, { x: 0, y: 0 }, 3, at(6, 0))).toBe(true);
  });
});
