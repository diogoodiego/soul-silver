import { createRng } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { MOVES } from "./combat-fixture";
import { startFight } from "./ai-fight";

// Spec 019 SC-006: the starter at level 5, played by the reference bot, beats Route 29's wild
// Pokémon at least 90 times in 100. Fixture: the day table's species and level range as numbers.

/** Route 29 by day: Sentret and Rattata (Pidgey is left out: no stand-in in the combat fixture), levels 2–4. */
const ROUTE_29 = [
  { species: "sentret" as const, moves: [MOVES.tackle.id] },
  { species: "rattata" as const, moves: [MOVES.tackle.id, MOVES.quickAttack.id] },
];

describe("Route 29 difficulty (US3)", () => {
  it("the level 5 starter wins at least 90 of 100 fights", () => {
    const pick = createRng(29);
    const results = { starter: 0, wild: 0, timeout: 0 };
    for (let seed = 1; seed <= 100; seed++) {
      const slot = ROUTE_29[pick.nextInt(ROUTE_29.length)]!;
      const level = 2 + pick.nextInt(3);
      // Aggressive so every fight happens; the other temperaments would mostly run.
      results[startFight({ seed, wild: { ...slot, level }, starter: { species: "cyndaquil", level: 5, moves: [MOVES.tackle.id] } }).run()]++;
    }
    expect(results.starter, JSON.stringify(results)).toBeGreaterThanOrEqual(90);
  });
});
