import { describe, expect, it } from "vitest";
import { hitChance, specialCooldownS, speedScale } from "../../src/combat/cooldown.ts";

const COOLDOWN = { baseS: 5, perPowerS: 0.1, maxS: 12 };
const SPEED = { low: 20, high: 120, moveMinPx: 60, moveMaxPx: 120, reflexSlowS: 1.6, reflexFastS: 0.8 };

describe("specialCooldownS (block C)", () => {
  it("is 5 s + (power − 80)/10, at most 12 s", () => {
    expect(specialCooldownS(COOLDOWN, 80)).toBe(5);
    expect(specialCooldownS(COOLDOWN, 100)).toBeCloseTo(7);
    expect(specialCooldownS(COOLDOWN, 120)).toBeCloseTo(9);
    expect(specialCooldownS(COOLDOWN, 150)).toBe(12);
    expect(specialCooldownS(COOLDOWN, 250)).toBe(12);
  });

  it("is the base for status, fixed and variable damage (power 0 or 1)", () => {
    expect(specialCooldownS(COOLDOWN, 0)).toBe(5);
    expect(specialCooldownS(COOLDOWN, 1)).toBe(5);
  });
});

describe("speedScale", () => {
  it("maps speed linearly inside the limits: faster moves farther and recovers sooner", () => {
    expect(speedScale(SPEED, 20)).toEqual({ movePx: 60, reflexS: 1.6 });
    expect(speedScale(SPEED, 70).movePx).toBe(90);
    expect(speedScale(SPEED, 70).reflexS).toBeCloseTo(1.2);
    expect(speedScale(SPEED, 120)).toEqual({ movePx: 120, reflexS: 0.8 });
  });

  it("never goes past the limits", () => {
    expect(speedScale(SPEED, 5)).toEqual(speedScale(SPEED, 20));
    expect(speedScale(SPEED, 999)).toEqual(speedScale(SPEED, 120));
  });
});

describe("hitChance (block C, the original's accuracy stages)", () => {
  it("is the move's accuracy at stage 0", () => {
    expect(hitChance(75, 0)).toBe(75);
  });

  it("follows the stage table, accuracy minus evasion, clamped to ±6", () => {
    expect(hitChance(100, -1)).toBe(75);
    expect(hitChance(100, -6)).toBe(33);
    expect(hitChance(100, -9)).toBe(33);
    expect(hitChance(90, 1)).toBeCloseTo(119.7);
    expect(hitChance(50, 6)).toBe(150);
  });
});
