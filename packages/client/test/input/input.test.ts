import { describe, expect, it } from "vitest";
import { BUTTON } from "@soulsilver/shared/game";
import { keyboardVector, moveButtons, stickVector, STICK_DEADZONE } from "../../src/input/input";

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

describe("moveButtons", () => {
  it("maps keys 1–4 to move bits 0–3", () => {
    expect(moveButtons(new Set(["Digit1"]), () => false)).toBe(0b0001);
    expect(moveButtons(new Set(["Digit2", "Digit4"]), () => false)).toBe(0b1010);
    expect(moveButtons(new Set(["KeyW"]), () => false)).toBe(0);
  });

  it("maps pad A, X, Y and RB to moves 1–4", () => {
    const pad = (down: number[]) => (i: number) => down.includes(i);
    expect(moveButtons(new Set(), pad([0]))).toBe(0b0001);
    expect(moveButtons(new Set(), pad([2, 3]))).toBe(0b0110);
    expect(moveButtons(new Set(), pad([5]))).toBe(0b1000);
    expect(moveButtons(new Set(), pad([1]))).toBe(0); // B runs
  });

  it("maps the companion actions to their bits: F/LT combat, R/RT recall, E/View interact", () => {
    expect(moveButtons(new Set(["KeyF"]), () => false)).toBe(BUTTON.combat);
    expect(moveButtons(new Set(), (i) => i === 7)).toBe(BUTTON.recall);
    expect(moveButtons(new Set(["KeyE"]), (i) => i === 6)).toBe(BUTTON.interact | BUTTON.combat);
    // The picker is the client's own: no bit.
    expect(moveButtons(new Set(["KeyQ"]), () => false)).toBe(0);
  });

  it("maps G and pad LS to the throw, bit 8; the ball cycle (B, RS) is the client's own", () => {
    expect(moveButtons(new Set(["KeyG"]), () => false)).toBe(BUTTON.throw);
    expect(moveButtons(new Set(), (i) => i === 10)).toBe(BUTTON.throw);
    expect(moveButtons(new Set(["KeyB"]), (i) => i === 11)).toBe(0);
  });

  it("maps Space and pad LB to dash, bit 4", () => {
    expect(moveButtons(new Set(["Space"]), () => false)).toBe(0b10000);
    expect(moveButtons(new Set(), (i) => i === 4)).toBe(0b10000);
  });
});
