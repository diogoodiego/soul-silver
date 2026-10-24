import type { Direction } from "../maps/areas.ts";
import type { CollisionCell } from "../maps/collision.ts";
import { MAP_TILE_PX } from "../maps/constants.ts";
import type { Entity, EntityData } from "./entity.ts";
import { insideMap, neighborAt, tileAt, type WorldLookup } from "./world-map.ts";

// The one movement step, run by the server and replayed by client prediction
// (spec 010 research R7; spec 011 contracts/movement-step.md). Movement is free (continuous
// position, not tile-locked), but only along one of the 4 cardinal directions at a time: the
// input vector's dominant axis picks the direction, the other axis never moves the entity.

/** The part of a map-collision file movement needs. */
export interface CollisionMap {
  width: number;
  height: number;
  /** One cell per tile, row by row. */
  tiles: CollisionCell[];
}

export interface MoveInput {
  /** Each axis in [-1, 1]; only the dominant axis drives movement (no diagonals). */
  move: { x: number; y: number };
  run: boolean;
}

/** Walking pixels per tick at 20 Hz: the original's tile per 16 frames. */
export const MOVE_SPEED_PX = 3;
export const RUN_SPEED_PX = 6;
/** A ledge hop lasts this many ticks, HOP_PX each: from flush against the ledge to clear past it. */
export const HOP_TICKS = 7;
const HOP_PX = 4;
/** Fade out, swap maps half way, fade in: 0.3 s + 0.3 s. */
export const WARP_TICKS = 12;

/** Half side of the square footprint around the feet position. */
const HALF_BOX = 6;
const UNSTICK_RADIUS = 4;

const STEP: Record<Direction, [number, number]> = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };

const tileOf = (px: number) => Math.floor(px / MAP_TILE_PX);
/** Last tile touched by a span ending (exclusive) at px. */
const lastTileOf = (px: number) => Math.ceil(px / MAP_TILE_PX) - 1;

function cellAt(world: WorldLookup, e: Entity, x: number, y: number): CollisionCell | undefined {
  return tileAt(world, e.area, e.level, x, y);
}

const solid = (cell: CollisionCell | undefined) => cell !== undefined && (cell.category === "blocked" || cell.category === "water" || cell.category === "ledge");

interface Blocker {
  cell: CollisionCell;
  /** Tile in the entity's map; past the edge it is a neighbor's tile. */
  tx: number;
  ty: number;
}

/** The solid tiles under the footprint at (x, y). */
function blockers(world: WorldLookup, e: Entity, x: number, y: number): Blocker[] {
  const found: Blocker[] = [];
  for (let ty = tileOf(y - HALF_BOX); ty <= lastTileOf(y + HALF_BOX); ty++) {
    for (let tx = tileOf(x - HALF_BOX); tx <= lastTileOf(x + HALF_BOX); tx++) {
      const cell = cellAt(world, e, tx * MAP_TILE_PX, ty * MAP_TILE_PX);
      if (solid(cell)) found.push({ cell: cell!, tx, ty });
    }
  }
  return found;
}

const center = (t: number) => t * MAP_TILE_PX + MAP_TILE_PX / 2;

function withCounter(data: EntityData, key: "hop" | "warping", value: number): EntityData {
  const next = { ...data };
  if (value > 0) next[key] = value;
  else delete next[key];
  return next;
}

function counter(e: Entity, key: "hop" | "warping"): number {
  const value = e.data[key];
  return typeof value === "number" ? value : 0;
}

/** Moves one axis pixel by pixel; returns where it stopped and what stopped it. */
function slideAxis(world: WorldLookup, e: Entity, x: number, y: number, delta: number, axis: "x" | "y") {
  const steps = Math.ceil(Math.abs(delta));
  const unit = steps === 0 ? 0 : delta / steps;
  for (let i = 0; i < steps; i++) {
    const nx = axis === "x" ? x + unit : x;
    const ny = axis === "y" ? y + unit : y;
    const hit = blockers(world, e, nx, ny);
    if (hit.length > 0) return { x, y, hit };
    x = nx;
    y = ny;
  }
  return { x, y, hit: [] as Blocker[] };
}

/** The dominant cardinal direction of a vector; ties resolve to the vertical axis. */
function dominant(x: number, y: number): Direction {
  if (Math.abs(x) > Math.abs(y)) return x > 0 ? "east" : "west";
  return y > 0 ? "south" : "north";
}

/** Feet position flush against the blocker row/column ahead, or undefined if this is no clean hop. */
function hopStart(world: WorldLookup, e: Entity, x: number, y: number, dir: Direction, hit: Blocker[]): [number, number] | undefined {
  if (hit.length === 0 || !hit.every((b) => b.cell.category === "ledge" && b.cell.direction === dir)) return undefined;
  const [sx, sy] = STEP[dir];
  // The tile edge just ahead of the footprint (the ledge side), then the feet flush against it.
  const ahead = (feet: number, s: number) => (s > 0 ? Math.ceil((feet + HALF_BOX) / MAP_TILE_PX) : Math.floor((feet - HALF_BOX) / MAP_TILE_PX)) * MAP_TILE_PX;
  const fx = sx === 0 ? x : ahead(x, sx) - sx * HALF_BOX;
  const fy = sy === 0 ? y : ahead(y, sy) - sy * HALF_BOX;
  const lx = fx + sx * HOP_PX * HOP_TICKS;
  const ly = fy + sy * HOP_PX * HOP_TICKS;
  return blockers(world, e, lx, ly).length === 0 ? [fx, fy] : undefined;
}

/**
 * Border crossing, level change and warp entry, once the feet have moved from (px, py) and were
 * stopped by `hits`. A warp starts when the feet step onto a warp tile (stairs, gates, mats), when
 * the walk is stopped by a solid warp tile (doors: the feet are drawn into the doorway), or when the
 * walk is stopped while standing on a warp tile (pushing down on a mat).
 */
function afterMove(world: WorldLookup, e: Entity, px: number, py: number, hits: Blocker[] = []): Entity {
  let next = e;
  const map = world(next.area);
  if (map && !insideMap(map, next.x, next.y)) {
    const hit = neighborAt(world, map, next.x, next.y);
    if (hit) next = { ...next, area: hit.map.id, x: hit.x, y: hit.y };
  }
  const feet = cellAt(world, next, next.x, next.y);
  if (feet?.category === "levelTransition" && feet.targetLevel !== undefined) next = { ...next, level: feet.targetLevel };
  const sameTile = next.area === e.area && tileOf(next.x) === tileOf(px) && tileOf(next.y) === tileOf(py);
  const warpTicks = withCounter(next.data, "warping", WARP_TICKS);
  if ((!sameTile || hits.length > 0) && destinationOf(world, next.area, tileOf(next.x), tileOf(next.y))) return { ...next, data: warpTicks };
  if (next.area !== e.area) return next;
  const door = hits.find((b) => destinationOf(world, next.area, b.tx, b.ty));
  if (door) return { ...next, x: center(door.tx), y: center(door.ty), data: warpTicks };
  return next;
}

/** The warp on a tile and the anchor it leads to, when both exist. */
function destinationOf(world: WorldLookup, area: string, tx: number, ty: number) {
  const warp = world(area)?.warps.find((w) => w.tx === tx && w.ty === ty);
  const anchor = warp && world(warp.destMap)?.warps[warp.destAnchor];
  return warp && anchor ? { warp, anchor } : undefined;
}

/**
 * Puts the feet on the destination anchor; on a solid anchor (a door seen from outside) one tile
 * below it, facing away. Stays put if the destination is gone.
 */
function arrive(world: WorldLookup, e: Entity): Entity {
  const dest = destinationOf(world, e.area, tileOf(e.x), tileOf(e.y));
  if (!dest) return e;
  const { warp, anchor } = dest;
  const onAnchor: Entity = { ...e, area: warp.destMap, x: center(anchor.tx), y: center(anchor.ty), level: 0 };
  if (blockers(world, onAnchor, onAnchor.x, onAnchor.y).length === 0) return onAnchor;
  return unstick({ ...onAnchor, y: center(anchor.ty + 1), facing: "south" }, world);
}

/** Moves an entity whose footprint overlaps a solid tile to the nearest free tile center (radius 4 tiles). */
export function unstick(e: Entity, world: WorldLookup): Entity {
  if (blockers(world, e, e.x, e.y).length === 0) return e;
  const tx = tileOf(e.x);
  const ty = tileOf(e.y);
  for (let r = 1; r <= UNSTICK_RADIUS; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = (tx + dx) * MAP_TILE_PX + MAP_TILE_PX / 2;
        const y = (ty + dy) * MAP_TILE_PX + MAP_TILE_PX / 2;
        if (blockers(world, e, x, y).length === 0) return { ...e, x, y };
      }
    }
  }
  return e;
}

/** One tick of movement. Input is ignored while hopping or warping. An unknown map is open ground. */
export function stepMovement(entity: Entity, input: MoveInput | null, world: WorldLookup): Entity {
  const warping = counter(entity, "warping");
  if (warping > 0) {
    const next = { ...entity, data: withCounter(entity.data, "warping", warping - 1) };
    return warping - 1 === WARP_TICKS / 2 ? arrive(world, next) : next;
  }

  const hop = counter(entity, "hop");
  if (hop > 0) {
    const [sx, sy] = STEP[entity.facing];
    const moved = { ...entity, x: entity.x + sx * HOP_PX, y: entity.y + sy * HOP_PX, data: withCounter(entity.data, "hop", hop - 1) };
    return afterMove(world, moved, entity.x, entity.y);
  }

  if (!input) return entity;
  let { x: mx, y: my } = input.move;
  const length = Math.hypot(mx, my);
  if (!(length > 0)) return entity;
  if (length > 1) {
    mx /= length;
    my /= length;
  }
  const speed = input.run ? RUN_SPEED_PX : MOVE_SPEED_PX;
  const dir = dominant(mx, my);
  const [sx, sy] = STEP[dir];
  // Only the dominant axis moves: the other component of the input vector is dropped entirely.
  const amount = (sx !== 0 ? Math.abs(mx) : Math.abs(my)) * speed;
  const axis = sx !== 0 ? "x" : "y";
  const along = slideAxis(world, entity, entity.x, entity.y, (sx !== 0 ? sx : sy) * amount, axis);

  const start = hopStart(world, entity, along.x, along.y, dir, along.hit);
  if (start) return { ...entity, x: start[0], y: start[1], facing: dir, data: withCounter(entity.data, "hop", HOP_TICKS) };
  return afterMove(world, { ...entity, x: along.x, y: along.y, facing: dir }, entity.x, entity.y, along.hit);
}
