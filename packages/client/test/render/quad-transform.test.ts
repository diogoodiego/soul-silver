import { describe, expect, it } from "vitest";
import { quadTransform } from "../../src/render/quad-transform";

/** Applies the CSS matrix3d (column-major) to an element point. */
function apply(m: number[], x: number, y: number): [number, number] {
  const X = m[0]! * x + m[4]! * y + m[12]!;
  const Y = m[1]! * x + m[5]! * y + m[13]!;
  const W = m[3]! * x + m[7]! * y + m[15]!;
  return [X / W, Y / W];
}

describe("quadTransform", () => {
  it("maps the element's corners onto a rectangle", () => {
    const m = quadTransform(200, 100, [
      [10, 20],
      [410, 20],
      [410, 220],
      [10, 220],
    ]);
    expect(apply(m, 0, 0)).toEqual([10, 20]);
    expect(apply(m, 200, 100)).toEqual([410, 220]);
    expect(apply(m, 100, 50)).toEqual([210, 120]);
  });

  it("maps every corner onto a perspective quad", () => {
    const quad: [[number, number], [number, number], [number, number], [number, number]] = [
      [12, 30],
      [300, 10],
      [320, 240],
      [5, 200],
    ];
    const m = quadTransform(800, 440, quad);
    const corners: [number, number][] = [
      [0, 0],
      [800, 0],
      [800, 440],
      [0, 440],
    ];
    corners.forEach(([x, y], i) => {
      const [X, Y] = apply(m, x, y);
      expect(X).toBeCloseTo(quad[i]![0], 6);
      expect(Y).toBeCloseTo(quad[i]![1], 6);
    });
  });
});
