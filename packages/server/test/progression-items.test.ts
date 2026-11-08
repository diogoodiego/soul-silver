import type { ServerMessage } from "@soulsilver/shared/game";
import { expForLevel } from "@soulsilver/shared/progression";
import type { PartyMember } from "@soulsilver/shared/save";
import { describe, expect, it } from "vitest";
import { buildProgressionData, createProgression } from "../src/progression";

// Spec 027, US4: Rare Candy, evolution stones and TMs/HMs, through the same queue as levels (spec 016).

const stats = (v: number) => ({ hp: v, attack: v, defense: v, speed: v, specialAttack: v, specialDefense: v });
const FIRE_STONE = 82;
const DATA = buildProgressionData({
  species: [
    { id: 37, baseStats: stats(40), baseExperience: 63, evYield: stats(0), growthRate: "medium-fast", baseFriendship: 70 },
    { id: 38, baseStats: stats(70), baseExperience: 178, evYield: stats(0), growthRate: "medium-fast", baseFriendship: 70 },
    { id: 155, baseStats: stats(45), baseExperience: 65, evYield: stats(0), growthRate: "medium-slow", baseFriendship: 70 },
  ],
  learnsets: [
    { id: 37, levelUp: [{ level: 1, move: 52 }], machines: [70] },
    { id: 155, levelUp: [{ level: 1, move: 33 }, { level: 6, move: 108 }], machines: [] },
  ],
  evolutions: [{ id: 37, evolutions: [{ method: "use-item", methodId: 7, parameter: FIRE_STONE, condition: { kind: "item", item: FIRE_STONE }, into: 38 }] }],
  machines: [
    { id: 70, kind: "tm", number: 70, move: 148 },
    { id: 93, kind: "hm", number: 1, move: 15 },
  ],
});

const member = (species: number, level: number, moves = [52]): PartyMember => ({
  species,
  level,
  moves,
  hp: 20,
  friendship: 70,
  experience: expForLevel(species === 155 ? "medium-slow" : "medium-fast", level),
  ivs: stats(31),
  evs: stats(0),
  nature: 0,
});

function game(party: PartyMember[]) {
  const got: ServerMessage[] = [];
  const pending: { kind: string }[] = [];
  const p = createProgression({ data: DATA, inCombat: () => false, active: () => undefined, refresh: () => {} });
  const learner = { playerId: 1, progress: { party, pending: pending as never[], pokedex: { seen: [], caught: [] } }, send: (m: ServerMessage) => got.push(m) };
  p.join(learner);
  return { p, learner, got };
}

describe("items through progression", () => {
  it("a Rare Candy queues one level, with its moves, and raises the experience to that level", () => {
    const g = game([member(155, 5, [33])]);
    expect(g.p.useItem(1, 0, { kind: "level" })).toBe(true);
    expect(g.learner.progress.pending).toEqual([{ kind: "level-up", member: 0, level: 6 }, { kind: "learn", member: 0, move: 108 }]);
    expect(g.learner.progress.party[0]!.experience).toBe(expForLevel("medium-slow", 6));
  });

  it("refuses a Rare Candy at level 100", () => {
    expect(game([member(155, 100, [33])]).p.useItem(1, 0, { kind: "level" })).toBe(false);
  });

  it("a stone evolves only the species that evolves with it", () => {
    const g = game([member(37, 10), member(155, 10, [33])]);
    expect(g.p.useItem(1, 1, { kind: "evolve", item: FIRE_STONE })).toBe(false);
    expect(g.p.useItem(1, 0, { kind: "evolve", item: FIRE_STONE + 1 })).toBe(false);
    expect(g.p.useItem(1, 0, { kind: "evolve", item: FIRE_STONE })).toBe(true);
    expect(g.learner.progress.pending).toEqual([{ kind: "evolve", member: 0, into: 38 }]);
  });

  it("a machine teaches a compatible Pokémon a move it does not know; TM70 is machine 70", () => {
    const g = game([member(37, 10), member(155, 10, [33])]);
    expect(g.p.machineMove(328 + 69)).toBe(148);
    expect(g.p.machineMove(420)).toBe(15);
    expect(g.p.machineMove(17)).toBeUndefined();
    expect(g.p.useItem(1, 1, { kind: "learn", machine: 70 })).toBe(false);
    expect(g.p.useItem(1, 0, { kind: "learn", machine: 70 })).toBe(true);
    expect(g.learner.progress.pending).toEqual([{ kind: "learn", member: 0, move: 148 }]);
  });

  it("refuses a move the Pokémon already knows, and a member that does not exist", () => {
    const g = game([member(37, 10, [52, 148])]);
    expect(g.p.useItem(1, 0, { kind: "learn", machine: 70 })).toBe(false);
    expect(g.p.useItem(1, 3, { kind: "level" })).toBe(false);
  });
});
