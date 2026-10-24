import { stepMovement, type CollisionMap, type Entity, type PlayerInput } from "@soulsilver/shared/game";

// Client-side prediction of the player's own entity (spec 010, research R4).

/** Above this error (2 tiles) the correction is applied at once instead of smoothed. */
export const SNAP_PX = 32;
const SMOOTH_MS = 100;

export function createPredictor(collision: (area: string) => CollisionMap | undefined) {
  let pending: PlayerInput[] = [];
  let predicted: Entity | undefined;
  let offset = { x: 0, y: 0, at: 0 };

  const step = (entity: Entity, input: PlayerInput) => stepMovement(entity, input.dir, collision(entity.area));

  function view(now: number): Entity | undefined {
    if (!predicted) return undefined;
    const k = Math.max(0, 1 - (now - offset.at) / SMOOTH_MS);
    return k === 0 ? predicted : { ...predicted, x: predicted.x + offset.x * k, y: predicted.y + offset.y * k };
  }

  return {
    /** Applies a local input at once; it stays pending until the server confirms it. */
    apply(input: PlayerInput): void {
      if (!predicted) return;
      pending.push(input);
      predicted = step(predicted, input);
    },
    /** Rebuilds the prediction from the server's entity and keeps what is shown continuous. */
    reconcile(server: Entity, lastInput: number, now: number): void {
      const shown = view(now);
      pending = pending.filter((i) => i.seq > lastInput);
      predicted = pending.reduce(step, server);
      const dx = shown ? shown.x - predicted.x : 0;
      const dy = shown ? shown.y - predicted.y : 0;
      const snap = !shown || shown.area !== predicted.area || Math.hypot(dx, dy) > SNAP_PX;
      offset = snap ? { x: 0, y: 0, at: now } : { x: dx, y: dy, at: now };
    },
    view,
    pendingCount: () => pending.length,
  };
}

export type Predictor = ReturnType<typeof createPredictor>;
