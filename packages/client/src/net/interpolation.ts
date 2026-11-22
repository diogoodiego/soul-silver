import type { Entity } from "@soulsilver/shared/game";

// Remote entities are shown slightly in the past, between two received states (spec 010, research R5): one tick plus
// however late states arrive, so that the next one is there when it is needed.

const TICK_MS = 50;
/** How far in the past it starts, before any lateness is known, and the farthest it goes. */
const START_MS = 100;
const MAX_MS = 150;
/** States whose lateness counts (2 s). */
const WINDOW = 40;
/** Shown time runs at most a tenth faster or slower while the delay changes. */
const ADJUST = 0.1;
/** About 1 s of history per entity. */
const MAX_HISTORY = 20;

interface Sample {
  time: number;
  entity: Entity;
}

export function createInterpolator() {
  const history = new Map<number, Sample[]>();
  /** Arrival minus server time of the latest states; the smallest is the clocks' offset, the rest is lateness. */
  const arrivals: number[] = [];
  /** Local time minus the server time shown, what it should be, and when it last changed. */
  let behind: number | undefined;
  let wanted = 0;
  let adjustedAt: number | undefined;

  return {
    /** The full set of remote entities at a server tick, received at local time `arrival`. */
    push(tick: number, arrival: number, entities: Entity[]): void {
      const time = tick * TICK_MS;
      arrivals.push(arrival - time);
      if (arrivals.length > WINDOW) arrivals.shift();
      wanted = Math.min(Math.max(...arrivals) + TICK_MS, Math.min(...arrivals) + MAX_MS);
      behind ??= arrival - time + START_MS;
      const present = new Set<number>();
      for (const entity of entities) {
        present.add(entity.id);
        const samples = history.get(entity.id) ?? [];
        samples.push({ time, entity });
        if (samples.length > MAX_HISTORY) samples.shift();
        history.set(entity.id, samples);
      }
      for (const id of history.keys()) if (!present.has(id)) history.delete(id);
    },
    sample(now: number): Entity[] {
      if (behind === undefined) return [];
      const most = ADJUST * Math.max(0, now - (adjustedAt ?? now));
      behind += Math.max(-most, Math.min(most, wanted - behind));
      adjustedAt = now;
      const t = now - behind;
      const out: Entity[] = [];
      for (const samples of history.values()) {
        const next = samples.findIndex((s) => s.time > t);
        if (next === -1) {
          out.push(samples[samples.length - 1]!.entity);
        } else if (next === 0) {
          out.push(samples[0]!.entity);
        } else {
          const a = samples[next - 1]!;
          const b = samples[next]!;
          if (a.entity.area !== b.entity.area) {
            out.push(a.entity);
            continue;
          }
          const k = (t - a.time) / (b.time - a.time);
          out.push({ ...a.entity, x: a.entity.x + (b.entity.x - a.entity.x) * k, y: a.entity.y + (b.entity.y - a.entity.y) * k });
        }
      }
      return out;
    },
  };
}

export type Interpolator = ReturnType<typeof createInterpolator>;
