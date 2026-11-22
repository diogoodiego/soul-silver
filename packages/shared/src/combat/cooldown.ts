import type { CombatTuning } from "./schemas.ts";

/** Block C: a special move's cooldown from its original power; status, fixed and variable damage (power 0 or 1) take the base. */
export function specialCooldownS(c: CombatTuning["action"]["specialCooldown"], power: number): number {
  if (power < 80) return c.baseS;
  return Math.min(c.maxS, c.baseS + (power - 80) * c.perPowerS);
}

/** Move speed (px per second) and dodge and parry cooldown (seconds) for a Speed stat (research R6, block C). */
export function speedScale(s: CombatTuning["speed"], speed: number): { movePx: number; reflexS: number } {
  const t = Math.max(0, Math.min(1, (speed - s.low) / (s.high - s.low)));
  return { movePx: s.moveMinPx + t * (s.moveMaxPx - s.moveMinPx), reflexS: s.reflexSlowS + t * (s.reflexFastS - s.reflexSlowS) };
}

/** The original's accuracy stage ratios (sAccuracyStageRatios), stages −6 to +6, in percent. */
const STAGE_PERCENT = [33, 36, 43, 50, 60, 75, 100, 133, 166, 200, 233, 266, 300];

/** Block C: chance in percent that a move of `accuracy` hits, `stage` being the user's accuracy minus the target's evasion. */
export function hitChance(accuracy: number, stage: number): number {
  const s = Math.max(-6, Math.min(6, stage));
  return (accuracy * STAGE_PERCENT[s + 6]!) / 100;
}
