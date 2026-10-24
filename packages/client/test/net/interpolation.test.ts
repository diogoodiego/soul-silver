import { createRng, type Entity } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { createInterpolator } from "../../src/net/interpolation";

const at = (x: number, area = "a"): Entity => ({ id: 7, kind: "player", area, x, y: 0, level: 0, facing: "east", data: {} });

describe("createInterpolator", () => {
  it("renders 100 ms in the past, interpolating linearly", () => {
    const it = createInterpolator();
    it.push(0, 0, [at(0)]);
    it.push(1, 50, [at(10)]);
    it.push(2, 100, [at(20)]);
    expect(it.sample(125)[0]?.x).toBe(5);
    expect(it.sample(150)[0]?.x).toBe(10);
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
        expect(x - prev).toBeLessThanOrEqual(3 * (16 / 50) + 1e-9);
      }
      prev = x;
    }
    expect(prev).toBeGreaterThan(250);
  });
});
