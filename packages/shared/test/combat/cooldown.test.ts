import { describe, expect, it } from "vitest";
import { baseCooldownS, speedScale } from "../../src/combat/cooldown.ts";

const COOLDOWN = { a: 0.6, b: 1.2, c: 0.4, min: 0.4, max: 8, statusPower: 40 };
const SPEED = { low: 20, high: 120, moveMinPx: 60, moveMaxPx: 120, gaugeSlowS: 3, gaugeFastS: 1 };

describe("baseCooldownS", () => {
  it("is a + b·power/100 + c·(35/pp − 1), clamped", () => {
    expect(baseCooldownS(COOLDOWN, 35, 35)).toBeCloseTo(1.02); // Tackle
    expect(baseCooldownS(COOLDOWN, 95, 15)).toBeCloseTo(0.6 + 1.14 + 0.4 * (35 / 15 - 1)); // Flamethrower
    expect(baseCooldownS(COOLDOWN, 150, 5)).toBeCloseTo(4.8); // Hyper Beam
    expect(baseCooldownS(COOLDOWN, 250, 1)).toBe(8);
    expect(baseCooldownS({ ...COOLDOWN, a: -5 }, 10, 40)).toBe(0.4);
  });

  it("grows with power and with fewer PP", () => {
    expect(baseCooldownS(COOLDOWN, 90, 20)).toBeGreaterThan(baseCooldownS(COOLDOWN, 40, 20));
    expect(baseCooldownS(COOLDOWN, 60, 5)).toBeGreaterThan(baseCooldownS(COOLDOWN, 60, 25));
  });

  it("uses statusPower for moves without power", () => {
    expect(baseCooldownS(COOLDOWN, 0, 30)).toBe(baseCooldownS(COOLDOWN, 40, 30));
  });
});

describe("speedScale", () => {
  it("maps speed linearly inside the limits", () => {
    expect(speedScale(SPEED, 20)).toEqual({ movePx: 60, gaugeS: 3 });
    expect(speedScale(SPEED, 70)).toEqual({ movePx: 90, gaugeS: 2 });
    expect(speedScale(SPEED, 120)).toEqual({ movePx: 120, gaugeS: 1 });
  });

  it("never goes past the limits", () => {
    expect(speedScale(SPEED, 5)).toEqual(speedScale(SPEED, 20));
    expect(speedScale(SPEED, 999)).toEqual(speedScale(SPEED, 120));
  });
});
