import { describe, expect, it } from "vitest";
import { mapCells, mapNeighbors } from "../../src/maps/areas.ts";
import type { MapArea } from "../../src/maps/schemas.ts";

// 3 x 2 matrix:   7 7 8
//                 9 _ 8      (_ = empty cell)
const area: MapArea = {
  id: 0,
  name: "map",
  width: 3,
  height: 2,
  pieces: [10, 11, 12, 13, null, 15],
  heights: [0, 0, 0, 0, 0, 0],
  maps: [7, 7, 8, 9, null, 8],
};

describe("mapCells", () => {
  it("lists the cells of a map with their pieces, skipping empty cells", () => {
    expect(mapCells(area, 7)).toEqual([{ x: 0, z: 0, piece: 10, height: 0 }, { x: 1, z: 0, piece: 11, height: 0 }]);
    expect(mapCells(area, 8)).toEqual([{ x: 2, z: 0, piece: 12, height: 0 }, { x: 2, z: 1, piece: 15, height: 0 }]);
  });

  it("takes every non-empty cell when the matrix is a single map", () => {
    expect(mapCells({ ...area, maps: null, heights: null }, 3).map((c) => c.piece)).toEqual([10, 11, 12, 13, 15]);
  });
});

describe("mapNeighbors", () => {
  it("lists each adjacent map once per direction", () => {
    expect(mapNeighbors(area, 7)).toEqual([{ direction: "east", map: 8 }, { direction: "south", map: 9 }]);
    expect(mapNeighbors(area, 8)).toEqual([{ direction: "west", map: 7 }]);
    expect(mapNeighbors(area, 9)).toEqual([{ direction: "north", map: 7 }]);
  });

  it("has no neighbors in a single-map matrix", () => {
    expect(mapNeighbors({ ...area, maps: null }, 3)).toEqual([]);
  });
});
