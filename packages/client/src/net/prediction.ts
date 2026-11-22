import { castData, DODGE_PX, DODGE_TICKS, statusesOf, unpackKit, type Point } from "@soulsilver/shared/combat";
import { BUTTON, stepMovement, type Entity, type EntityData, type Occupied, type PlayerInput, type WorldLookup } from "@soulsilver/shared/game";
import type { Direction } from "@soulsilver/shared/maps";
import combatTuning from "../../../../content/combat/tuning.json";

// Client-side prediction of the player's own entity (spec 010, research R4). Between ticks the view
// blends from the previous predicted step to the latest one (spec 011, research R3). The trainer steps
// on tiles as the server does; a Pokémon in combat moves freely (createCombatPredictor).

/** Above this error (2 tiles) the correction is applied at once instead of smoothed. */
export const SNAP_PX = 32;
const SMOOTH_MS = 100;
export const TICK_MS = 50;

/** Block C: combat buttons pressed, ahead of the input that carries them; `move` is the push at that moment. */
export interface Press {
  id: number;
  buttons: number;
  move: Point;
}
const isPress = (i: unknown): i is Press => typeof i === "object" && i !== null && "id" in i;

/** The prediction around one step function: inputs (and presses) applied at once, replayed on each server state. */
function predictWith<I>(step: (entity: Entity, input: I) => Entity) {
  let pending: I[] = [];
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
    apply(input: I, now: number): void {
      if (!predicted) return;
      pending.push(input);
      const next = step(predicted, input);
      // A press that moves nothing leaves the step under way as it is.
      if (isPress(input) && next.x === predicted.x && next.y === predicted.y) {
        predicted = next;
        return;
      }
      from = blended(now);
      predicted = next;
      appliedAt = now;
    },
    /** Rebuilds the prediction from the server's entity and keeps what is shown continuous. */
    reconcile(server: Entity, confirmed: (input: I) => boolean, now: number): void {
      // Compared without the blend, which keeps running towards the new prediction, from as much farther.
      const before = predicted;
      const shown = predicted && withOffset(predicted, now);
      pending = pending.filter((i) => !confirmed(i));
      predicted = pending.reduce(step, server);
      const dx = shown ? shown.x - predicted.x : 0;
      const dy = shown ? shown.y - predicted.y : 0;
      const snap = !shown || shown.area !== predicted.area || Math.hypot(dx, dy) > SNAP_PX;
      offset = snap ? { x: 0, y: 0, at: now } : { x: dx, y: dy, at: now };
      if (snap) from = undefined;
      else if (from) from = { ...from, x: from.x + predicted.x - before!.x, y: from.y + predicted.y - before!.y };
    },
    view,
    pendingCount: () => pending.length,
  };
}

/** `occupied` says which tiles of an area NPCs hold (spec 021); without it only the map blocks. */
export function createPredictor(world: WorldLookup, occupied?: (area: string) => Occupied) {
  const core = predictWith<PlayerInput>((entity, input) => stepMovement(entity, input, world, occupied?.(entity.area)));
  return {
    ...core,
    reconcile(server: Entity, lastInput: number, now: number): void {
      core.reconcile(server, (i) => i.seq <= lastInput, now);
    },
  };
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

const VECTORS: Record<Direction, Point> = { north: { x: 0, y: -1 }, south: { x: 0, y: 1 }, east: { x: 1, y: 0 }, west: { x: -1, y: 0 } };
const { action, bodyRadiusPx } = combatTuning.value;
const num = (d: EntityData, key: string): number => (typeof d[key] === "number" ? d[key] : 0);
/** It cannot act: what the server refuses, the prediction must not show. */
const helpless = (d: EntityData) => d["hp"] === 0 || d["stun"] === true || statusesOf(d).some((s) => s === "sleep" || s === "freeze");
const guards = (d: EntityData) => d["parry"] === true || d["guard"] === true;

function without(d: EntityData, test: (key: string) => boolean): EntityData {
  return Object.fromEntries(Object.entries(d).filter(([k]) => !test(k)));
}
/** The charge's fields (castShape, castMs...), as the server drops them. */
const uncast = (d: EntityData) => without(d, (k) => k.startsWith("cast") && k !== "castMark" && k !== "casting");

export interface CombatWorld {
  /** Solid ground for this Pokémon at a point; without it only the server's correction stops it. */
  solid?(entity: Entity, x: number, y: number): boolean;
  /** Where the nearest foe is, as the server last said. */
  foe?(entity: Entity): Point | undefined;
}

/**
 * Prediction of the Pokémon the player drives in combat. It moves as the server's combat does (the push
 * scaled to its speed, slower with the stick half tilted), at the speed the server last showed for one input.
 * Block C: its own actions show in the frame of the press: a move's charge and leap, the dodge, the parry's pose.
 * What they do to others, and whether they count, is the server's alone; statuses and knockbacks are left to its correction.
 */
export function createCombatPredictor(world: CombatWorld = {}) {
  let speed = COMBAT_SPEED_PX;
  const sent = new Map<number, PlayerInput>();
  let last: { entity: Entity; ack: number } | undefined;

  /** As the server's shift: axis by axis, stopping at solid ground. */
  function shift(e: Entity, dx: number, dy: number): Entity {
    let { x, y } = e;
    if (!world.solid?.(e, x + dx, y)) x += dx;
    if (!world.solid?.(e, x, y + dy)) y += dy;
    return { ...e, x, y };
  }

  function dodgeStep(e: Entity): Entity {
    const dir = { x: num(e.data, "evDx") / 100, y: num(e.data, "evDy") / 100 };
    return { ...shift(e, dir.x * DODGE_PX, dir.y * DODGE_PX), facing: facingOf(dir), data: { ...e.data, evade: num(e.data, "evade") - 1 } };
  }

  function leapStep(e: Entity): Entity {
    const left = num(e.data, "leapLeft") - 1;
    const moved = shift(e, num(e.data, "leapDx"), num(e.data, "leapDy"));
    // Landed: the move goes off, on the server's word.
    if (left === 0) return { ...moved, data: { ...without(e.data, (k) => k.startsWith("leap")), casting: 0 } };
    const ticks = num(e.data, "leapTicks") || left + 1;
    return { ...moved, data: { ...e.data, leapLeft: left, leap: 1 - left / ticks } };
  }

  /** The charge is over: the leap to where the server says it lands, at most its longest. */
  function startLeap(e: Entity): Entity {
    const [x, y] = [num(e.data, "castOx"), num(e.data, "castOy")];
    const far = Math.hypot(x, y);
    const k = far > action.leapMaxPx ? action.leapMaxPx / far : 1;
    const ticks = Math.ceil((far * k * 1000) / TICK_MS / action.leapSpeedPx);
    const data = without(uncast(e.data), (key) => key === "lungeIn");
    if (ticks === 0) return { ...e, data: { ...data, casting: 0 } };
    return leapStep({ ...e, facing: facingOf({ x, y }), data: { ...data, leapLeft: ticks, leapTicks: ticks, leapDx: (x * k) / ticks, leapDy: (y * k) / ticks } });
  }

  function step(entity: Entity, input: PlayerInput): Entity {
    const d = entity.data;
    if (helpless(d)) return entity;
    if (num(d, "evade") > 0) return dodgeStep(entity);
    if (num(d, "leapLeft") > 0) return leapStep(entity);
    if (guards(d) || d["leap"] !== undefined) return entity;
    let e = entity;
    const lungeIn = d["lungeIn"];
    if (typeof lungeIn === "number") {
      if (lungeIn <= 1) return startLeap(e);
      e = { ...e, data: { ...d, lungeIn: lungeIn - 1 } };
    }
    const len = Math.hypot(input.move.x, input.move.y);
    if (len < 0.1) return e;
    const k = speed / Math.max(1, len);
    const moved = { ...shift(e, input.move.x * k, input.move.y * k), facing: facingOf(input.move) };
    if (typeof lungeIn !== "number") return moved;
    // It still lands by its foe, from where it walked to.
    return { ...moved, data: { ...moved.data, castOx: num(e.data, "castOx") - (moved.x - e.x), castOy: num(e.data, "castOy") - (moved.y - e.y) } };
  }

  /** What a press starts at once, when the server would let it; within a tick of the end of a cooldown it may. */
  function pressed(entity: Entity, press: Press): Entity {
    let e = entity;
    if (helpless(e.data)) return e;
    const ready = (key: string) => num(e.data, key) <= TICK_MS;
    const evading = num(e.data, "evade") > 0;
    if (press.buttons & BUTTON.guard && e.data["leap"] === undefined) {
      // A feint: the charge is dropped.
      if (num(e.data, "casting") > 0) e = { ...e, data: { ...without(uncast(e.data), (k) => k === "lungeIn"), casting: 0 } };
      if (ready("cdGuard") && !evading && !guards(e.data)) e = { ...e, data: { ...e.data, parry: true } };
    }
    if (guards(e.data) || num(e.data, "casting") > 0 || evading) return e;
    if (press.buttons & BUTTON.dash && ready("cdDodge")) {
      const len = Math.hypot(press.move.x, press.move.y);
      const dir = len > 0.1 ? { x: press.move.x / len, y: press.move.y / len } : VECTORS[e.facing];
      return dodgeStep({ ...e, data: { ...e.data, dodge: true, evade: DODGE_TICKS, evDx: Math.round(dir.x * 100), evDy: Math.round(dir.y * 100) } });
    }
    for (const slot of [1, 2, 3, 4]) {
      const kit = press.buttons & (1 << (slot - 1)) ? unpackKit(e.data[`kit${slot}`]) : undefined;
      if (!kit) continue;
      if (!ready(`cd${slot}`)) return e;
      const foe = kit.aim === "foe" ? world.foe?.(e) : undefined;
      const gap = foe ? Math.hypot(foe.x - e.x, foe.y - e.y) : Infinity;
      const dir = foe && gap > 0.01 ? { x: (foe.x - e.x) / gap, y: (foe.y - e.y) / gap } : VECTORS[e.facing];
      const px = kit.leap ? Math.max(0, Math.min(action.leapMaxPx, gap - 2 * bodyRadiusPx)) : 0;
      return { ...e, facing: facingOf(dir), data: { ...e.data, casting: slot, ...castData(kit, dir, px) } };
    }
    return e;
  }

  const core = predictWith<PlayerInput | Press>((entity, i) => (isPress(i) ? pressed(entity, i) : step(entity, i)));
  return {
    ...core,
    apply(input: PlayerInput, now: number): void {
      sent.set(input.seq, input);
      core.apply(input, now);
    },
    /** Block C: shows at once what the press starts; it stays pending until the server has taken it. */
    press(press: Press, now: number): void {
      core.apply(press, now);
    },
    reconcile(server: Entity, lastInput: number, now: number, lastPress = -1): void {
      // A contact move's leap, which ends as the move goes off.
      const leapt = server.data["leap"] !== undefined || server.data["used"] !== last?.entity.data["used"];
      // One input applied since the last state: how far it went is the Pokémon's speed.
      const input = sent.get(lastInput);
      if (last && input && lastInput === last.ack + 1 && last.entity.area === server.area && !leapt) {
        const len = Math.hypot(input.move.x, input.move.y);
        const step = Math.hypot(server.x - last.entity.x, server.y - last.entity.y) / Math.min(1, len);
        if (len >= 0.1 && step >= STEP_MIN_PX && step <= STEP_MAX_PX) speed = step;
      }
      last = { entity: server, ack: lastInput };
      for (const seq of sent.keys()) if (seq <= lastInput) sent.delete(seq);
      core.reconcile(server, (i) => (isPress(i) ? i.id <= lastPress : i.seq <= lastInput), now);
    },
  };
}
