import { describe, expect, it } from "vitest";
import { clampCamera, integerScale, OBLIQUE, obliqueProjection, VIEW_H, VIEW_W } from "../../src/render/camera";

const bounds = { left: 0, top: 0, right: 512, bottom: 512 };

describe("clampCamera", () => {
  it("centers on the focus inside the bounds", () => {
    expect(clampCamera(256, 256, bounds)).toEqual({ x: 256 - VIEW_W / 2, y: 256 - VIEW_H / 2 });
  });

  it("stops at every edge", () => {
    expect(clampCamera(10, 10, bounds)).toEqual({ x: 0, y: 0 });
    expect(clampCamera(510, 510, bounds)).toEqual({ x: 512 - VIEW_W, y: 512 - VIEW_H });
  });

  it("includes neighbors in the bounds", () => {
    expect(clampCamera(10, 256, { ...bounds, left: -512 }).x).toBe(10 - VIEW_W / 2);
  });

  it("centers an area smaller than the screen", () => {
    expect(clampCamera(50, 50, { left: 0, top: 0, right: 160, bottom: 128 })).toEqual({ x: (160 - VIEW_W) / 2, y: (128 - VIEW_H) / 2 });
  });

  it("stays on whole pixels", () => {
    const c = clampCamera(200.4, 300.7, bounds);
    expect([Number.isInteger(c.x), Number.isInteger(c.y)]).toEqual([true, true]);
  });
});

describe("integerScale", () => {
  it("uses the largest whole factor that fits, centered", () => {
    expect(integerScale(1920, 1080)).toEqual({ scale: 5, left: (1920 - 5 * VIEW_W) / 2, top: (1080 - 5 * VIEW_H) / 2 });
  });

  it("never goes below 1", () => {
    expect(integerScale(100, 100).scale).toBe(1);
  });

  it("puts bars on whole pixels", () => {
    const s = integerScale(1001, 777);
    expect([Number.isInteger(s.left), Number.isInteger(s.top)]).toEqual([true, true]);
  });
});

describe("obliqueProjection", () => {
  const apply = (m: number[], [x, y, z]: [number, number, number]) => [0, 1, 2].map((r) => m[r * 4]! * x + m[r * 4 + 1]! * y + m[r * 4 + 2]! * z + m[r * 4 + 3]!);

  it("puts ground on its grid: the view's corners at the clip corners", () => {
    const m = obliqueProjection(100, 40);
    const [a, b] = [apply(m, [100, 0, 40]), apply(m, [100 + VIEW_W, 0, 40 + VIEW_H])];
    expect([a[0], a[1], b[0], b[1]].map((v) => Math.round(v! * 1e9) / 1e9)).toEqual([-1, 1, 1, -1]);
  });

  it("draws height OBLIQUE pixels up per pixel, at the same depth as a point that far south", () => {
    const m = obliqueProjection(0, 0);
    const raised = apply(m, [10, 16, 50]);
    expect(raised[1]).toBeCloseTo(apply(m, [10, 0, 50 - 16 * OBLIQUE])[1]!);
    expect(raised[2]).toBeCloseTo(apply(m, [10, 0, 50 + 16 / OBLIQUE])[2]!);
  });

  it("makes higher and further south nearer, inside the clip range on screen", () => {
    const m = obliqueProjection(0, 0);
    const [, , ground] = apply(m, [0, 0, 100]);
    expect(apply(m, [0, 20, 100])[2]).toBeLessThan(ground!);
    expect(apply(m, [0, 0, 120])[2]).toBeLessThan(ground!);
    for (const p of [[0, 0, 0], [0, 0, VIEW_H], [0, 400, VIEW_H + 300]] as [number, number, number][]) expect(Math.abs(apply(m, p)[2]!)).toBeLessThan(1);
  });
});
