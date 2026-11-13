import type { ServerMessage } from "@soulsilver/shared/game";
import { expForLevel, expGain } from "@soulsilver/shared/progression";
import type { PartyMember } from "@soulsilver/shared/save";
import { describe, expect, it } from "vitest";
import { buildProgressionData, createProgression } from "../src/progression";

// Spec 028.6: cooperative experience. Every player whose Pokémon fought a wild one gets the whole experience
// computed for them, as if alone: it is never split between players, only among that player's own participants.

const stats = (v: number) => ({ hp: v, attack: v, defense: v, speed: v, specialAttack: v, specialDefense: v });
const WILD = 16;
const DATA = buildProgressionData({
  species: [
    { id: WILD, baseStats: stats(40), baseExperience: 50, evYield: stats(0), growthRate: "medium-fast", baseFriendship: 70 },
    { id: 155, baseStats: stats(45), baseExperience: 65, evYield: stats(0), growthRate: "medium-fast", baseFriendship: 70 },
  ],
  learnsets: [{ id: 155, levelUp: [{ level: 1, move: 33 }], machines: [] }],
  evolutions: [],
  machines: [],
});
const WILD_ID = 99;
const WILD_LEVEL = 10;
const LEVEL = 20;
const member = (): PartyMember => ({ species: 155, level: LEVEL, moves: [33], hp: 30, friendship: 70, experience: expForLevel("medium-fast", LEVEL), ivs: stats(31), evs: stats(0), nature: 0 });

/** `players`: for each player, the party indexes that go out against the wild one (none: that player stays out of it). */
function fight(players: number[][]) {
  const out = new Map<number, number | undefined>();
  const p = createProgression({ data: DATA, inCombat: (id) => out.get(id) !== undefined, active: (id) => out.get(id), refresh: () => {} });
  const learners = players.map((_, n) => {
    const got: ServerMessage[] = [];
    const learner = { playerId: n + 1, progress: { party: [member(), member(), member()], pending: [] as never[], pokedex: { seen: [], caught: [] } }, send: (m: ServerMessage) => got.push(m) };
    p.join(learner);
    return learner;
  });
  // Each sends out its members one after another, hitting the wild one with each.
  const longest = Math.max(...players.map((x) => x.length));
  for (let k = 0; k < longest; k++) {
    players.forEach((indexes, n) => out.set(n + 1, indexes[k] ?? indexes.at(-1)));
    p.step();
    players.forEach((indexes, n) => {
      if (indexes.length) p.engage(n + 1, WILD_ID);
    });
  }
  p.faint(WILD_ID, WILD, WILD_LEVEL);
  const gained = learners.map((l) => l.progress.party.map((m) => m.experience - expForLevel("medium-fast", LEVEL)));
  return { gained };
}

/** What a player alone with `participants` of their own out gets for each of them. */
const alone = (participants: number) => expGain({ baseExperience: 50, level: WILD_LEVEL, participants, trainer: false });

describe("cooperative experience (spec 028.6)", () => {
  it("with 2 players, each gets the whole experience, as if alone", () => {
    const { gained } = fight([[0], [0]]);
    expect(gained).toEqual([
      [alone(1), 0, 0],
      [alone(1), 0, 0],
    ]);
    expect(alone(1)).toBeGreaterThan(0);
  });

  it("with 4 players, each gets the whole experience, as if alone", () => {
    const { gained } = fight([[0], [0], [0], [0]]);
    expect(gained).toEqual([0, 1, 2, 3].map(() => [alone(1), 0, 0]));
  });

  it("the split is only among a player's own Pokémon: 2 out for one player, 1 for the other", () => {
    const { gained } = fight([[0, 1], [0]]);
    expect(gained).toEqual([
      [alone(2), alone(2), 0],
      [alone(1), 0, 0],
    ]);
  });

  it("with 4 players and different numbers out, nobody's share depends on the others", () => {
    const { gained } = fight([[0, 1, 2], [0], [0, 1], [2]]);
    expect(gained).toEqual([
      [alone(3), alone(3), alone(3)],
      [alone(1), 0, 0],
      [alone(2), alone(2), 0],
      [0, 0, alone(1)],
    ]);
  });

  it("a player in the session who did not fight gets nothing", () => {
    const { gained } = fight([[0], [], [0], []]);
    expect(gained).toEqual([[alone(1), 0, 0], [0, 0, 0], [alone(1), 0, 0], [0, 0, 0]]);
  });
});
