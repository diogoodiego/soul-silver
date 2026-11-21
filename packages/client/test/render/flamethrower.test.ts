import { describe, expect, it } from "vitest";
import { flameAlpha, flameAt, flameColor, flameHeat, FLAME_REACH_PX, lightLevel } from "../../src/render/flamethrower";

const seeds = [-1, -0.5, 0, 0.5, 1].flatMap((spread) => [0, 1].map((jitter) => ({ spread, jitter, phase: spread * 3 })));
const ages = Array.from({ length: 11 }, (_, i) => i / 10);

describe("flamethrower flame", () => {
  it("leaves the mouth and stays within the beam's reach", () => {
    for (const s of seeds) {
      expect(flameAt(s, 0).along).toBe(0);
      for (const t of ages) expect(flameAt(s, t).along).toBeLessThanOrEqual(FLAME_REACH_PX);
    }
  });

  it("flies forward, fans out and swells as it ages", () => {
    const s = { spread: 1, jitter: 0.5, phase: 0 };
    for (let i = 1; i < ages.length; i++) {
      const [a, b] = [flameAt(s, ages[i - 1]!), flameAt(s, ages[i]!)];
      expect(b.along).toBeGreaterThan(a.along);
      expect(Math.abs(b.side)).toBeGreaterThanOrEqual(Math.abs(a.side));
      expect(b.size).toBeGreaterThan(a.size);
    }
  });

  it("cools as it leaves the mouth and the stream: white core, yellow around it, red at the edges", () => {
    const white = flameColor(0, 0);
    expect(Math.min(white.r, white.g, white.b)).toBeGreaterThan(0.85);
    const yellow = flameColor(0.3, 0.15);
    expect(yellow.r).toBeGreaterThan(0.9);
    expect(yellow.g).toBeGreaterThan(0.7);
    expect(yellow.b).toBeLessThan(0.5);
    for (const red of [flameColor(1, 0.5), flameColor(0, 0.75)]) {
      expect(red.r).toBeGreaterThan(0.6);
      expect(red.g).toBeLessThan(0.25);
    }
    // only a small part is white: a little way out it is no longer
    expect(flameColor(0, 0.25).b).toBeLessThan(0.5);
    expect(flameColor(0.6, 0).b).toBeLessThan(0.5);
    expect(flameColor(-1, 0.3)).toEqual(flameColor(1, 0.3));
  });

  it("is hottest at the mouth and in the core", () => {
    for (let i = 1; i < ages.length; i++) expect(flameHeat(0, ages[i]!)).toBeLessThan(flameHeat(0, ages[i - 1]!));
    expect(flameHeat(1, 0.2)).toBeLessThan(flameHeat(0.5, 0.2));
    expect(flameHeat(0.5, 0.2)).toBeLessThan(flameHeat(0, 0.2));
  });

  it("holds solid, then fades out by the end of its life", () => {
    expect(flameAlpha(0)).toBe(1);
    expect(flameAlpha(0.5)).toBe(1);
    expect(flameAlpha(1)).toBe(0);
    for (let i = 1; i < ages.length; i++) expect(flameAlpha(ages[i]!)).toBeLessThanOrEqual(flameAlpha(ages[i - 1]!));
  });

  it("lights the scene while breathing and goes dark after", () => {
    expect(lightLevel(0)).toBe(0);
    expect(lightLevel(300)).toBeGreaterThan(0.9);
    expect(lightLevel(5000)).toBe(0);
  });
});
