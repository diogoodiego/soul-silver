import type { Direction } from "../maps/areas.ts";
import type { CollisionCell } from "../maps/collision.ts";
import { MAP_TILE_PX } from "../maps/constants.ts";
import type { Entity } from "./entity.ts";

// The one movement step, run by the server and replayed by client prediction (spec 010, research R7).

/** The part of a map-collision file movement needs. */
export interface CollisionMap {
  width: number;
  height: number;
  /** One cell per tile, row by row. */
  tiles: CollisionCell[];
}

/** Pixels per tick at 20 Hz (about a tile every 5 ticks). */
export const MOVE_SPEED_PX = 3;

/** Half side of the square footprint around the feet position. */
const HALF_BOX = 6;

const STEP: Record<Direction, [number, number]> = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };

// shortcut: ledges, ladders and level transitions are walkable like free ground; real rules come with the world specs.
function solidTile(map: CollisionMap, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return true;
  const category = map.tiles[ty * map.width + tx]?.category;
  return category === "blocked" || category === "water";
}

function collides(map: CollisionMap, x: number, y: number): boolean {
  const left = Math.floor((x - HALF_BOX) / MAP_TILE_PX);
  const right = Math.floor((x + HALF_BOX - 1) / MAP_TILE_PX);
  const top = Math.floor((y - HALF_BOX) / MAP_TILE_PX);
  const bottom = Math.floor((y + HALF_BOX - 1) / MAP_TILE_PX);
  for (let ty = top; ty <= bottom; ty++) {
    for (let tx = left; tx <= right; tx++) {
      if (solidTile(map, tx, ty)) return true;
    }
  }
  return false;
}

/** Moves one tick in `dir`, stopping flush against solid tiles. A missing map is open ground. */
export function stepMovement(entity: Entity, dir: Direction | null, map: CollisionMap | undefined): Entity {
  if (dir === null) return entity;
  const [dx, dy] = STEP[dir];
  let { x, y } = entity;
  for (let i = 0; i < MOVE_SPEED_PX; i++) {
    if (map && collides(map, x + dx, y + dy)) break;
    x += dx;
    y += dy;
  }
  return { ...entity, x, y, facing: dir };
}
