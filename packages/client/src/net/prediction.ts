import { stepMovement, type Entity, type Occupied, type PlayerInput, type WorldLookup } from "@soulsilver/shared/game";
import type { Direction } from "@soulsilver/shared/maps";

// Client-side prediction of the player's own entity (spec 010, research R4). Between ticks the view
// blends from the previous predicted step to the latest one (spec 011, research R3). The trainer steps
// on tiles as the server does; a Pokémon in combat moves freely (createCombatPredictor).

/** Above this error (2 tiles) the correction is applied at once instead of smoothed. */
export const SNAP_PX = 32;
const SMOOTH_MS = 100;
export const TICK_MS = 50;

/** The prediction around one step function: inputs applied at once, replayed on each server state. */
function predictWith(step: (entity: Entity, input: PlayerInput) => Entity) {
  let pending: PlayerInput[] = [];
  let predicted: Entity | undefined;
  /** The step before `predicted`, while blending towards it. */
  let from: Entity | undefined;
  let appliedAt = 0;
  let offset = { x: 0, y: 0, at: 0 };

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

/** `occupied` says which tiles of an area NPCs hold (spec 021); without it only the map blocks. */
export function createPredictor(world: WorldLookup, occupied?: (area: string) => Occupied) {
  return predictWith((entity, input) => stepMovement(entity, input, world, occupied?.(entity.area)));
}

export type Predictor = ReturnType<typeof createPredictor>;

/** A combat Pokémon's step per tick before the server shows one: the middle of the speed tuning's range. */
export const COMBAT_SPEED_PX = 4;
/** shortcut: the step's bounds from content/combat/tuning.json (moveMinPx..moveMaxPx = 60..110 px/s at 20 Hz), with
 * some slack; read the tuning if it changes much. Outside them the server was not walking it (a dash, a wall). */
const STEP_MIN_PX = 2.9;
const STEP_MAX_PX = 5.6;

/** As the server's combat: the larger axis of the push. */
const facingOf = (d: { x: number; y: number }): Direction => (Math.abs(d.x) >= Math.abs(d.y) ? (d.x >= 0 ? "east" : "west") : d.y >= 0 ? "south" : "north");

/**
 * Prediction of the Pokémon the player drives in combat. It moves as the server's combat does (the push
 * scaled to its speed, slower with the stick half tilted, never rooted while charging), at the speed the
 * server last showed for one input. Dashes, walls and statuses that hold it are left to the server's correction.
 */
export function createCombatPredictor() {
  let speed = COMBAT_SPEED_PX;
  const sent = new Map<number, PlayerInput>();
  let last: { entity: Entity; ack: number } | undefined;
  const core = predictWith((entity, input) => {
    const len = Math.hypot(input.move.x, input.move.y);
    if (len < 0.1) return entity;
    const k = speed / Math.max(1, len);
    return { ...entity, x: entity.x + input.move.x * k, y: entity.y + input.move.y * k, facing: facingOf(input.move) };
  });
  return {
    ...core,
    apply(input: PlayerInput, now: number): void {
      sent.set(input.seq, input);
      core.apply(input, now);
    },
    reconcile(server: Entity, lastInput: number, now: number): void {
      // One input applied since the last state: how far it went is the Pokémon's speed.
      const input = sent.get(lastInput);
      if (last && input && lastInput === last.ack + 1 && last.entity.area === server.area) {
        const len = Math.hypot(input.move.x, input.move.y);
        const step = Math.hypot(server.x - last.entity.x, server.y - last.entity.y) / Math.min(1, len);
        if (len >= 0.1 && step >= STEP_MIN_PX && step <= STEP_MAX_PX) speed = step;
      }
      last = { entity: server, ack: lastInput };
      for (const seq of sent.keys()) if (seq <= lastInput) sent.delete(seq);
      core.reconcile(server, lastInput, now);
    },
  };
}
