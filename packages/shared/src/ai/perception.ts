import { rotate } from "./action.ts";
import type { AiTuning, SkillProfile } from "./schemas.ts";
import { inCone } from "./sight.ts";
import type { AiEnv, AiTick, Point } from "./view.ts";

// Perception (spec 019, research R4–R5): a cone of sight cut by walls, hearing that only turns the
// head, and a short memory of where each opponent was last seen.

const TILE = 16;
const TICKS_PER_S = 20;

export interface Memory extends Point {
  tick: number;
  /** Seen movement, px per tick. */
  velocity: Point;
}

export interface Senses {
  /** Unit vector the AI looks along. */
  look: Point;
  memory: Map<number, Memory>;
  /** Ids seen on the last perception. */
  visible: Set<number>;
}

export const newSenses = (look: Point): Senses => ({ look, memory: new Map(), visible: new Set() });

export function remember(s: Senses, id: number, p: Point, tick: number): void {
  const prev = s.memory.get(id);
  const dt = prev ? tick - prev.tick : 0;
  const velocity = prev && dt > 0 ? { x: (p.x - prev.x) / dt, y: (p.y - prev.y) / dt } : { x: 0, y: 0 };
  s.memory.set(id, { x: p.x, y: p.y, tick, velocity });
}

/** One look around; returns the ids it sees. */
export function perceive(s: Senses, t: AiTick, profile: SkillProfile, tuning: AiTuning, env: AiEnv): number[] {
  const me = t.self;
  const present = new Set(t.opponents.map((o) => o.id));
  for (const id of s.memory.keys()) if (!present.has(id)) s.memory.delete(id);
  const seen: number[] = [];
  for (const o of t.opponents) {
    if (inCone(me, s.look, o, profile.sightTiles * TILE, profile.sightAngleDeg) && env.sees(me, o)) {
      seen.push(o.id);
      remember(s, o.id, o, t.tick);
    }
  }
  s.visible = new Set(seen);
  const hearing = profile.hearingTiles * TILE;
  for (const n of t.noises) {
    const d = Math.hypot(n.x - me.x, n.y - me.y);
    if (s.visible.has(n.sourceId) || d < 1 || d > Math.min(n.radiusPx, hearing)) continue;
    // A sound gives a direction, not a place.
    s.look = rotate({ x: (n.x - me.x) / d, y: (n.y - me.y) / d }, (env.rng.nextFloat() * 2 - 1) * tuning.noise.bearingErrorDeg);
  }
  const maxAge = profile.memoryS * TICKS_PER_S;
  for (const [id, m] of s.memory) if (t.tick - m.tick > maxAge) s.memory.delete(id);
  return seen;
}
