import type { Rng } from "../game/rng.ts";
import { stageMultiplier } from "./stats.ts";

// Gen 4 damage formula (research R2). Each step truncates like the original; the caller rolls
// the crit and the random factor so the formula stays a pure function.

export interface DamageInput {
  level: number;
  power: number;
  /** Raw attack and defense stats (physical or special by the move's category). */
  attack: number;
  defense: number;
  attackStage: number;
  defenseStage: number;
  stab: boolean;
  /** One multiplier per defender type, applied in order. */
  typeMultipliers: readonly number[];
  /** Burned user of a physical move. */
  burned: boolean;
  /** 1.5, 1 or 0.5 from sun or rain. */
  weather: number;
  crit: boolean;
  /** 85 to 100. */
  random: number;
}

export function computeDamage(input: DamageInput): number {
  if (input.typeMultipliers.includes(0)) return 0;
  // A critical hit ignores the attacker's lowered attack and the defender's raised defense.
  const attackStage = input.crit ? Math.max(0, input.attackStage) : input.attackStage;
  const defenseStage = input.crit ? Math.min(0, input.defenseStage) : input.defenseStage;
  const a = Math.floor(input.attack * stageMultiplier(attackStage));
  const d = Math.max(1, Math.floor(input.defense * stageMultiplier(defenseStage)));
  let damage = Math.floor(Math.floor((Math.floor((2 * input.level) / 5 + 2) * input.power * a) / d) / 50);
  if (input.burned) damage = Math.floor(damage / 2);
  damage = Math.floor(damage * input.weather) + 2;
  if (input.crit) damage *= 2;
  damage = Math.floor((damage * input.random) / 100);
  if (input.stab) damage = Math.floor(damage * 1.5);
  for (const m of input.typeMultipliers) damage = Math.floor(damage * m);
  return Math.max(1, damage);
}

export const rollRandom = (rng: Rng): number => 85 + rng.nextInt(16);

/** `chances` are 1/n per crit stage; stages past the table use its last entry. */
export function rollCrit(rng: Rng, stage: number, chances: readonly number[]): boolean {
  const n = chances[Math.min(stage, chances.length - 1)]!;
  return rng.nextInt(n) === 0;
}
