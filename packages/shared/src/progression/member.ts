import { computeStats, type Stats } from "../combat/stats.ts";
import { BATTLE_STAT_KEYS, STAT_KEYS, type StatKey } from "../game-data/common.ts";

// A party member's stats, EVs and friendship (spec 016, research R7–R8).

/** The Gen 4 nature id (0–24) as the stat it raises and the one it lowers; undefined when neutral. */
export function natureMods(nature: number): { up: StatKey; down: StatKey } | undefined {
  const up = BATTLE_STAT_KEYS[Math.floor(nature / 5)]!;
  const down = BATTLE_STAT_KEYS[nature % 5]!;
  return up === down ? undefined : { up, down };
}

export interface StatSource {
  level: number;
  ivs: Stats;
  evs: Stats;
  nature: number;
}

export const memberStats = (base: Stats, m: StatSource): Stats => computeStats(base, m.level, { ivs: m.ivs, evs: m.evs, nature: natureMods(m.nature) });

export const EV_STAT_MAX = 255;
export const EV_TOTAL_MAX = 510;

/** Adds an EV yield, capped at 255 per stat and 510 in total, in stat order. */
export function addEvs(evs: Stats, gain: Stats): Stats {
  const out = { ...evs };
  let room = EV_TOTAL_MAX - STAT_KEYS.reduce((sum, k) => sum + evs[k], 0);
  for (const k of STAT_KEYS) {
    const add = Math.max(0, Math.min(gain[k], EV_STAT_MAX - out[k], room));
    out[k] += add;
    room -= add;
  }
  return out;
}

export const friendshipOnLevelUp = (f: number): number => Math.min(255, f + (f < 100 ? 5 : f < 200 ? 3 : 2));
export const friendshipOnFaint = (f: number): number => Math.max(0, f - 1);
