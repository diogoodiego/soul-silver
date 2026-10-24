import { diffEntity, type Entity, type EntityDelta, type StateMessage } from "@soulsilver/shared/game";
import { isRelevant } from "./relevance";

/** What one client was last sent. Deltas are against it, which needs a reliable ordered transport (research R3). */
export interface Replica {
  sent: Map<number, Entity>;
  area: string | undefined;
}

export const createReplica = (): Replica => ({ sent: new Map(), area: undefined });

/** Builds this tick's state for one client and records it as sent. */
export function replicate(replica: Replica, viewer: Entity, entities: Entity[], tick: number, lastInput: number): StateMessage {
  const full = replica.area !== viewer.area;
  if (full) {
    replica.sent.clear();
    replica.area = viewer.area;
  }
  const spawned: Entity[] = [];
  const changed: EntityDelta[] = [];
  const removed: number[] = [];
  const seen = new Set<number>();

  for (const entity of entities) {
    if (!isRelevant(viewer, entity)) continue;
    seen.add(entity.id);
    const prev = replica.sent.get(entity.id);
    if (!prev) {
      spawned.push(entity);
    } else {
      const delta = diffEntity(prev, entity);
      if (delta) changed.push(delta);
    }
    replica.sent.set(entity.id, entity);
  }
  for (const id of replica.sent.keys()) {
    if (!seen.has(id)) {
      removed.push(id);
      replica.sent.delete(id);
    }
  }
  return { type: "state", tick, lastInput, full, spawned, changed, removed };
}
