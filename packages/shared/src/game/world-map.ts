import { mapCells, mapNeighbors, type Direction } from "../maps/areas.ts";
import { isCounter, type CollisionCell } from "../maps/collision.ts";
import { MAP_TILE_PX, PIECE_TILES } from "../maps/constants.ts";
import type { MapArea } from "../maps/schemas.ts";
import type { CollisionMap } from "./movement.ts";

// A map as the simulation sees it (spec 011, data-model.md): collision per level, warps in map
// tiles and where each neighbor sits. Each map keeps its own pixel space, origin at its top-left.

export interface WorldWarp {
  tx: number;
  ty: number;
  destMap: string;
  /** Index into the destination map's warps. */
  destAnchor: number;
}

export interface WorldNeighbor {
  map: string;
  /** Neighbor origin minus this map's origin, in pixels. */
  dx: number;
  dy: number;
}

export interface WorldMap {
  id: string;
  /** Indexed by level. */
  levels: CollisionMap[];
  warps: WorldWarp[];
  neighbors: WorldNeighbor[];
  widthPx: number;
  heightPx: number;
  /** From the map header (feature 006), when the world was loaded from an extraction. */
  areaType?: "outdoor" | "indoor" | "cave" | undefined;
  /** Map header weather: it marks the caves Flash lights (spec 025). */
  weather?: number | undefined;
  /** Map header permissions (spec 025); undefined without a header, where the area type decides. */
  bikeAllowed?: boolean | undefined;
  flyAllowed?: boolean | undefined;
  /** Where the Pokégear rings (spec 026); absent in older extractions, where every map rings. */
  incomingCalls?: boolean | undefined;
  escapeRopeAllowed?: boolean | undefined;
  mapsec?: number | undefined;
  /** Encounter table id (feature 008); undefined when the map has no wild Pokémon. */
  encounters?: number | undefined;
  /** Matrix tile of this map's top-left, which event and script coordinates count from (spec 020); 0, 0 when absent. */
  origin?: { tx: number; ty: number } | undefined;
}

export type WorldLookup = (mapId: string) => WorldMap | undefined;

const CELL_PX = PIECE_TILES * MAP_TILE_PX;
/** Header 0 fills matrix cells that belong to no real map (sea and borders around Johto). */
const PLACEHOLDER_MAP = 0;
const BLOCKED: CollisionCell = { category: "blocked", raw: 0x8000 };

function origin(area: MapArea, map: number): [number, number] {
  const cells = mapCells(area, map);
  if (cells.length === 0) return [0, 0];
  return [Math.min(...cells.map((c) => c.x)), Math.min(...cells.map((c) => c.z))];
}

/** Warp x/z come from the event file: matrix tiles, which are map tiles on a single-map matrix. */
export function buildWorldMap(
  area: MapArea,
  mapId: number,
  levels: CollisionMap[],
  warps: { x: number; z: number; destMap: number; destAnchor: number }[],
): WorldMap {
  const [ox, oz] = origin(area, mapId);
  const base = levels[0]!;
  return {
    id: String(mapId),
    levels,
    warps: warps.map((w) => ({ tx: w.x - ox * PIECE_TILES, ty: w.z - oz * PIECE_TILES, destMap: String(w.destMap), destAnchor: w.destAnchor })),
    neighbors: [...new Set(mapNeighbors(area, mapId).map((n) => n.map))]
      .filter((n) => n !== PLACEHOLDER_MAP)
      .map((n) => {
        const [nx, nz] = origin(area, n);
        return { map: String(n), dx: (nx - ox) * CELL_PX, dy: (nz - oz) * CELL_PX };
      }),
    widthPx: base.width * MAP_TILE_PX,
    heightPx: base.height * MAP_TILE_PX,
    origin: { tx: ox * PIECE_TILES, ty: oz * PIECE_TILES },
  };
}

export const insideMap = (map: WorldMap, x: number, y: number) => x >= 0 && y >= 0 && x < map.widthPx && y < map.heightPx;

function ownTile(map: WorldMap, level: number, x: number, y: number): CollisionCell {
  const grid = map.levels[level] ?? map.levels[0]!;
  return grid.tiles[Math.floor(y / MAP_TILE_PX) * grid.width + Math.floor(x / MAP_TILE_PX)] ?? BLOCKED;
}

/** The neighbor holding a point of `map`'s pixel space, with the point in its own space. */
export function neighborAt(world: WorldLookup, map: WorldMap, x: number, y: number): { map: WorldMap; x: number; y: number } | undefined {
  for (const n of map.neighbors) {
    const other = world(n.map);
    if (other && insideMap(other, x - n.dx, y - n.dy)) return { map: other, x: x - n.dx, y: y - n.dy };
  }
  return undefined;
}

/** The cell under a pixel of `mapId`; past the edge it comes from the neighbor, or is blocked. Undefined for an unknown map. */
export function tileAt(world: WorldLookup, mapId: string, level: number, x: number, y: number): CollisionCell | undefined {
  const map = world(mapId);
  if (!map) return undefined;
  if (insideMap(map, x, y)) return ownTile(map, level, x, y);
  const hit = neighborAt(world, map, x, y);
  return hit ? ownTile(hit.map, level, hit.x, hit.y) : BLOCKED;
}

const AHEAD: Record<Direction, [number, number]> = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };

/** The tile, in map tiles, a talk reaches: the one ahead, or past a counter as the original does for clerks and nurses. */
export function talkTile(world: WorldLookup, e: { area: string; level: number; x: number; y: number; facing: Direction }): { x: number; y: number } {
  const [dx, dy] = AHEAD[e.facing];
  const x = Math.floor(e.x / MAP_TILE_PX) + dx;
  const y = Math.floor(e.y / MAP_TILE_PX) + dy;
  const counter = isCounter(tileAt(world, e.area, e.level, x * MAP_TILE_PX + MAP_TILE_PX / 2, y * MAP_TILE_PX + MAP_TILE_PX / 2));
  return counter ? { x: x + dx, y: y + dy } : { x, y };
}
