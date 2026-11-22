import { describe, expect, it } from "vitest";
import { fitMoves, isSpecial, learnChoice, slotIndices } from "../../src/combat/classes.ts";

// Block C: normal moves (power < 80) in slots 1–2, special ones (power ≥ 80, status, fixed or variable damage) in 3–4.

describe("isSpecial", () => {
  it.each([
    [79, false],
    [40, false],
    [80, true],
    [150, true],
    [0, true],
    [1, true],
  ])("power %i → %s", (power, special) => {
    expect(isSpecial({ power })).toBe(special);
  });

  it("counts fixed damage as special whatever the power", () => {
    expect(isSpecial({ power: 40 }, true)).toBe(true);
  });
});

const POWER: Record<number, number> = { 1: 40, 2: 35, 3: 60, 4: 90, 5: 0, 6: 120, 7: 50 };
const special = (m: number) => isSpecial({ power: POWER[m]! });

describe("slotIndices", () => {
  it("puts normals in slots 0–1 and specials in 2–3, leaving holes", () => {
    expect(slotIndices([1, 4], special)).toEqual({ slots: [0, undefined, 1, undefined], extra: [] });
  });

  it("keeps the last two of a class; the rest are extra", () => {
    expect(slotIndices([1, 2, 3, 7], special)).toEqual({ slots: [2, 3, undefined, undefined], extra: [0, 1] });
    expect(slotIndices([4, 5, 6, 1], special)).toEqual({ slots: [3, undefined, 1, 2], extra: [0] });
  });

  it("orders mixed moves by class", () => {
    expect(slotIndices([4, 1, 5, 2], special)).toEqual({ slots: [1, 3, 0, 2], extra: [] });
  });
});

describe("fitMoves", () => {
  it("leaves a fitting member alone", () => {
    const m = { moves: [1, 2, 4, 5], ppUps: [1, 0, 2, 0] };
    expect(fitMoves(m, special)).toBe(false);
    expect(m).toEqual({ moves: [1, 2, 4, 5], ppUps: [1, 0, 2, 0] });
  });

  it("sorts by class and keeps PP Ups with their move", () => {
    const m = { moves: [4, 1, 5, 2], ppUps: [3, 1, 0, 2] };
    expect(fitMoves(m, special)).toBe(true);
    expect(m).toEqual({ moves: [1, 2, 4, 5], ppUps: [1, 2, 3, 0] });
  });

  it("moves extra normals to the forgotten list", () => {
    const m: { moves: number[]; forgottenMoves?: number[] } = { moves: [1, 2, 3, 7] };
    fitMoves(m, special);
    expect(m).toEqual({ moves: [3, 7], forgottenMoves: [1, 2] });
  });

  it("moves extra specials to the forgotten list, without repeats", () => {
    const m = { moves: [4, 5, 6, 1], forgottenMoves: [4] };
    fitMoves(m, special);
    expect(m).toEqual({ moves: [1, 5, 6], forgottenMoves: [4] });
  });
});

describe("learnChoice", () => {
  it("adds the move when its class has a free slot", () => {
    expect(learnChoice([1, 4, 5], 2, special)).toEqual({ free: true, replaceable: [0] });
    expect(learnChoice([1, 2], 6, special)).toEqual({ free: true, replaceable: [] });
  });

  it("offers only the moves of the same class when it is full", () => {
    expect(learnChoice([1, 2, 4, 5], 3, special)).toEqual({ free: false, replaceable: [0, 1] });
    expect(learnChoice([1, 2, 4, 5], 6, special)).toEqual({ free: false, replaceable: [2, 3] });
  });

  it("asks when four moves are known even with room in the class (unsorted members)", () => {
    expect(learnChoice([1, 2, 3, 4], 6, special)).toEqual({ free: false, replaceable: [3] });
  });
});
