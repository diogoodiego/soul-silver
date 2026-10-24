import { describe, expect, it } from "vitest";
import { keyboardVector, stickVector, STICK_DEADZONE } from "../../src/input/input";

describe("keyboardVector", () => {
  it("is zero with nothing held", () => {
    expect(keyboardVector(new Set())).toEqual({ x: 0, y: 0 });
  });

  it("maps arrows and WASD to the 4 directions", () => {
    expect(keyboardVector(new Set(["ArrowUp"]))).toEqual({ x: 0, y: -1 });
    expect(keyboardVector(new Set(["KeyD"]))).toEqual({ x: 1, y: 0 });
  });

  it("gives a unit diagonal for two directions", () => {
    const v = keyboardVector(new Set(["ArrowDown", "KeyA"]));
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 10);
    expect(v.x).toBeLessThan(0);
    expect(v.y).toBeGreaterThan(0);
  });

  it("cancels opposite keys", () => {
    expect(keyboardVector(new Set(["ArrowLeft", "ArrowRight"]))).toEqual({ x: 0, y: 0 });
  });
});

describe("stickVector", () => {
  it("ignores the dead zone", () => {
    expect(stickVector(STICK_DEADZONE * 0.9, 0)).toEqual({ x: 0, y: 0 });
  });

  it("rescales so intensity starts at 0 past the dead zone and reaches 1", () => {
    expect(Math.hypot(...Object.values(stickVector(STICK_DEADZONE + 0.01, 0)))).toBeLessThan(0.05);
    expect(stickVector(1, 0).x).toBeCloseTo(1, 10);
  });

  it("never exceeds length 1", () => {
    const v = stickVector(1, 1);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 10);
  });
});
