import { describe, expect, it } from "vitest";
import { createRng, type Rng } from "../../src/game/rng.ts";
import { ballMultiplier, catchValue, rollShakes, shakeThreshold, type BallContext } from "../../src/wild/capture.ts";
import type { Ball } from "../../src/wild/schemas.ts";

// Reference values worked out by hand from the Gen 3–4 formula (research R8).
describe("catchValue", () => {
  it.each([
    // hpMax, hp, rate, ball, status → a
    [20, 20, 255, 1, undefined, 85], // full HP: a third of the rate
    [20, 10, 255, 1, undefined, 170], // half HP
    [20, 1, 255, 1, undefined, 246], // 1 HP: almost the whole rate
    [20, 1, 45, 1.5, "sleep", 130],
    [20, 1, 45, 1.5, "freeze", 130],
    [20, 1, 45, 1.5, "paralysis", 97],
    [20, 1, 45, 1.5, "burn", 97],
    [20, 1, 45, 1.5, "poison", 97],
    [20, 1, 45, 1.5, "toxic", 97],
    [20, 1, 45, 1.5, undefined, 65],
    [100, 100, 3, 1, undefined, 1],
  ] as const)("hpMax %i, hp %i, rate %i, ball ×%s, %s → %i", (hpMax, hp, catchRate, ball, status, a) => {
    expect(catchValue({ hpMax, hp, catchRate, ball, status })).toBe(a);
  });
});

describe("shakeThreshold", () => {
  it.each([
    [85, 49931],
    [170, 61680],
    [1, 16643],
  ])("a = %i → b = %i", (a, b) => {
    expect(shakeThreshold(a)).toBe(b);
  });
});

/** An rng whose 16-bit rolls come from a list. */
const scripted = (rolls: number[]): Rng => {
  let i = 0;
  const next = () => rolls[i++]! * 65536;
  return { next, nextFloat: () => rolls[i++]! / 65536, nextInt: (n: number) => Math.floor((rolls[i++]! / 65536) * n) };
};

describe("rollShakes", () => {
  it("catches without a roll at a ≥ 255", () => {
    expect(rollShakes(255, scripted([]))).toEqual({ shakes: 3, caught: true });
  });

  it("never catches at a = 0", () => {
    expect(rollShakes(0, createRng(1))).toEqual({ shakes: 0, caught: false });
  });

  it("counts the checks passed before the first miss, up to three shakes", () => {
    const b = shakeThreshold(85);
    expect(rollShakes(85, scripted([b + 1]))).toEqual({ shakes: 0, caught: false });
    expect(rollShakes(85, scripted([0, 0, b]))).toEqual({ shakes: 2, caught: false });
    expect(rollShakes(85, scripted([0, 0, 0, b]))).toEqual({ shakes: 3, caught: false });
    expect(rollShakes(85, scripted([0, 0, 0, 0]))).toEqual({ shakes: 3, caught: true });
  });

  it("catches about (b/65536)^4 of the time", () => {
    const rng = createRng(9);
    let caught = 0;
    for (let i = 0; i < 20000; i++) if (rollShakes(85, rng).caught) caught++;
    const p = (shakeThreshold(85) / 65536) ** 4;
    expect(caught / 20000).toBeCloseTo(p, 1);
  });
});

const ctx: BallContext = { night: false, cave: false, turns: 0, types: [0], level: 10, caughtBefore: false, userLevel: 10, baseSpeed: 50, moonEvolver: false };

describe("ballMultiplier", () => {
  it.each([
    ["plain", { mult: 2 }, {}, 2],
    ["dusk at night", { mult: 3.5, when: "night-or-cave" }, { night: true }, 3.5],
    ["dusk in a cave", { mult: 3.5, when: "night-or-cave" }, { cave: true }, 3.5],
    ["dusk by day outdoors", { mult: 3.5, when: "night-or-cave" }, {}, 1],
    ["quick on the first turn", { mult: 4, when: "first-turn" }, { turns: 0 }, 4],
    ["quick later", { mult: 4, when: "first-turn" }, { turns: 1 }, 1],
    ["timer at turn 0", { mult: 1, when: "timer" }, { turns: 0 }, 1],
    ["timer at turn 10", { mult: 1, when: "timer" }, { turns: 10 }, 2],
    ["timer capped at 4", { mult: 1, when: "timer" }, { turns: 99 }, 4],
    ["net on water", { mult: 3, when: "types", types: [11, 6] }, { types: [11] }, 3],
    ["net on bug/flying", { mult: 3, when: "types", types: [11, 6] }, { types: [6, 2] }, 3],
    ["net on normal", { mult: 3, when: "types", types: [11, 6] }, {}, 1],
    ["nest at level 5", { mult: 1, when: "nest" }, { level: 5 }, 3.5],
    ["nest at level 35", { mult: 1, when: "nest" }, { level: 35 }, 1],
    ["repeat when caught", { mult: 3, when: "repeat" }, { caughtBefore: true }, 3],
    ["repeat when new", { mult: 3, when: "repeat" }, {}, 1],
    ["level, user higher", { mult: 1, when: "level" }, { userLevel: 11 }, 2],
    ["level, user over twice", { mult: 1, when: "level" }, { userLevel: 21 }, 4],
    ["level, user over four times", { mult: 1, when: "level" }, { userLevel: 41 }, 8],
    ["level, user lower", { mult: 1, when: "level" }, { userLevel: 9 }, 1],
    ["fast on a fast species", { mult: 4, when: "fast" }, { baseSpeed: 100 }, 4],
    ["fast on a slow species", { mult: 4, when: "fast" }, { baseSpeed: 99 }, 1],
    ["moon on a Moon Stone evolver", { mult: 4, when: "moon" }, { moonEvolver: true }, 4],
    ["moon otherwise", { mult: 4, when: "moon" }, {}, 1],
  ] as const)("%s", (_, ball, patch, expected) => {
    expect(ballMultiplier(ball as Ball, { ...ctx, ...patch })).toBe(expected);
  });
});
