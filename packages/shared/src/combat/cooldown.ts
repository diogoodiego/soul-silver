import type { CombatTuning } from "./schemas.ts";

/** Cooldown from the original power and PP (research R5); moves without power use `statusPower`. */
export function baseCooldownS(c: CombatTuning["cooldown"], power: number, pp: number): number {
  const p = power > 0 ? power : c.statusPower;
  const raw = c.a + (c.b * p) / 100 + c.c * (35 / Math.max(1, pp) - 1);
  return Math.max(c.min, Math.min(c.max, raw));
}

/** Move speed (px per second) and cooldown multiplier for a Speed stat (research R6). */
export function speedScale(s: CombatTuning["speed"], speed: number): { movePx: number; cooldownMul: number } {
  const t = Math.max(0, Math.min(1, (speed - s.low) / (s.high - s.low)));
  return { movePx: s.moveMinPx + t * (s.moveMaxPx - s.moveMinPx), cooldownMul: 1 - t * s.cooldownMaxCut };
}
