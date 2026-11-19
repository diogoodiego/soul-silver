import { describe, expect, it } from "vitest";
import { cycleSwap } from "../../src/game/swap-cycle";

const ok = { hp: 10 };
const down = { hp: 0 };
const egg = { hp: 10, egg: true as const };

describe("quick swap cycling (Q/E in combat)", () => {
  it("picks the next member able to fight, wrapping around", () => {
    expect(cycleSwap([ok, ok, ok], 0, 1)).toBe(1);
    expect(cycleSwap([ok, ok, ok], 2, 1)).toBe(0);
  });

  it("picks the previous member, wrapping around", () => {
    expect(cycleSwap([ok, ok, ok], 0, -1)).toBe(2);
    expect(cycleSwap([ok, ok, ok], 2, -1)).toBe(1);
  });

  it("skips fainted members and eggs", () => {
    expect(cycleSwap([ok, down, egg, ok], 0, 1)).toBe(3);
    expect(cycleSwap([ok, down, egg, ok], 0, -1)).toBe(3);
  });

  it("skips members that may not be sent out here (surfing)", () => {
    expect(cycleSwap([ok, ok, ok], 0, 1, [true, false, true])).toBe(2);
  });

  it("returns undefined when no one else can fight", () => {
    expect(cycleSwap([ok, down, egg], 0, 1)).toBeUndefined();
    expect(cycleSwap([ok], 0, -1)).toBeUndefined();
  });

  it("starts from the first slot when no one is out", () => {
    expect(cycleSwap([down, ok, ok], undefined, 1)).toBe(1);
    expect(cycleSwap([down, ok, ok], undefined, -1)).toBe(2);
  });
});
