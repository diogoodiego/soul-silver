import type { MapArea } from "./schemas.ts";

// A map's place in its area matrix: its cells and the maps around it. A matrix holds many
// maps (the main one is all of Johto), so neighbors come from the per-cell map grid.

export interface AreaCell {
  /** Cell position in the matrix. */
  x: number;
  z: number;
  piece: number;
  /** Cell height from the matrix; 0 when the matrix has none. */
  height: number;
}

export type Direction = "north" | "south" | "east" | "west";

export interface MapNeighbor {
  direction: Direction;
  map: number;
}

const belongs = (area: MapArea, cell: number, map: number) => area.maps === null || area.maps[cell] === map;

/** The non-empty cells of a map; every non-empty cell when the matrix is a single map. */
export function mapCells(area: MapArea, map: number): AreaCell[] {
  const cells: AreaCell[] = [];
  area.pieces.forEach((piece, i) => {
    if (piece === null || !belongs(area, i, map)) return;
    cells.push({ x: i % area.width, z: Math.floor(i / area.width), piece, height: area.heights?.[i] ?? 0 });
  });
  return cells;
}

const STEPS: [Direction, number, number][] = [["north", 0, -1], ["south", 0, 1], ["east", 1, 0], ["west", -1, 0]];

/** Other maps sharing a cell edge with this one, once per direction, sorted. */
export function mapNeighbors(area: MapArea, map: number): MapNeighbor[] {
  if (area.maps === null) return [];
  const found = new Map<string, MapNeighbor>();
  for (const cell of mapCells(area, map)) {
    for (const [direction, dx, dz] of STEPS) {
      const [x, z] = [cell.x + dx, cell.z + dz];
      if (x < 0 || z < 0 || x >= area.width || z >= area.height) continue;
      const other = area.maps[z * area.width + x];
      if (other === null || other === undefined || other === map) continue;
      found.set(`${direction}:${other}`, { direction, map: other });
    }
  }
  return [...found.values()].sort((a, b) => a.direction.localeCompare(b.direction) || a.map - b.map);
}
