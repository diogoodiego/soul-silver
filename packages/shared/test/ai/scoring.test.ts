import { describe, expect, it } from "vitest";
import { createRng } from "../../src/game/rng.ts";
import { pickWeighted, scoreMoves, type ScoreContext } from "../../src/ai/scoring.ts";
import { EMBER, effectiveness, foe, move, profile, self, TACKLE, TUNING } from "./fixtures.ts";

const ctx = (p = profile("veteran"), patch: Partial<ScoreContext> = {}): ScoreContext => ({ profile: p, tuning: TUNING, effectiveness, distPx: 40, targetSpeedPx: 0, fightS: 10, safe: false, ...patch });
const share = (slot: number, n: number, c: ScoreContext, s = self(), t = foe(), seed = 7) => {
  const rng = createRng(seed);
  const scores = scoreMoves(s, t, c);
  let hits = 0;
  for (let i = 0; i < n; i++) if (pickWeighted(scores, c.profile.temperature, rng).slot === slot) hits++;
  return hits / n;
};

describe("move scoring (US2)", () => {
  it("a strong profile picks Ember against grass in most decisions (SC-001)", () => {
    expect(share(1, 1000, ctx())).toBeGreaterThan(0.9);
  });

  it("a weak profile varies more than a strong one", () => {
    expect(share(1, 1000, ctx(profile("novice")))).toBeLessThan(share(1, 1000, ctx()));
  });

  it("an immune target gets the minimum score with type knowledge, and looks neutral without it", () => {
    const ghost = foe({ types: [7] });
    const knows = scoreMoves(self({ moves: [TACKLE] }), ghost, ctx())[0]!;
    expect(knows.score).toBe(TUNING.score.immuneScore);
    const blind = scoreMoves(self({ moves: [TACKLE] }), ghost, ctx(profile("veteran", { typeKnowledge: 0 })))[0]!;
    expect(blind.score).toBeGreaterThan(TUNING.score.immuneScore);
  });

  it("scores only moves that are ready", () => {
    const scores = scoreMoves(self({ moves: [TACKLE, { ...EMBER, ready: false }] }), foe(), ctx());
    expect(scores.map((s) => s.slot)).toEqual([0]);
  });

  it("status only on a target without one", () => {
    const sleep = move({ id: 79, behavior: "target-debuff", category: "status", power: 0, damages: false, status: true, hitbox: { shape: "capsule", lengthPx: 64, widthPx: 12 } });
    const s = self({ moves: [sleep] });
    expect(scoreMoves(s, foe(), ctx())[0]!.utility).toBeGreaterThan(0);
    expect(scoreMoves(s, foe({ hasStatus: true }), ctx())[0]!.utility).toBe(0);
  });

  it("heal only below the HP threshold", () => {
    const heal = move({ id: 235, behavior: "self-buff", category: "status", power: 0, damages: false, heals: true, hitbox: undefined });
    expect(scoreMoves(self({ moves: [heal], hp: 30 }), foe(), ctx())[0]!.utility).toBe(0);
    expect(scoreMoves(self({ moves: [heal], hp: 5 }), foe(), ctx())[0]!.utility).toBe(TUNING.score.healUsefulness);
  });

  it("buffs early in the fight or when safe", () => {
    const dance = move({ id: 14, behavior: "self-buff", category: "status", power: 0, damages: false, buff: true, hitbox: undefined });
    const s = self({ moves: [dance] });
    expect(scoreMoves(s, foe(), ctx())[0]!.utility).toBe(0);
    expect(scoreMoves(s, foe(), ctx(undefined, { fightS: 1 }))[0]!.utility).toBe(TUNING.score.buffUsefulness);
    expect(scoreMoves(s, foe(), ctx(undefined, { safe: true }))[0]!.utility).toBe(TUNING.score.buffUsefulness);
  });

  it("the same seed repeats the choice", () => {
    expect(share(1, 200, ctx(profile("novice")), self(), foe(), 3)).toBe(share(1, 200, ctx(profile("novice")), self(), foe(), 3));
  });
});
