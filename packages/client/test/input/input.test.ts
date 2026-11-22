import { describe, expect, it } from "vitest";
import { BUTTON } from "@soulsilver/shared/game";
import { DEFAULT_KEYS, rebind } from "@soulsilver/shared/input";
import { createRepeater, keyboardVector, moveButtons, REPEAT_DELAY_MS, REPEAT_EVERY_MS, stickVector, STICK_DEADZONE } from "../../src/input/input";

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
  it("maps J, K, L, I to move bits 0–3", () => {
    expect(moveButtons(new Set(["KeyJ"]), () => false)).toBe(0b0001);
    expect(moveButtons(new Set(["KeyK", "KeyI"]), () => false)).toBe(0b1010);
    expect(moveButtons(new Set(["KeyW"]), () => false)).toBe(0);
  });

  it("maps pad A, X, Y and RB to moves 1–4", () => {
    const pad = (down: number[]) => (i: number) => down.includes(i);
    expect(moveButtons(new Set(), pad([0]))).toBe(0b0001 | BUTTON.interact); // A also interacts on the map
    expect(moveButtons(new Set(), pad([2, 3]))).toBe(0b0110);
    expect(moveButtons(new Set(), pad([5]))).toBe(0b1000);
    // B runs on the map; block C: in combat it is the guard (tap to parry, hold to guard).
    expect(moveButtons(new Set(), pad([1]))).toBe(BUTTON.guard);
  });

  it("maps H to the guard (block C)", () => {
    expect(moveButtons(new Set(["KeyH"]), () => false)).toBe(BUTTON.guard);
  });

  it("maps the companion actions to their bits: F/LT combat, R/RT recall, A interact", () => {
    expect(moveButtons(new Set(["KeyF"]), () => false)).toBe(BUTTON.combat);
    expect(moveButtons(new Set(), (i) => i === 7)).toBe(BUTTON.recall);
    expect(moveButtons(new Set(), (i) => i === 6 || i === 0)).toBe(BUTTON.interact | BUTTON.combat | 0b0001);
    // The quick swap (Q previous, E next) is the client's own: no bit.
    expect(moveButtons(new Set(["KeyQ", "KeyE"]), () => false)).toBe(0);
  });

  it("maps G and pad LS to the throw, bit 8; the ball cycle (B, D-pad right) is the client's own", () => {
    expect(moveButtons(new Set(["KeyG"]), () => false)).toBe(BUTTON.throw);
    expect(moveButtons(new Set(), (i) => i === 10)).toBe(BUTTON.throw);
    expect(moveButtons(new Set(["KeyB"]), (i) => i === 15)).toBe(0);
  });

  it("maps Space to dash and interact (the server reads each in its own mode), pad LB to dash only", () => {
    expect(moveButtons(new Set(["Space"]), () => false)).toBe(BUTTON.dash | BUTTON.interact);
    expect(moveButtons(new Set(), (i) => i === 4)).toBe(0b10000);
  });
});

describe("bindings (spec 017)", () => {
  it("follows a remapped key and drops the old one", () => {
    const { bindings } = rebind(DEFAULT_KEYS, "combat", "KeyZ");
    expect(moveButtons(new Set(["KeyZ"]), () => false, bindings)).toBe(BUTTON.combat);
    expect(moveButtons(new Set(["KeyF"]), () => false, bindings)).toBe(0);
  });

  it("moves with remapped direction keys", () => {
    const { bindings } = rebind(DEFAULT_KEYS, "up", "KeyI");
    expect(keyboardVector(new Set(["KeyI"]), bindings)).toEqual({ x: 0, y: -1 });
    expect(keyboardVector(new Set(["KeyW"]), bindings)).toEqual({ x: 0, y: 0 });
  });

  it("puts interact on A with move 1: the server reads each in its own mode (walk, combat)", () => {
    expect(moveButtons(new Set(), (i) => i === 0)).toBe(BUTTON.interact | 0b0001);
    expect(moveButtons(new Set(), (i) => i === 12)).toBe(0);
  });
});

describe("createRepeater", () => {
  it("fires on press, after 400 ms, then every 120 ms, and again after a release", () => {
    const fire = createRepeater();
    const at = (t: number, down = true) => fire("down", down, t);
    expect(at(0)).toBe(true);
    expect(at(100)).toBe(false);
    expect(at(REPEAT_DELAY_MS - 1)).toBe(false);
    expect(at(REPEAT_DELAY_MS)).toBe(true);
    expect(at(REPEAT_DELAY_MS + REPEAT_EVERY_MS - 1)).toBe(false);
    expect(at(REPEAT_DELAY_MS + REPEAT_EVERY_MS)).toBe(true);
    expect(at(600, false)).toBe(false);
    expect(at(610)).toBe(true);
  });

  it("keeps actions apart", () => {
    const fire = createRepeater();
    expect(fire("up", true, 0)).toBe(true);
    expect(fire("confirm", true, 10)).toBe(true);
    expect(fire("up", true, 20)).toBe(false);
  });
});
