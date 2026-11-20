import type { Point } from "./hitbox.ts";
import type { Behavior, Hitbox } from "./schemas.ts";

/**
 * Block H: the ground a move covers while it is cast, as clients draw it. Offsets are from the user, in world px.
 * circle: `size` is the radius; arc: radius and `span` degrees around the aim; rect: `size` long from the
 * origin along the aim, `span` wide; aura: no area (self-buff), only a glow on the user.
 */
export interface Telegraph {
  shape: "circle" | "arc" | "rect" | "aura";
  ox: number;
  oy: number;
  size: number;
  span: number;
}

export function telegraph(move: { behavior: Behavior; rangePx: number; hitbox: Hitbox | undefined }, dir: Point): Telegraph {
  const { hitbox } = move;
  if (!hitbox) return { shape: "aura", ox: 0, oy: 0, size: 0, span: 0 };
  if (hitbox.shape === "arc") return { shape: "arc", ox: 0, oy: 0, size: hitbox.radiusPx, span: hitbox.angleDeg };
  if (hitbox.shape === "capsule") return { shape: "rect", ox: 0, oy: 0, size: hitbox.lengthPx, span: hitbox.widthPx };
  const r = hitbox.radiusPx;
  // A travelling hitbox sweeps its range; it reaches one radius further on each end.
  if (move.behavior === "projectile" || move.behavior === "dash") return { shape: "rect", ox: 0, oy: 0, size: move.rangePx + 2 * r, span: 2 * r };
  const ahead = move.behavior === "target-area" || move.behavior === "field" ? move.rangePx : 0;
  return { shape: "circle", ox: dir.x * ahead, oy: dir.y * ahead, size: r, span: 0 };
}
