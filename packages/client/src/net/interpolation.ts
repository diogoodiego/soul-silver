import type { Entity } from "@soulsilver/shared/game";

// Remote entities are shown slightly in the past, between two received states (spec 010, research R5).

const TICK_MS = 50;
const DELAY_MS = 100;
/** About 1 s of history per entity. */
const MAX_HISTORY = 20;

interface Sample {
  time: number;
  entity: Entity;
}

export function createInterpolator() {
  const history = new Map<number, Sample[]>();
  // shortcut: the clock offset is fixed by the first state; add drift correction if long sessions show lag creep.
  let offset: number | undefined;

  return {
    /** The full set of remote entities at a server tick, received at local time `arrival`. */
    push(tick: number, arrival: number, entities: Entity[]): void {
      const time = tick * TICK_MS;
      offset ??= arrival - time;
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
      if (offset === undefined) return [];
      const t = now - offset - DELAY_MS;
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
