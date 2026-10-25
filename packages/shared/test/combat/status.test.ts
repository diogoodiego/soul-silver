import { describe, expect, it } from "vitest";
import { canApply, startStatus, tickStatus, type StatusState } from "../../src/combat/status.ts";
import type { StatusRecord } from "../../src/combat/schemas.ts";
import { createRng } from "../../src/game/rng.ts";

const burn: StatusRecord = { id: "burn", major: true, durationS: { min: 8, max: 8 }, intervalS: 2, tickDamage: 0.125, attackMul: 0.5, immuneTypes: [10] };
const toxic: StatusRecord = { id: "toxic", major: true, durationS: { min: 12, max: 12 }, intervalS: 2, tickDamage: 1 / 16, toxic: true, immuneTypes: [3, 8] };
const sleep: StatusRecord = { id: "sleep", major: true, durationS: { min: 2, max: 5 }, immobile: true, immuneTypes: [] };
const freeze: StatusRecord = { id: "freeze", major: true, durationS: { min: 10, max: 10 }, intervalS: 1, thaw: 20, immobile: true, immuneTypes: [15] };
const confusion: StatusRecord = { id: "confusion", major: false, durationS: { min: 3, max: 6 }, misdirect: 50, deviationDeg: 90, immuneTypes: [] };

function run(def: StatusRecord, state: StatusState, until: number, maxHp: number) {
  const rng = createRng(1);
  const damage: number[] = [];
  let ended = -1;
  for (let tick = state.startTick + 1; tick <= until && ended < 0; tick++) {
    const r = tickStatus(def, state, tick, maxHp, rng);
    if (r.damage) damage.push(r.damage);
    if (r.ended) ended = tick;
  }
  return { damage, ended };
}

describe("canApply", () => {
  it("allows one major status at a time, and confusion beside it", () => {
    expect(canApply(burn, [0], { major: undefined, confused: false })).toBe(true);
    expect(canApply(sleep, [0], { major: "burn", confused: false })).toBe(false);
    expect(canApply(confusion, [0], { major: "burn", confused: false })).toBe(true);
    expect(canApply(confusion, [0], { major: undefined, confused: true })).toBe(false);
  });

  it("respects type immunities", () => {
    expect(canApply(burn, [10, 2], { major: undefined, confused: false })).toBe(false);
    expect(canApply(toxic, [12, 3], { major: undefined, confused: false })).toBe(false);
  });
});

describe("tickStatus", () => {
  it("burn deals 1/8 each interval and ends after its duration (in ticks)", () => {
    const state = startStatus(burn, 0, createRng(1));
    expect(state.untilTick).toBe(160);
    expect(run(burn, state, 400, 80)).toEqual({ damage: [10, 10, 10, 10], ended: 160 });
  });

  it("toxic grows by 1/16 each interval", () => {
    const state = startStatus(toxic, 0, createRng(1));
    expect(run(toxic, state, 400, 160).damage).toEqual([10, 20, 30, 40, 50, 60]);
  });

  it("tick damage is at least 1", () => {
    expect(run(burn, startStatus(burn, 0, createRng(1)), 400, 5).damage).toEqual([1, 1, 1, 1]);
  });

  it("sleep lasts a random time between min and max", () => {
    const lengths = new Set(Array.from({ length: 200 }, (_, i) => startStatus(sleep, 0, createRng(i)).untilTick));
    expect(Math.min(...lengths)).toBe(40);
    expect(Math.max(...lengths)).toBe(100);
  });

  it("freeze can thaw early on an interval, never later than its max", () => {
    const { ended } = run(freeze, startStatus(freeze, 0, createRng(1)), 400, 50);
    expect(ended).toBeGreaterThan(0);
    expect(ended % 20 === 0 || ended === 200).toBe(true);
    expect(ended).toBeLessThanOrEqual(200);
  });
});
