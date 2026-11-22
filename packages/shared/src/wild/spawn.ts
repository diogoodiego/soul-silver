import type { EncounterSlot } from "../events/schemas.ts";
import type { Rng } from "../game/rng.ts";
import type { WorldMap } from "../game/world-map.ts";
import { MAP_TILE_PX } from "../maps/constants.ts";
import type { SpawnRules } from "./schemas.ts";

// What spawns and where (spec 015, research R1–R3, R5). Pure: every roll comes from the rng passed in.

export interface Cell {
  x: number;
  y: number;
}

/** A slot by its chance; the chances of a table add up to 100, as in the original. */
export function rollSlot(slots: readonly EncounterSlot[], rng: Rng): EncounterSlot {
  let roll = rng.nextInt(slots.reduce((sum, s) => sum + s.chance, 0));
  for (const s of slots) {
    roll -= s.chance;
    if (roll < 0) return s;
  }
  return slots.at(-1)!;
}

export const rollLevel = (slot: EncounterSlot, rng: Rng): number => slot.minLevel + rng.nextInt(slot.maxLevel - slot.minLevel + 1);

export const rollShiny = (odds: number, rng: Rng): boolean => rng.nextInt(odds) === 0;

/** Tall grass; in a cave, every free cell (the collision grid has no cave floor category). */
export function zoneCells(map: WorldMap): Cell[] {
  const grid = map.levels[0];
  if (!grid) return [];
  const wanted = map.areaType === "cave" ? "free" : "tallGrass";
  const cells: Cell[] = [];
  grid.tiles.forEach((t, i) => {
    if (t.category === wanted) cells.push({ x: i % grid.width, y: Math.floor(i / grid.width) });
  });
  return cells;
}

/** The closest cells one can reach from `from` through open ones, at most `count`; never `from` itself. */
export function cellsAround(from: Cell, count: number, open: (c: Cell) => boolean): Cell[] {
  const queue = [from];
  const seen = new Set([`${from.x},${from.y}`]);
  for (let i = 0; i < queue.length && queue.length <= count; i++) {
    const { x, y } = queue[i]!;
    for (const c of [{ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 }]) {
      if (seen.has(`${c.x},${c.y}`) || !open(c)) continue;
      seen.add(`${c.x},${c.y}`);
      queue.push(c);
    }
  }
  return queue.slice(1, count + 1);
}

/** A random zone cell outside every player's screen plus the margin; undefined after maxTries misses. */
export function pickCell(
  cells: readonly Cell[],
  players: readonly { x: number; y: number }[],
  rules: Pick<SpawnRules, "viewHalfTiles" | "viewMarginTiles" | "maxTries">,
  rng: Rng,
): Cell | undefined {
  if (cells.length === 0) return undefined;
  const reachX = (rules.viewHalfTiles.x + rules.viewMarginTiles) * MAP_TILE_PX;
  const reachY = (rules.viewHalfTiles.y + rules.viewMarginTiles) * MAP_TILE_PX;
  for (let i = 0; i < rules.maxTries; i++) {
    const c = cells[rng.nextInt(cells.length)]!;
    const cx = c.x * MAP_TILE_PX + MAP_TILE_PX / 2;
    const cy = c.y * MAP_TILE_PX + MAP_TILE_PX / 2;
    if (players.every((p) => Math.abs(cx - p.x) > reachX || Math.abs(cy - p.y) > reachY)) return c;
  }
  return undefined;
}
