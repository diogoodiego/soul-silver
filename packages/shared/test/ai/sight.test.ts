import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { blocksSight, inCone, lineOfSight } from "../../src/ai/sight.ts";

// Tiles are 16 px; `wall` blocks the tiles it lists as "x,y".
const blocker = (...tiles: string[]) => {
  const set = new Set(tiles);
  return (x: number, y: number) => set.has(`${Math.floor(x / 16)},${Math.floor(y / 16)}`);
};
const at = (tx: number, ty: number) => ({ x: tx * 16 + 8, y: ty * 16 + 8 });

describe("line of sight", () => {
  it("sees across open ground", () => {
    expect(lineOfSight(blocker(), at(0, 0), at(6, 0))).toBe(true);
  });

  it("is cut by a wall between", () => {
    expect(lineOfSight(blocker("3,0"), at(0, 0), at(6, 0))).toBe(false);
  });

  it("checks the tiles a diagonal crosses", () => {
    expect(lineOfSight(blocker("2,2"), at(0, 0), at(5, 5))).toBe(false);
    expect(lineOfSight(blocker("2,4"), at(0, 0), at(5, 5))).toBe(true);
  });

  it("sees within the same tile", () => {
    expect(lineOfSight(blocker("0,0"), { x: 2, y: 2 }, { x: 10, y: 10 })).toBe(true);
  });

  it("blocked tiles and ledges block, water and tall grass do not", () => {
    expect(blocksSight({ category: "blocked", raw: 0 })).toBe(true);
    expect(blocksSight({ category: "ledge", raw: 0, direction: "south" })).toBe(true);
    expect(blocksSight({ category: "water", raw: 0 })).toBe(false);
    expect(blocksSight({ category: "tallGrass", raw: 0 })).toBe(false);
    expect(blocksSight(undefined)).toBe(false);
  });

  it("does not depend on combat (reused by trainer NPCs)", () => {
    const source = readFileSync(new URL("../../src/ai/sight.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/combat/);
  });
});

describe("cone", () => {
  const east = { x: 1, y: 0 };
  it("sees ahead within range and angle", () => {
    expect(inCone({ x: 0, y: 0 }, east, { x: 50, y: 10 }, 80, 90)).toBe(true);
  });
  it("misses behind, past the range or outside the angle", () => {
    expect(inCone({ x: 0, y: 0 }, east, { x: -50, y: 0 }, 80, 90)).toBe(false);
    expect(inCone({ x: 0, y: 0 }, east, { x: 90, y: 0 }, 80, 90)).toBe(false);
    expect(inCone({ x: 0, y: 0 }, east, { x: 30, y: 40 }, 80, 90)).toBe(false);
  });
  it("360° sees all around", () => {
    expect(inCone({ x: 0, y: 0 }, east, { x: -50, y: 0 }, 80, 360)).toBe(true);
  });
});
