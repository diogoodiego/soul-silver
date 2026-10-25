import type { Rng } from "../game/rng.ts";
import type { StatusId, StatusRecord } from "./schemas.ts";

// Status conditions in real time (research R9): data in seconds, state in ticks at 20 Hz.

export const TICKS_PER_S = 20;
export const toTicks = (s: number): number => Math.round(s * TICKS_PER_S);

export interface StatusState {
  id: StatusId;
  startTick: number;
  untilTick: number;
  /** Intervals elapsed (toxic's multiplier). */
  count: number;
}

export function canApply(def: StatusRecord, types: readonly number[], current: { major: StatusId | undefined; confused: boolean }): boolean {
  if (types.some((t) => def.immuneTypes.includes(t))) return false;
  return def.major ? current.major === undefined : !current.confused;
}

export function startStatus(def: StatusRecord, tick: number, rng: Rng): StatusState {
  const min = toTicks(def.durationS.min);
  const span = toTicks(def.durationS.max) - min;
  return { id: def.id, startTick: tick, untilTick: tick + min + rng.nextInt(span + 1), count: 0 };
}

/** One tick of a status: tick damage on each interval, early thaw, and the end. Mutates `state.count`. */
export function tickStatus(def: StatusRecord, state: StatusState, tick: number, maxHp: number, rng: Rng): { damage: number; ended: boolean } {
  let damage = 0;
  let ended = tick >= state.untilTick;
  const interval = def.intervalS ? toTicks(def.intervalS) : 0;
  if (interval > 0 && (tick - state.startTick) % interval === 0) {
    state.count++;
    if (def.tickDamage) damage = Math.max(1, Math.floor(maxHp * def.tickDamage * (def.toxic ? state.count : 1)));
    if (def.thaw && rng.nextInt(100) < def.thaw) ended = true;
  }
  return { damage, ended };
}
