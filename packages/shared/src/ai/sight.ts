import type { CollisionCell } from "../maps/collision.ts";
import { MAP_TILE_PX } from "../maps/constants.ts";

// Seeing on the collision grid (spec 019, research R4). Kept free of everything else so the trainer
// NPCs can use it to spot the player.

interface Point {
  x: number;
  y: number;
}

/** Whether the world pixel (x, y) is on a tile that blocks sight. */
export type SightBlocker = (x: number, y: number) => boolean;

/** Walls, trees and ledges block sight; water and tall grass do not. */
export const blocksSight = (cell: CollisionCell | undefined): boolean => cell?.category === "blocked" || cell?.category === "ledge";

/** Whether no blocking tile lies strictly between the tiles of a and b (Amanatides–Woo walk). */
export function lineOfSight(blocks: SightBlocker, a: Point, b: Point): boolean {
  let tx = Math.floor(a.x / MAP_TILE_PX);
  let ty = Math.floor(a.y / MAP_TILE_PX);
  const endX = Math.floor(b.x / MAP_TILE_PX);
  const endY = Math.floor(b.y / MAP_TILE_PX);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const deltaX = stepX === 0 ? Infinity : MAP_TILE_PX / Math.abs(dx);
  const deltaY = stepY === 0 ? Infinity : MAP_TILE_PX / Math.abs(dy);
  let maxX = stepX === 0 ? Infinity : ((stepX > 0 ? (tx + 1) * MAP_TILE_PX - a.x : a.x - tx * MAP_TILE_PX) / Math.abs(dx));
  let maxY = stepY === 0 ? Infinity : ((stepY > 0 ? (ty + 1) * MAP_TILE_PX - a.y : a.y - ty * MAP_TILE_PX) / Math.abs(dy));
  while (tx !== endX || ty !== endY) {
    if (maxX < maxY) {
      tx += stepX;
      maxX += deltaX;
    } else {
      ty += stepY;
      maxY += deltaY;
    }
    if ((tx !== endX || ty !== endY) && blocks(tx * MAP_TILE_PX + MAP_TILE_PX / 2, ty * MAP_TILE_PX + MAP_TILE_PX / 2)) return false;
  }
  return true;
}

/** Whether `to` is within `rangePx` of `from` and within half of `angleDeg` of the unit vector `look`. */
export function inCone(from: Point, look: Point, to: Point, rangePx: number, angleDeg: number): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d > rangePx) return false;
  if (d < 0.001 || angleDeg >= 360) return true;
  return (dx * look.x + dy * look.y) / d >= Math.cos((angleDeg * Math.PI) / 360);
}
