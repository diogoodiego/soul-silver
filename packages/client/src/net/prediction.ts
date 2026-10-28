import { stepMovement, type Entity, type Occupied, type PlayerInput, type WorldLookup } from "@soulsilver/shared/game";

// Client-side prediction of the player's own entity (spec 010, research R4). Between ticks the view
// blends from the previous predicted step to the latest one (spec 011, research R3).

/** Above this error (2 tiles) the correction is applied at once instead of smoothed. */
export const SNAP_PX = 32;
const SMOOTH_MS = 100;
export const TICK_MS = 50;

/** `occupied` says which tiles of an area NPCs hold (spec 021); without it only the map blocks. */
export function createPredictor(world: WorldLookup, occupied?: (area: string) => Occupied) {
  let pending: PlayerInput[] = [];
  let predicted: Entity | undefined;
  /** The step before `predicted`, while blending towards it. */
  let from: Entity | undefined;
  let appliedAt = 0;
  let offset = { x: 0, y: 0, at: 0 };

  const step = (entity: Entity, input: PlayerInput) => stepMovement(entity, input, world, occupied?.(entity.area));

  function blended(now: number): Entity {
    const k = Math.min(1, Math.max(0, (now - appliedAt) / TICK_MS));
    if (!from || from.area !== predicted!.area || k === 1) return predicted!;
    return { ...predicted!, x: from.x + (predicted!.x - from.x) * k, y: from.y + (predicted!.y - from.y) * k };
  }

  function withOffset(base: Entity, now: number): Entity {
    const k = Math.max(0, 1 - (now - offset.at) / SMOOTH_MS);
    return k === 0 ? base : { ...base, x: base.x + offset.x * k, y: base.y + offset.y * k };
  }

  const view = (now: number): Entity | undefined => (predicted ? withOffset(blended(now), now) : undefined);

  return {
    /** Applies a local input at once; it stays pending until the server confirms it. */
    apply(input: PlayerInput, now: number): void {
      if (!predicted) return;
      pending.push(input);
      from = blended(now);
      predicted = step(predicted, input);
      appliedAt = now;
    },
    /** Rebuilds the prediction from the server's entity and keeps what is shown continuous. */
    reconcile(server: Entity, lastInput: number, now: number): void {
      // Compared without the blend, which keeps running towards the new prediction.
      const shown = predicted && withOffset(predicted, now);
      pending = pending.filter((i) => i.seq > lastInput);
      predicted = pending.reduce(step, server);
      const dx = shown ? shown.x - predicted.x : 0;
      const dy = shown ? shown.y - predicted.y : 0;
      const snap = !shown || shown.area !== predicted.area || Math.hypot(dx, dy) > SNAP_PX;
      offset = snap ? { x: 0, y: 0, at: now } : { x: dx, y: dy, at: now };
      if (snap) from = undefined;
    },
    view,
    pendingCount: () => pending.length,
  };
}

export type Predictor = ReturnType<typeof createPredictor>;
