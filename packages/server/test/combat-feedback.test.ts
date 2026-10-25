import { describe, expect, it } from "vitest";
import { combatSetup, MOVES, SPECIES } from "./combat-fixture";

const east = { x: 1, y: 0 };

function hit(attacker: keyof typeof SPECIES, move: number, target: keyof typeof SPECIES, seed = 5) {
  const t = combatSetup(seed);
  const a = t.spawn(attacker, [move], { x: 0, y: 0 }, 1);
  const b = t.spawn(target, [], { x: 20, y: 0 });
  t.press(a, 1, east);
  t.step(40);
  return { t, a, b, event: t.events.find((e) => e.target === b)! };
}

describe("feedback", () => {
  it("fire on grass is super effective: twice the neutral damage on the same rolls (SC-003)", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const grass = hit("cyndaquil", MOVES.ember.id, "chikorita", seed).event;
      const neutral = hit("cyndaquil", MOVES.ember.id, "normalChikorita", seed).event;
      expect(grass).toMatchObject({ kind: "hit", effectiveness: 2 });
      expect(neutral.effectiveness).toBe(1);
      expect(grass.crit).toBe(neutral.crit);
      expect(grass.amount).toBe(neutral.amount * 2);
    }
  });

  it("normal on ghost has no effect: no damage, no push", () => {
    const { t, b, event } = hit("cyndaquil", MOVES.tackle.id, "gastly");
    expect(event).toMatchObject({ kind: "immune", amount: 0, effectiveness: 0, push: { x: 0, y: 0 } });
    expect(t.pos(b)).toEqual({ x: 20, y: 0 });
    expect(t.hp(b)).toBe(t.combat.get(b)!.stats.hp);
  });

  it("not very effective at ½ and ¼", () => {
    expect(hit("cyndaquil", MOVES.tackle.id, "onix").event.effectiveness).toBe(0.5);
    expect(hit("cyndaquil", MOVES.ember.id, "onix").event.effectiveness).toBe(0.5);
  });

  it("a hit pushes the target away and makes it flash", () => {
    const { t, b, event } = hit("cyndaquil", MOVES.tackle.id, "sentret");
    expect(event.push.x).toBeCloseTo(t.data.tuning.knockbackPx);
    expect(t.pos(b).x).toBeCloseTo(20 + t.data.tuning.knockbackPx);
    const t2 = combatSetup(5);
    const a2 = t2.spawn("cyndaquil", [MOVES.tackle.id], { x: 0, y: 0 }, 1);
    const b2 = t2.spawn("sentret", [], { x: 20, y: 0 });
    t2.press(a2, 1, east);
    t2.step(3);
    expect(t2.world.get(b2)!.data.flash).toBe(true);
    t2.step(20);
    expect(t2.world.get(b2)!.data.flash).toBe(false);
  });
});
