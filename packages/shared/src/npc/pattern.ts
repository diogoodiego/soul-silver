import { createRng } from "../game/rng.ts";
import { MAP_TILE_PX } from "../maps/index.ts";
import type { Direction } from "../maps/areas.ts";
import type { NpcState, Pattern } from "./types.ts";

/** Pixels per tick of a walking NPC: the player's walking speed (3 px per 50 ms tick). */
export const NPC_WALK_PX = 3;

const ALL: readonly Direction[] = ["north", "south", "east", "west"];
const STEP: Record<Direction, [number, number]> = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };

/**
 * The pattern of a map object from its extracted `movement` code and ranges (research.md, "Confirmado").
 * shortcut: the 4-13 codes all look in four directions and ranged codes all wander; refine from side-by-side checks.
 */
export function patternFor(movement: number, xRange: number, yRange: number, unknown?: (movement: number) => void): Pattern {
  const ranged = xRange > 0 || yRange > 0;
  if (movement === 0 || (movement >= 14 && movement <= 19)) return { kind: "still" };
  if (movement === 2 || (movement >= 4 && movement <= 13)) return { kind: "look", directions: ALL };
  if (movement === 3) return { kind: "wander", xRange, yRange };
  if (movement === 20) {
    if (xRange > 0) return { kind: "path", steps: [{ dir: "east", count: xRange }, { dir: "west", count: xRange }] };
    if (yRange > 0) return { kind: "path", steps: [{ dir: "south", count: yRange }, { dir: "north", count: yRange }] };
    return { kind: "still" };
  }
  if ((movement >= 38 && movement <= 46) || movement === 53) return ranged ? { kind: "wander", xRange, yRange } : { kind: "still" };
  unknown?.(movement);
  return { kind: "still" };
}

export interface NpcInit {
  person: number;
  pattern: Pattern;
  tx: number;
  ty: number;
  facing: Direction;
  seed: number;
}

export function createNpc(init: NpcInit): NpcState {
  const rng = createRng(init.seed);
  return {
    person: init.person,
    pattern: init.pattern,
    originTx: init.tx,
    originTy: init.ty,
    x: init.tx * MAP_TILE_PX + MAP_TILE_PX / 2,
    y: init.ty * MAP_TILE_PX + MAP_TILE_PX / 2,
    facing: init.facing,
    timer: 10 + rng.nextInt(40),
    pathStep: 0,
    pathDone: 0,
    rng,
  };
}

/** Tile an NPC is on, or heading to while it walks. */
export function npcTile(s: NpcState): { tx: number; ty: number } {
  const [dx, dy] = s.moving ? STEP[s.moving.dir] : [0, 0];
  return { tx: Math.floor(s.x / MAP_TILE_PX) + (s.moving ? dx : 0), ty: Math.floor(s.y / MAP_TILE_PX) + (s.moving ? dy : 0) };
}

function walk(s: NpcState, dir: Direction): void {
  s.facing = dir;
  s.moving = { dir, left: MAP_TILE_PX };
}

/** Advances one 20 Hz tick. `free` says whether an NPC may step onto a tile (the world, other NPCs and players). */
export function stepNpc(s: NpcState, free: (tx: number, ty: number) => boolean): void {
  if (s.moving) {
    const px = Math.min(NPC_WALK_PX, s.moving.left);
    const [dx, dy] = STEP[s.moving.dir];
    s.x += dx * px;
    s.y += dy * px;
    s.moving.left -= px;
    if (s.moving.left <= 0) {
      s.moving = undefined;
      s.timer = 10 + s.rng.nextInt(40);
    }
    return;
  }
  if (s.timer > 0) {
    s.timer--;
    return;
  }
  const tx = Math.floor(s.x / MAP_TILE_PX);
  const ty = Math.floor(s.y / MAP_TILE_PX);
  const p = s.pattern;
  switch (p.kind) {
    case "still":
      return;
    case "look":
      s.facing = p.directions[s.rng.nextInt(p.directions.length)]!;
      s.timer = 20 + s.rng.nextInt(60);
      return;
    case "wander": {
      const dir = ALL[s.rng.nextInt(ALL.length)]!;
      const [dx, dy] = STEP[dir];
      const nx = tx + dx;
      const ny = ty + dy;
      const inside = Math.abs(nx - s.originTx) <= p.xRange && Math.abs(ny - s.originTy) <= p.yRange;
      if (inside && free(nx, ny)) walk(s, dir);
      else {
        s.facing = dir;
        s.timer = 10 + s.rng.nextInt(40);
      }
      return;
    }
    case "path": {
      const step = p.steps[s.pathStep]!;
      const [dx, dy] = STEP[step.dir];
      if (!free(tx + dx, ty + dy)) {
        s.facing = step.dir;
        s.timer = 10;
        return;
      }
      walk(s, step.dir);
      if (++s.pathDone >= step.count) {
        s.pathStep = (s.pathStep + 1) % p.steps.length;
        s.pathDone = 0;
      }
    }
  }
}
