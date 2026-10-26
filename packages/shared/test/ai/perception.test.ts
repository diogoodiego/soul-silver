import { describe, expect, it } from "vitest";
import { newSenses, perceive } from "../../src/ai/perception.ts";
import { env, foe, profile, px, self, tickOf, TUNING } from "./fixtures.ts";

const P = profile("rookie", { sightTiles: 8, hearingTiles: 8, memoryS: 2 });
const east = () => newSenses({ x: 1, y: 0 });

describe("perception (US1)", () => {
  it("sees an opponent ahead in the open", () => {
    const s = east();
    const seen = perceive(s, tickOf(0, self({ x: px(0), y: px(0) }), [foe({ x: px(5), y: px(0) })]), P, TUNING, env());
    expect(seen).toEqual([2]);
    expect(s.memory.get(2)).toMatchObject({ x: px(5), y: px(0), tick: 0 });
  });

  it("does not see through a wall (SC-002)", () => {
    const s = east();
    const seen = perceive(s, tickOf(0, self({ x: px(0), y: px(0) }), [foe({ x: px(5), y: px(0) })]), P, TUNING, env(1, ["3,0"]));
    expect(seen).toEqual([]);
    expect(s.memory.size).toBe(0);
  });

  it("does not see behind it", () => {
    const s = east();
    expect(perceive(s, tickOf(0, self({ x: px(10), y: px(0) }), [foe({ x: px(5), y: px(0) })]), P, TUNING, env())).toEqual([]);
  });

  it("hears running but not walking at 5 tiles, and turns toward it without knowing where", () => {
    const behind = foe({ x: px(0), y: px(0) });
    const me = self({ x: px(5), y: px(0) });
    const walk = east();
    perceive(walk, tickOf(0, me, [behind], { noises: [{ sourceId: 2, x: behind.x, y: behind.y, radiusPx: TUNING.noise.walkTiles * 16 }] }), P, TUNING, env());
    expect(walk.look).toEqual({ x: 1, y: 0 });
    const run = east();
    perceive(run, tickOf(0, me, [behind], { noises: [{ sourceId: 2, x: behind.x, y: behind.y, radiusPx: TUNING.noise.runTiles * 16 }] }), P, TUNING, env());
    expect(run.look.x).toBeLessThan(0);
    expect(Math.abs((Math.atan2(run.look.y, -run.look.x) * 180) / Math.PI)).toBeLessThanOrEqual(TUNING.noise.bearingErrorDeg + 1e-6);
    expect(run.memory.size).toBe(0);
  });

  it("remembers the last place for memoryS, then forgets", () => {
    const s = east();
    const me = self({ x: px(0), y: px(0) });
    perceive(s, tickOf(0, me, [foe({ x: px(5), y: px(0) })]), P, TUNING, env());
    // Now behind a wall: still remembered where it was last seen.
    perceive(s, tickOf(20, me, [foe({ x: px(5), y: px(2) })]), P, TUNING, env(1, ["3,0", "3,1", "4,1", "2,1"]));
    expect(s.memory.get(2)).toMatchObject({ x: px(5), y: px(0) });
    perceive(s, tickOf(41, me, [foe({ x: px(5), y: px(2) })]), P, TUNING, env(1, ["3,0", "3,1", "4,1", "2,1"]));
    expect(s.memory.has(2)).toBe(false);
  });

  it("forgets an opponent that left the area", () => {
    const s = east();
    const me = self({ x: px(0), y: px(0) });
    perceive(s, tickOf(0, me, [foe({ x: px(5), y: px(0) })]), P, TUNING, env());
    perceive(s, tickOf(4, me, []), P, TUNING, env());
    expect(s.memory.size).toBe(0);
  });
});
