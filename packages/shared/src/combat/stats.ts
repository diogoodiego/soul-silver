import { STAT_KEYS, type StatKey } from "../game-data/common.ts";

export type Stats = Record<StatKey, number>;

export interface StatOptions {
  ivs?: Stats;
  evs?: Stats;
  /** Raises one stat by 10% and lowers another; omitted is a neutral nature. */
  nature?: { up: StatKey; down: StatKey } | undefined;
}

const fill = (value: number): Stats => Object.fromEntries(STAT_KEYS.map((k) => [k, value])) as Stats;

/** Gen 4 stat formula. Defaults (IV 31, EV 0, neutral nature) are the dev arena's (research R4). */
export function computeStats(base: Stats, level: number, options: StatOptions = {}): Stats {
  const ivs = options.ivs ?? fill(31);
  const evs = options.evs ?? fill(0);
  const out = {} as Stats;
  for (const k of STAT_KEYS) {
    const core = Math.floor(((2 * base[k] + ivs[k] + Math.floor(evs[k] / 4)) * level) / 100);
    if (k === "hp") {
      out.hp = core + level + 10;
      continue;
    }
    const nature = options.nature?.up === k ? 1.1 : options.nature?.down === k ? 0.9 : 1;
    out[k] = Math.floor((core + 5) * nature);
  }
  return out;
}

/** Multiplier of a battle stat at a stage in [-6, 6]. */
export const stageMultiplier = (stage: number): number => Math.max(2, 2 + stage) / Math.max(2, 2 - stage);

/** The new stage, clamped to [-6, 6], and how much of the change applied. */
export function applyStage(stage: number, delta: number): { stage: number; applied: number } {
  const next = Math.max(-6, Math.min(6, stage + delta));
  return { stage: next, applied: next - stage };
}
