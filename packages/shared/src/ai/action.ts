import { segmentHits } from "../combat/hitbox.ts";
import type { Rng } from "../game/rng.ts";
import { reachPx } from "./scoring.ts";
import type { CastView, MoveView, Point } from "./view.ts";

// The action layer (spec 019, research R9): where to stand, where to aim, how to step. Everything
// ends up as a stick vector and an aim, like a player's input.

const CONTACT = new Set(["melee", "self-area", "dash"]);
const TICKS_PER_S = 20;

const unit = (p: Point): Point => {
  const d = Math.hypot(p.x, p.y);
  return d < 1e-6 ? { x: 0, y: 0 } : { x: p.x / d, y: p.y / d };
};
export const rotate = (d: Point, deg: number): Point => {
  const r = (deg * Math.PI) / 180;
  return { x: d.x * Math.cos(r) - d.y * Math.sin(r), y: d.x * Math.sin(r) + d.y * Math.cos(r) };
};

/** Distance to keep from the target: close for contact movesets, at range (and strafing) otherwise. */
export function preferredRange(moves: readonly MoveView[]): { px: number; ranged: boolean } {
  const hitting = moves.filter((m) => m.damages);
  const contact = hitting.filter((m) => CONTACT.has(m.behavior));
  const ranged = contact.length * 2 < hitting.length;
  const pool = ranged ? hitting.filter((m) => !CONTACT.has(m.behavior)) : contact;
  if (pool.length === 0) return { px: 24, ranged: false };
  return { px: ranged ? 0.8 * Math.min(...pool.map(reachPx)) : 0.7 * Math.min(...pool.map(reachPx)), ranged };
}

/**
 * Aim at `target` moving at `velocity` (px per tick): lead by `lead` (0–1) of the shot's travel time,
 * then miss by up to `errorDeg`.
 */
export function aimAt(from: Point, target: Point, velocity: Point, lead: number, shotSpeedPx: number, errorDeg: number, rng: Rng): Point {
  const d = Math.hypot(target.x - from.x, target.y - from.y);
  const ticks = shotSpeedPx > 0 ? (d / shotSpeedPx) * TICKS_PER_S * lead : 0;
  const dir = unit({ x: target.x + velocity.x * ticks - from.x, y: target.y + velocity.y * ticks - from.y });
  return rotate(dir, (rng.nextFloat() * 2 - 1) * errorDeg);
}

/** A stick vector snapped to the 8 directions of a keyboard. */
export function eightWay(v: Point): Point {
  if (Math.hypot(v.x, v.y) < 1e-6) return { x: 0, y: 0 };
  const a = Math.round(Math.atan2(v.y, v.x) / (Math.PI / 4)) * (Math.PI / 4);
  const x = Math.cos(a);
  const y = Math.sin(a);
  return { x: Math.abs(x) < 1e-9 ? 0 : x, y: Math.abs(y) < 1e-9 ? 0 : y };
}

/** The 8-way step closest to `dir` whose point `stepPx` ahead is walkable; undefined when boxed in. */
export function steer(from: Point, dir: Point, stepPx: number, walkable: (p: Point) => boolean): Point | undefined {
  const base = eightWay(dir);
  if (base.x === 0 && base.y === 0) return base;
  for (const turn of [0, 45, -45, 90, -90]) {
    const d = eightWay(rotate(base, turn));
    if (walkable({ x: from.x + d.x * stepPx, y: from.y + d.y * stepPx })) return d;
  }
  return undefined;
}

/** Whether a cast from `caster`, facing its direction, would reach `me` (a body of radius `bodyPx`). */
export function threatened(me: Point, caster: Point & { cast: CastView }, bodyPx: number): boolean {
  const end = { x: caster.x + caster.cast.dir.x * caster.cast.reachPx, y: caster.y + caster.cast.dir.y * caster.cast.reachPx };
  return segmentHits(caster, end, bodyPx, { x: me.x, y: me.y, r: bodyPx });
}
