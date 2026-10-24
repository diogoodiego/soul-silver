import { describe, expect, it } from "vitest";
import { createRng } from "../../src/game/rng.ts";

const take = (seed: number, n: number) => {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => rng.next());
};

describe("createRng", () => {
  it("repeats the sequence for the same seed", () => {
    expect(take(42, 50)).toEqual(take(42, 50));
  });

  it("differs between seeds", () => {
    expect(take(1, 10)).not.toEqual(take(2, 10));
  });

  it("returns uint32, floats in [0,1) and ints in [0,n)", () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const u = rng.next();
      expect(Number.isInteger(u) && u >= 0 && u <= 0xffffffff).toBe(true);
      const f = rng.nextFloat();
      expect(f >= 0 && f < 1).toBe(true);
      const n = rng.nextInt(6);
      expect(Number.isInteger(n) && n >= 0 && n < 6).toBe(true);
    }
  });
});
