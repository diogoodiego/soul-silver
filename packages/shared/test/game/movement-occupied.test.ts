import { describe, expect, it } from "vitest";
import type { Entity } from "../../src/game/entity.ts";
import { stepMovement } from "../../src/game/movement.ts";
import type { WorldLookup, WorldMap } from "../../src/game/world-map.ts";

// Spec 021, US1: a tile held by an NPC stops the player like a wall.

const free = { category: "free" as const, raw: 0 };
const field: WorldMap = { id: "a", levels: [{ width: 6, height: 5, tiles: Array.from({ length: 30 }, () => free) }], warps: [], neighbors: [], widthPx: 96, heightPx: 80 };
const world: WorldLookup = (id) => (id === "a" ? field : undefined);
const player = (x: number, y: number): Entity => ({ id: 1, kind: "player", area: "a", x, y, level: 0, facing: "south", data: {} });
const east = { move: { x: 1, y: 0 }, run: false };

describe("stepMovement with occupied tiles", () => {
  const occupied = (tx: number, ty: number) => tx === 3 && ty === 2;

  it("stops the player against an occupied tile", () => {
    let e = player(24, 40);
    for (let i = 0; i < 30; i++) e = stepMovement(e, east, world, occupied);
    expect(e.x).toBeLessThanOrEqual(3 * 16 - 6);
    expect(e.x).toBeGreaterThan(30);
  });

  it("lets the player through once the tile is free", () => {
    let e = player(24, 40);
    for (let i = 0; i < 30; i++) e = stepMovement(e, east, world);
    expect(e.x).toBeGreaterThan(3 * 16 + 6);
  });
});
