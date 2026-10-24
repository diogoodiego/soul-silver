import { describe, expect, it } from "vitest";
import type { Entity } from "../../src/game/entity.ts";
import { MOVE_SPEED_PX, stepMovement, type CollisionMap } from "../../src/game/movement.ts";
import type { CollisionCell } from "../../src/maps/collision.ts";

const free: CollisionCell = { category: "free", raw: 0 };
const wall: CollisionCell = { category: "blocked", raw: 0x8000 };

// 4 x 3 tiles; wall at column 2, row 1.
const map: CollisionMap = {
  width: 4,
  height: 3,
  tiles: [free, free, free, free, free, free, wall, free, free, free, free, free],
};

const at = (x: number, y: number): Entity => ({ id: 1, kind: "player", area: "a", x, y, facing: "south", data: {} });

describe("stepMovement", () => {
  it("moves a fixed distance per tick and faces the direction", () => {
    const next = stepMovement(at(8, 8), "east", map);
    expect(next).toMatchObject({ x: 8 + MOVE_SPEED_PX, y: 8, facing: "east" });
  });

  it("stays put on a null direction", () => {
    expect(stepMovement(at(8, 8), null, map)).toEqual(at(8, 8));
  });

  it("does not enter a blocked tile", () => {
    // Center of tile (1,1), walking east towards the wall at (2,1).
    let e = at(24, 24);
    for (let i = 0; i < 20; i++) e = stepMovement(e, "east", map);
    expect(e.x).toBeLessThan(32);
    expect(e.facing).toBe("east");
  });

  it("does not leave the map", () => {
    let e = at(8, 8);
    for (let i = 0; i < 20; i++) e = stepMovement(e, "north", map);
    expect(e.y).toBeGreaterThanOrEqual(0);
  });

  it("treats a missing map as open ground", () => {
    expect(stepMovement(at(0, 0), "west", undefined).x).toBe(-MOVE_SPEED_PX);
  });

  it("does not mutate its input", () => {
    const e = at(8, 8);
    stepMovement(e, "east", map);
    expect(e).toEqual(at(8, 8));
  });
});
