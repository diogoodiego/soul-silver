import { describe, expect, it } from "vitest";
import { startFight } from "./ai-fight";
import { MOVES } from "./combat-fixture";

// Spec 027, US7: with a Repel, wild Pokémon of a lower level than the companion neither come close nor attack.

function hitsOnStarter(wildLevel: number, repel: number) {
  let hits = 0;
  const f = startFight({
    seed: 4,
    wild: { species: "rattata", level: wildLevel, moves: [MOVES.tackle.id] },
    starter: { species: "cyndaquil", level: 20, moves: [MOVES.tackle.id] },
    idle: true,
    maxTicks: 20 * 20,
    repel: (body) => (body.kind === "player" || body.kind === "pokemon" ? repel : 0),
    watch: (fight, _tick, h) => {
      hits += h.filter((e) => e.kind === "hit" && e.target === fight.starter).length;
    },
  });
  const start = { x: f.world.get(f.wild)!.x };
  f.run();
  return { hits, moved: Math.abs(f.world.get(f.wild)!.x - start.x) };
}

describe("Repel (US7)", () => {
  it("a lower-level wild Pokémon does not attack while the Repel lasts", () => {
    expect(hitsOnStarter(5, 20).hits).toBe(0);
  });

  it("without a Repel the same wild Pokémon attacks", () => {
    expect(hitsOnStarter(5, 0).hits).toBeGreaterThan(0);
  });

  it("a wild Pokémon of the companion's level or higher ignores the Repel", () => {
    expect(hitsOnStarter(20, 20).hits).toBeGreaterThan(0);
  });
});

describe("Repel mid-fight (Phase 12, T075)", () => {
  it("a wild Pokémon already fighting goes on when the Repel starts", () => {
    let repel = 0;
    let after = 0;
    const f = startFight({
      seed: 4,
      wild: { species: "rattata", level: 5, moves: [MOVES.tackle.id] },
      starter: { species: "cyndaquil", level: 20, moves: [MOVES.tackle.id] },
      idle: true,
      maxTicks: 20 * 30,
      repel: () => repel,
      watch: (fight, tick, h) => {
        if (repel === 0 && h.some((e) => e.kind === "hit" && e.target === fight.starter)) repel = 20;
        else if (repel > 0) after += h.filter((e) => e.kind === "hit" && e.target === fight.starter).length;
        void tick;
      },
    });
    f.run();
    expect(repel).toBe(20);
    expect(after).toBeGreaterThan(0);
  });
});
