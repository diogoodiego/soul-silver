import { computeDamage } from "../combat/damage.ts";
import type { Rng } from "../game/rng.ts";
import type { AiTuning, SkillProfile } from "./schemas.ts";
import type { AiEnv, MoveScore, MoveView, OpponentView, SelfView } from "./view.ts";

// Move choice (spec 019, research R8): expected damage × hit chance + usefulness, then a weighted
// draw whose temperature sets how often the best move wins.

/** The average damage roll, no crit. */
const AVERAGE_ROLL = 92;

export interface ScoreContext {
  profile: SkillProfile;
  tuning: AiTuning;
  effectiveness: AiEnv["effectiveness"];
  distPx: number;
  /** Target speed seen, px per tick. */
  targetSpeedPx: number;
  /** Seconds since this fight began. */
  fightS: number;
  /** No opponent close enough to hit it soon. */
  safe: boolean;
}

/** How far from the user a move lands. */
export function reachPx(m: MoveView): number {
  const h = m.hitbox;
  const extent = !h ? 0 : h.shape === "capsule" ? h.lengthPx : h.radiusPx;
  return m.behavior === "target-area" || m.behavior === "field" ? m.rangePx + extent : Math.max(m.rangePx, extent);
}

export function scoreMoves(self: SelfView, target: OpponentView, ctx: ScoreContext): MoveScore[] {
  const { score: k } = ctx.tuning;
  const out: MoveScore[] = [];
  for (const m of self.moves) {
    if (!m.ready) continue;
    const eff = ctx.effectiveness(m.type, target.types);
    // What the AI believes: full knowledge sees the real multiplier, none sees neutral.
    const seen = 1 + (eff - 1) * ctx.profile.typeKnowledge;
    const shape = m.hitbox?.shape ?? "none";
    const hit = k.hitChance[shape] * (ctx.distPx <= reachPx(m) ? 1 : k.outOfRange) * Math.max(0, 1 - ctx.targetSpeedPx * k.speedPenalty);
    let damage = 0;
    if (m.damages && m.power > 0 && seen > 0 && target.kind === "pokemon") {
      const special = m.category === "special";
      const hp = computeDamage({
        level: self.level,
        power: m.power,
        attack: special ? self.specialAttack : self.attack,
        defense: special ? target.specialDefense : target.defense,
        attackStage: 0,
        defenseStage: 0,
        stab: self.types.includes(m.type),
        typeMultipliers: [seen],
        burned: false,
        weather: 1,
        crit: false,
        random: AVERAGE_ROLL,
      });
      damage = (100 * hp) / Math.max(1, target.hpMax);
    }
    let utility = 0;
    if (m.status && !target.hasStatus && seen > 0) utility += k.statusUsefulness * hit;
    if ((m.buff || m.debuff) && (ctx.fightS < k.buffEarlyS || ctx.safe)) utility += k.buffUsefulness;
    if (m.heals && self.hp / self.hpMax < k.healHpFraction) utility += k.healUsefulness;
    const total = seen === 0 ? k.immuneScore : Math.max(k.immuneScore, damage * hit + utility);
    out.push({ slot: m.slot, move: m.id, damage, hit, utility, score: total });
  }
  return out;
}

/** Softmax draw: a low temperature almost always takes the best score. */
export function pickWeighted(scores: MoveScore[], temperature: number, rng: Rng): MoveScore {
  const best = Math.max(...scores.map((s) => s.score));
  const weights = scores.map((s) => Math.exp((s.score - best) / temperature));
  let r = rng.nextFloat() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < scores.length; i++) {
    r -= weights[i]!;
    if (r < 0) return scores[i]!;
  }
  return scores[scores.length - 1]!;
}
