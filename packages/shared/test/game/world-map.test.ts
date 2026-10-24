import { describe, expect, it } from "vitest";
import type { CollisionMap } from "../../src/game/movement.ts";
import { buildWorldMap, tileAt, type WorldMap } from "../../src/game/world-map.ts";
import type { CollisionCell } from "../../src/maps/collision.ts";
import type { MapArea } from "../../src/maps/schemas.ts";

const free: CollisionCell = { category: "free", raw: 0 };
const water: CollisionCell = { category: "water", raw: 0x10 };

const grid = (width: number, height: number, cell: CollisionCell): CollisionMap => ({ width, height, tiles: Array<CollisionCell>(width * height).fill(cell) });

// One row of three cells: map 10 spans the first two, map 11 the third.
const area: MapArea = { id: 0, name: "test", width: 3, height: 1, pieces: [0, 1, 2], heights: null, maps: [10, 10, 11] };

const west = buildWorldMap(area, 10, [grid(64, 32, free)], [{ x: 5, z: 3, destMap: 11, destAnchor: 0 }]);
const east = buildWorldMap(area, 11, [grid(32, 32, water)], [{ x: 70, z: 4, destMap: 10, destAnchor: 0 }]);
const maps = new Map<string, WorldMap>([
  ["10", west],
  ["11", east],
]);
const world = (id: string) => maps.get(id);

describe("buildWorldMap", () => {
  it("sizes the map from its collision grid", () => {
    expect(west).toMatchObject({ id: "10", widthPx: 64 * 16, heightPx: 32 * 16 });
  });

  it("places neighbors by matrix cell, in pixels", () => {
    expect(west.neighbors).toEqual([{ map: "11", dx: 2 * 32 * 16, dy: 0 }]);
    expect(east.neighbors).toEqual([{ map: "10", dx: -2 * 32 * 16, dy: 0 }]);
  });

  it("ignores the placeholder map 0 and lists each neighbor once", () => {
    // Map 0 fills matrix cells that belong to no map; map 7 touches map 12 on two sides.
    const matrix: MapArea = { id: 0, name: "m", width: 3, height: 3, pieces: Array(9).fill(0), heights: null, maps: [0, 7, 7, 12, 12, 7, 0, 0, 0] };
    const map = buildWorldMap(matrix, 12, [grid(64, 64, free)], []);
    expect(map.neighbors).toEqual([{ map: "7", dx: 32 * 16, dy: -32 * 16 }]);
  });

  it("turns matrix warp coordinates into map tiles", () => {
    expect(west.warps).toEqual([{ tx: 5, ty: 3, destMap: "11", destAnchor: 0 }]);
    expect(east.warps).toEqual([{ tx: 6, ty: 4, destMap: "10", destAnchor: 0 }]);
  });

  it("keeps local warp coordinates on a single-map matrix", () => {
    const indoor = buildWorldMap({ ...area, width: 1, pieces: [0], maps: null }, 61, [grid(32, 32, free)], [{ x: 4, z: 14, destMap: 60, destAnchor: 0 }]);
    expect(indoor.warps).toEqual([{ tx: 4, ty: 14, destMap: "60", destAnchor: 0 }]);
    expect(indoor.neighbors).toEqual([]);
  });
});

describe("tileAt", () => {
  it("reads the map's own tile", () => {
    expect(tileAt(world, "10", 0, 8, 8)).toBe(free);
  });

  it("reads past the edge from the neighbor", () => {
    expect(tileAt(world, "10", 0, 64 * 16 + 8, 8)).toBe(water);
    expect(tileAt(world, "11", 0, -8, 8)).toBe(free);
  });

  it("is blocked past an edge with no neighbor", () => {
    expect(tileAt(world, "10", 0, -1, 8)?.category).toBe("blocked");
    expect(tileAt(world, "10", 0, 8, -1)?.category).toBe("blocked");
    expect(tileAt(world, "11", 0, 32 * 16, 8)?.category).toBe("blocked");
  });

  it("is blocked when a neighbor is listed but not loaded", () => {
    expect(tileAt((id) => (id === "10" ? west : undefined), "10", 0, 64 * 16 + 8, 8)?.category).toBe("blocked");
  });

  it("is undefined for an unknown map (open ground)", () => {
    expect(tileAt(world, "99", 0, 8, 8)).toBeUndefined();
  });

  it("falls back to level 0 when the level is missing", () => {
    expect(tileAt(world, "10", 3, 8, 8)).toBe(free);
  });
});
