import type { StatusId } from "../combat/schemas.ts";
import type { Rng } from "../game/rng.ts";
import type { Ball } from "./schemas.ts";

// Gen 4 capture (spec 015, research R8–R9). Pure: the roll comes from the rng passed in.

/** Sleep and freeze ×2; the other major statuses ×1.5. */
const statusMultiplier = (status: StatusId | undefined): number => (status === "sleep" || status === "freeze" ? 2 : status && status !== "confusion" ? 1.5 : 1);

/** The modified catch rate `a`: 255 or more is a sure catch. */
export function catchValue(input: { hpMax: number; hp: number; catchRate: number; ball: number; status?: StatusId | undefined }): number {
  const { hpMax, hp, catchRate, ball, status } = input;
  return Math.floor(Math.floor(Math.floor((3 * hpMax - 2 * hp) * catchRate * ball) / (3 * hpMax)) * statusMultiplier(status));
}

/** Each of the four shake checks passes when a 16-bit roll is below this. */
export const shakeThreshold = (a: number): number => Math.floor(1048560 / Math.floor(Math.sqrt(Math.floor(Math.sqrt(Math.floor(16711680 / a))))));

/** Shakes shown (the checks passed before the first miss, at most 3) and whether all four passed. */
export function rollShakes(a: number, rng: Rng): { shakes: number; caught: boolean } {
  if (a >= 255) return { shakes: 3, caught: true };
  if (a <= 0) return { shakes: 0, caught: false };
  const b = shakeThreshold(a);
  let passed = 0;
  while (passed < 4 && rng.nextInt(65536) < b) passed++;
  return { shakes: Math.min(passed, 3), caught: passed === 4 };
}

/** What the conditional balls look at; "turns" are turnSeconds since the fight with this Pokémon began. */
export interface BallContext {
  night: boolean;
  cave: boolean;
  turns: number;
  /** The wild Pokémon's type ids, level, base Speed and whether it evolves with a Moon Stone. */
  types: readonly number[];
  level: number;
  baseSpeed: number;
  moonEvolver: boolean;
  caughtBefore: boolean;
  /** Level of the thrower's Pokémon out, or of the party lead. */
  userLevel: number;
}

/** The ball's modifier in this situation; 1 when its condition does not hold. Master Ball (`always`) is handled by the caller. */
export function ballMultiplier(ball: Ball, ctx: BallContext): number {
  const mult = ball.mult ?? 1;
  switch (ball.when) {
    case undefined:
      return mult;
    case "night-or-cave":
      return ctx.night || ctx.cave ? mult : 1;
    case "first-turn":
      return ctx.turns === 0 ? mult : 1;
    case "timer":
      return Math.min(4, (ctx.turns + 10) / 10);
    case "types":
      return ctx.types.some((t) => ball.types!.includes(t)) ? mult : 1;
    case "nest":
      return Math.max(1, (40 - ctx.level) / 10);
    case "repeat":
      return ctx.caughtBefore ? mult : 1;
    case "level":
      return ctx.userLevel > 4 * ctx.level ? 8 : ctx.userLevel > 2 * ctx.level ? 4 : ctx.userLevel > ctx.level ? 2 : 1;
    case "fast":
      return ctx.baseSpeed >= 100 ? mult : 1;
    case "moon":
      return ctx.moonEvolver ? mult : 1;
  }
}
