import { describe, expect, it } from "vitest";
import { createRng } from "../../src/game/rng.ts";
import { aimAt, eightWay, preferredRange, steer, threatened } from "../../src/ai/action.ts";
import { EMBER, env, move, TACKLE } from "./fixtures.ts";

const angle = (p: { x: number; y: number }) => (Math.atan2(p.y, p.x) * 180) / Math.PI;

describe("action layer (US1)", () => {
  it("contact movesets close in, ranged ones keep away and strafe", () => {
    const contact = preferredRange([TACKLE, move({ id: 10 }), EMBER]);
    const ranged = preferredRange([EMBER, { ...EMBER, id: 53 }, TACKLE]);
    expect(contact.ranged).toBe(false);
    expect(ranged.ranged).toBe(true);
    expect(contact.px).toBeLessThan(ranged.px);
  });

  it("aims within the profile's angular error", () => {
    const rng = createRng(4);
    for (let i = 0; i < 200; i++) {
      const a = aimAt({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0 }, 0, 0, 10, rng);
      expect(Math.abs(angle(a))).toBeLessThanOrEqual(10.0001);
    }
  });

  it("leads a moving target with a full lead factor", () => {
    const rng = createRng(4);
    // Target 100 px east walking south at 3 px per tick, shot at 200 px per second (10 per tick).
    const lead = aimAt({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 3 }, 1, 200, 0, rng);
    const none = aimAt({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 3 }, 0, 200, 0, rng);
    expect(angle(lead)).toBeGreaterThan(5);
    expect(angle(none)).toBeCloseTo(0);
  });

  it("moves in 8 directions like a player's stick", () => {
    const d = eightWay({ x: 0.9, y: 0.3 });
    expect(d).toEqual({ x: 1, y: 0 });
    const diag = eightWay({ x: 0.6, y: 0.5 });
    expect(diag.x).toBeCloseTo(Math.SQRT1_2);
    expect(diag.y).toBeCloseTo(Math.SQRT1_2);
  });

  it("goes around a wall, and is cornered with nowhere to go", () => {
    const e = env(1, ["2,0"]);
    const around = steer({ x: 24, y: 8 }, { x: 1, y: 0 }, 10, e.walkable);
    expect(around).toBeDefined();
    expect(around!.y).not.toBe(0);
    const boxed = env(1, ["0,0", "2,0", "0,1", "1,1", "2,1"]);
    expect(steer({ x: 24, y: 8 }, { x: 0, y: -1 }, 16, boxed.walkable)).toBeUndefined();
  });

  it("sees a cast coming at it", () => {
    expect(threatened({ x: 50, y: 0 }, { x: 0, y: 0, cast: { dir: { x: 1, y: 0 }, reachPx: 60, elapsedTicks: 3, leftTicks: 5, special: false } }, 8)).toBe(true);
    expect(threatened({ x: 0, y: 50 }, { x: 0, y: 0, cast: { dir: { x: 1, y: 0 }, reachPx: 60, elapsedTicks: 3, leftTicks: 5, special: false } }, 8)).toBe(false);
    expect(threatened({ x: 100, y: 0 }, { x: 0, y: 0, cast: { dir: { x: 1, y: 0 }, reachPx: 60, elapsedTicks: 3, leftTicks: 5, special: false } }, 8)).toBe(false);
  });
});
