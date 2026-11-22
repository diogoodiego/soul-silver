import { createRng, type Entity } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { createInterpolator } from "../../src/net/interpolation";

const at = (x: number, area = "a"): Entity => ({ id: 7, kind: "player", area, x, y: 0, level: 0, facing: "east", data: {} });

describe("createInterpolator", () => {
  it("starts 100 ms in the past, interpolating linearly", () => {
    const it = createInterpolator();
    it.push(0, 0, [at(0)]);
    it.push(1, 50, [at(10)]);
    it.push(2, 100, [at(20)]);
    expect(it.sample(125)[0]?.x).toBe(5);
    expect(it.sample(125)[0]?.x).toBe(5);
    // The states came on time: it starts to catch up, a tenth faster.
    expect(it.sample(150)[0]?.x).toBeCloseTo(10.5);
  });

  /** How late it shows things after `ticks` states, each arriving `late(tick)` ms after its time. */
  function lateness(ticks: number, late: (tick: number) => number) {
    const it = createInterpolator();
    for (let tick = 0; tick < ticks; tick++) {
      it.push(tick, tick * 50 + late(tick), [at(tick * 50)]);
      it.sample(tick * 50 + late(tick));
    }
    const now = (ticks - 1) * 50 + late(ticks - 1);
    return now - it.sample(now)[0]!.x;
  }

  it("settles one tick in the past when states arrive steadily", () => {
    expect(lateness(60, () => 7)).toBeCloseTo(57, 0);
  });

  it("stays as far back as the latest arrivals need, and no farther than 150 ms", () => {
    expect(lateness(60, (tick) => (tick % 3 === 0 ? 30 : 0))).toBeCloseTo(80, 0);
    expect(lateness(200, (tick) => (tick % 3 === 0 ? 400 : 0))).toBeLessThanOrEqual(150.5);
  });

  it("moves forward again after a late start, with no drift between the clocks", () => {
    expect(lateness(200, (tick) => (tick === 0 ? 90 : 0))).toBeCloseTo(50, 0);
    expect(lateness(400, (tick) => tick * 0.1)).toBeLessThan(40 + 60);
  });

  it("holds the last position when no newer data arrives", () => {
    const it = createInterpolator();
    it.push(0, 0, [at(0)]);
    it.push(1, 50, [at(10)]);
    expect(it.sample(1000)[0]?.x).toBe(10);
  });

  it("drops entities missing from the latest state", () => {
    const it = createInterpolator();
    it.push(0, 0, [at(0)]);
    it.push(1, 50, []);
    expect(it.sample(200)).toEqual([]);
  });

  it("flies a removed move projectile to its last position before dropping it", () => {
    const it = createInterpolator();
    const shot = (x: number): Entity => ({ ...at(x), kind: "projectile", data: { move: 1 } });
    it.push(0, 0, [shot(0)]);
    it.push(1, 50, [shot(10)]);
    it.push(2, 100, []);
    expect(it.sample(125)[0]?.x).toBe(5);
    expect(it.sample(160)).toEqual([]);
    expect(it.sample(200)).toEqual([]);
  });

  it("goes on smoothly from the last tick after a pause", () => {
    const it = createInterpolator();
    for (let tick = 0; tick <= 10; tick++) it.push(tick, tick * 50, [at(tick * 10)]);
    for (let now = 550; now < 60_000; now += 50) {
      it.push(10, now, [at(100)]);
      it.sample(now);
    }
    expect(it.sample(59_990)[0]?.x).toBe(100);
    it.push(11, 60_000, [at(110)]);
    expect(it.sample(60_000)[0]?.x).toBeCloseTo(100, 0);
    const x = it.sample(60_025)[0]!.x;
    expect(x).toBeGreaterThan(102);
    expect(x).toBeLessThan(108);
  });

  it("does not slide across an area change", () => {
    const it = createInterpolator();
    it.push(0, 0, [at(0, "a")]);
    it.push(1, 50, [at(100, "b")]);
    expect([0, 100]).toContain(it.sample(125)[0]?.x);
  });

  it("moves continuously with ±30 ms arrival jitter", () => {
    const it = createInterpolator();
    const rng = createRng(3);
    const arrivals = Array.from({ length: 100 }, (_, tick) => ({ tick, at: tick * 50 + 30 + (rng.nextFloat() * 60 - 30) }));
    let prev: number | undefined;
    let pushed = 0;
    for (let now = 0; now < 5000; now += 16) {
      while (pushed < arrivals.length && arrivals[pushed]!.at <= now) {
        it.push(arrivals[pushed]!.tick, arrivals[pushed]!.at, [at(arrivals[pushed]!.tick * 3)]);
        pushed++;
      }
      const x = it.sample(now)[0]?.x;
      if (x === undefined) continue;
      if (prev !== undefined) {
        expect(x).toBeGreaterThanOrEqual(prev);
        // It catches up at most a tenth faster.
        expect(x - prev).toBeLessThanOrEqual(1.15 * 3 * (16 / 50));
      }
      prev = x;
    }
    expect(prev).toBeGreaterThan(250);
  });
});
