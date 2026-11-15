import { expForLevel } from "@soulsilver/shared/progression";
import type { PartyMember } from "@soulsilver/shared/save";
import { describe, expect, it } from "vitest";
import { buildProgressionData, createProgression } from "../src/progression";

// Spec 030.1: the Everstone Elm gives, as pret/pokeheartgold GetMonEvolutionInternal: holding an item with
// HOLD_EFFECT_NO_EVOLVE (64) stops evolution by level and by trade, but not by using an item; Kadabra (64) ignores it.
// Synthetic species, but the ids the original names in code: Kadabra 64 into 65 by trade; item 229 holds effect 64.
// 1 evolves into 2 at level 30; 3 into 4 by trade; 5 into 6 with stone 82.

const stats = (v: number) => ({ hp: v, attack: v, defense: v, speed: v, specialAttack: v, specialDefense: v });
const EVERSTONE = 229;
const POTION = 17;
const STONE = 82;
const DATA = buildProgressionData({
  species: [1, 2, 3, 4, 5, 6, 64, 65].map((id) => ({ id, baseStats: stats(50), baseExperience: 60, evYield: stats(0), growthRate: "medium-fast" as const, baseFriendship: 70 })),
  learnsets: [1, 2, 3, 4, 5, 6, 64, 65].map((id) => ({ id, levelUp: [{ level: 1, move: 33 }], machines: [] })),
  evolutions: [
    { id: 1, evolutions: [{ method: "level", methodId: 4, parameter: 30, condition: { kind: "level", level: 30 }, into: 2 }] },
    { id: 3, evolutions: [{ method: "trade", methodId: 5, parameter: 0, condition: { kind: "none" }, into: 4 }] },
    { id: 5, evolutions: [{ method: "use-item", methodId: 7, parameter: STONE, condition: { kind: "item", item: STONE }, into: 6 }] },
    { id: 64, evolutions: [{ method: "trade", methodId: 5, parameter: 0, condition: { kind: "none" }, into: 65 }] },
  ],
  machines: [],
  items: [
    { id: EVERSTONE, holdEffect: { id: 64, parameter: 0 } },
    { id: POTION, holdEffect: { id: 0, parameter: 0 } },
  ],
});

const member = (species: number, level: number, held?: number): PartyMember => ({ species, level, moves: [33], hp: 20, friendship: 70, experience: expForLevel("medium-fast", level), ivs: stats(31), evs: stats(0), nature: 0, ...(held ? { held } : {}) });

function game(m: PartyMember) {
  const p = createProgression({ data: DATA, inCombat: () => false, active: () => undefined, refresh: () => {} });
  const learner = { playerId: 1, progress: { party: [m], pending: [] as PartyMember[] as never[], pokedex: { seen: [], caught: [] } }, send: () => {} };
  p.join(learner);
  const evolves = () => learner.progress.pending.some((i: { kind: string }) => i.kind === "evolve");
  return { p, evolves };
}

describe("the Everstone (spec 030.1)", () => {
  it("stops an evolution by level; another held item does not", () => {
    const held = game(member(1, 29, EVERSTONE));
    held.p.useItem(1, 0, { kind: "level" });
    expect(held.evolves()).toBe(false);
    const other = game(member(1, 29, POTION));
    other.p.useItem(1, 0, { kind: "level" });
    expect(other.evolves()).toBe(true);
  });

  it("stops an evolution by trade, except Kadabra's", () => {
    const held = game(member(3, 30, EVERSTONE));
    held.p.traded(1, 0);
    expect(held.evolves()).toBe(false);
    const kadabra = game(member(64, 30, EVERSTONE));
    kadabra.p.traded(1, 0);
    expect(kadabra.evolves()).toBe(true);
  });

  it("does not stop an evolution by using an item", () => {
    const g = game(member(5, 30, EVERSTONE));
    expect(g.p.useItem(1, 0, { kind: "evolve", item: STONE })).toBe(true);
    expect(g.evolves()).toBe(true);
  });
});
