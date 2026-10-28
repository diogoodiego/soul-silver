import { describe, expect, it } from "vitest";
import { combatSetup, MOVES } from "./combat-fixture";

// Spec 022, FR-013: a move only reaches combatants of the same battle (or both outside any battle).

function duel(battleA: number | undefined, battleB: number | undefined) {
  const s = combatSetup();
  const a = s.spawn("cyndaquil", [MOVES.tackle.id], { x: 100, y: 100 }, 1);
  const b = s.spawn("chikorita", [MOVES.tackle.id], { x: 120, y: 100 }, "trainer");
  s.combat.setBattle(a, battleA);
  s.combat.setBattle(b, battleB);
  const before = s.hp(b);
  s.press(a, 1, { x: 1, y: 0 });
  s.step(30);
  return { hurt: s.hp(b) < before };
}

describe("battle isolation", () => {
  it("hits within the same battle", () => {
    expect(duel(7, 7).hurt).toBe(true);
  });

  it("hits when neither is in a battle", () => {
    expect(duel(undefined, undefined).hurt).toBe(true);
  });

  it("never hits across battles or into or out of one", () => {
    expect(duel(7, 8).hurt).toBe(false);
    expect(duel(undefined, 7).hurt).toBe(false);
    expect(duel(7, undefined).hurt).toBe(false);
  });
});
