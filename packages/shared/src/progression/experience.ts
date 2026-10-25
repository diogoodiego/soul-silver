import type { GrowthRateKey } from "../game-data/species.ts";

// Experience (spec 016, research R1–R2): the Gen 4 gain formula and the six growth curves.

/** Total experience to reach a level (1–100), by the Gen 3/4 curve formulas. */
export function expForLevel(rate: GrowthRateKey, n: number): number {
  if (n <= 1) return 0;
  const cube = n ** 3;
  switch (rate) {
    case "medium-fast":
      return cube;
    case "fast":
      return Math.floor((4 * cube) / 5);
    case "slow":
      return Math.floor((5 * cube) / 4);
    case "medium-slow":
      return Math.floor((6 * cube) / 5) - 15 * n * n + 100 * n - 140;
    case "erratic":
      if (n < 50) return Math.floor((cube * (100 - n)) / 50);
      if (n < 68) return Math.floor((cube * (150 - n)) / 100);
      if (n < 98) return Math.floor((cube * Math.floor((1911 - 10 * n) / 3)) / 500);
      return Math.floor((cube * (160 - n)) / 100);
    case "fluctuating":
      if (n < 15) return Math.floor((cube * (Math.floor((n + 1) / 3) + 24)) / 50);
      if (n < 36) return Math.floor((cube * (n + 14)) / 50);
      return Math.floor((cube * (Math.floor(n / 2) + 32)) / 50);
  }
}

/** The level a total experience gives. */
export function levelFor(rate: GrowthRateKey, exp: number): number {
  let level = 1;
  while (level < 100 && expForLevel(rate, level + 1) <= exp) level++;
  return level;
}

export interface ExpGainInput {
  /** Base experience of the defeated species. */
  baseExperience: number;
  /** Level of the defeated Pokémon. */
  level: number;
  /** Participants sharing the experience. */
  participants: number;
  /** Defeated Pokémon belonged to a trainer (×1.5). */
  trainer: boolean;
}

/** Gen 4: floor(floor(b × L / 7) / s), then ×1.5 against a trainer. */
export function expGain({ baseExperience, level, participants, trainer }: ExpGainInput): number {
  const share = Math.floor(Math.floor((baseExperience * level) / 7) / participants);
  return trainer ? Math.floor(share * 1.5) : share;
}
