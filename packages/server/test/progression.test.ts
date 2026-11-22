import type { ServerMessage } from "@soulsilver/shared/game";
import { expForLevel } from "@soulsilver/shared/progression";
import type { PartyMember, Save } from "@soulsilver/shared/save";
import { describe, expect, it } from "vitest";
import { buildProgressionData, createProgression, type Learner } from "../src/progression";

// Spec 016: experience on a KO, the queue resolved only out of combat, moves and evolution.

const base = (hp: number, attack: number, defense: number, speed: number, specialAttack: number, specialDefense: number) => ({ hp, attack, defense, speed, specialAttack, specialDefense });
const ev = (patch: Partial<ReturnType<typeof base>> = {}) => ({ ...base(0, 0, 0, 0, 0, 0), ...patch });
const all = (v: number) => base(v, v, v, v, v, v);

/** Game facts for a few species (base stats, base experience, EV yield, curve); no ROM data. */
const DATA = buildProgressionData({
  species: [
    { id: 155, baseStats: base(39, 52, 43, 65, 60, 50), baseExperience: 65, evYield: ev({ speed: 1 }), growthRate: "medium-slow", baseFriendship: 70 },
    { id: 156, baseStats: base(58, 64, 58, 80, 80, 65), baseExperience: 142, evYield: ev({ speed: 1, specialAttack: 1 }), growthRate: "medium-slow", baseFriendship: 70 },
    { id: 161, baseStats: base(35, 46, 34, 20, 35, 45), baseExperience: 57, evYield: ev({ attack: 1 }), growthRate: "medium-fast", baseFriendship: 70 },
    { id: 95, baseStats: base(35, 45, 160, 70, 30, 45), baseExperience: 108, evYield: ev({ defense: 1 }), growthRate: "medium-fast", baseFriendship: 70 },
  ],
  learnsets: [
    { id: 155, levelUp: [{ level: 1, move: 33 }, { level: 12, move: 98 }, { level: 13, move: 43 }] },
    { id: 156, levelUp: [{ level: 14, move: 172 }] },
    { id: 95, levelUp: [{ level: 1, move: 33 }] },
  ],
  evolutions: [{ id: 155, evolutions: [{ method: "level", methodId: 4, parameter: 14, condition: { kind: "level", level: 14 }, into: 156 }] }],
});

const member = (species: number, level: number, extra: Partial<PartyMember> = {}): PartyMember => ({
  species,
  level,
  moves: [33],
  hp: 20,
  friendship: 70,
  experience: expForLevel(species === 95 ? "medium-fast" : "medium-slow", level),
  ivs: all(31),
  evs: all(0),
  nature: 0,
  ...extra,
});

/** Block C: Leer (43) and Smokescreen (108) are status moves, so special; Tackle, Scratch, Quick Attack and Ember are normal. */
const SPECIAL = (m: number) => m === 43 || m === 108;

function game(parties: PartyMember[][], pending: Save["pending"][] = [], special?: (m: number) => boolean) {
  const fighting = new Set<number>();
  const active = new Map<number, number>();
  const refreshed: number[] = [];
  const p = createProgression({ data: DATA, inCombat: (id) => fighting.has(id), active: (id) => active.get(id), refresh: (id) => refreshed.push(id), special });
  const learners = parties.map((party, i): Learner & { got: ServerMessage[] } => {
    const got: ServerMessage[] = [];
    return { playerId: i + 1, progress: { party, pending: pending[i] ?? [], pokedex: { seen: [], caught: [] } }, send: (m) => got.push(m), got };
  });
  for (const l of learners) p.join(l);
  return {
    p,
    learners,
    refreshed,
    /** Player `id` fights with party member `index` out; the wild 100 hits it. */
    fight(id: number, index: number) {
      fighting.add(id);
      active.set(id, index);
      p.step();
      p.engage(id, 100);
    },
    end(id: number) {
      fighting.delete(id);
      active.delete(id);
      p.step();
    },
    msgs: <T extends ServerMessage["type"]>(i: number, type: T) => learners[i]!.got.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type),
  };
}

describe("experience and level up (US1)", () => {
  it("credits Gen 4 experience and EVs on the KO, but shows the level up only after combat", () => {
    const g = game([[member(155, 13, { experience: 1600 })]]);
    g.fight(1, 0);
    // Onix level 14: 108 × 14 / 7 = 216 → 1816 ≥ 1612 (level 14).
    g.p.faint(100, 95, 14);
    const m = g.learners[0]!.progress.party[0]!;
    expect(m.experience).toBe(1816);
    expect(m.evs.defense).toBe(1);
    expect(g.msgs(0, "exp-gain")).toEqual([{ type: "exp-gain", partyIndex: 0, amount: 216 }]);
    g.p.step();
    expect(g.msgs(0, "progression")).toEqual([]);
    expect(m.level).toBe(13);
    g.end(1);
    expect(g.msgs(0, "progression")[0]).toMatchObject({ item: { kind: "level-up", member: 0, level: 14 }, stats: { hp: 39 } });
  });

  it("applies the level, stats and friendship on the ack, keeping the HP lost", () => {
    const g = game([[member(161, 4, { hp: 10, experience: 64 })]]);
    g.fight(1, 0);
    g.p.faint(100, 95, 5); // 77 → 141: level 5
    g.end(1);
    g.p.answer(1, { type: "progression-ack" });
    const m = g.learners[0]!.progress.party[0]!;
    expect(m).toMatchObject({ level: 5, friendship: 75 });
    // HP max 18 → 20 at IV 31: the 2 gained are added.
    expect(m.hp).toBe(12);
    expect(g.refreshed).toContain(1);
  });

  it("splits between the members that went out and have not fainted", () => {
    const party = [member(95, 10), member(95, 10), member(95, 10, { hp: 0 })];
    const g = game([party]);
    g.fight(1, 0);
    g.fight(1, 1);
    g.fight(1, 2);
    g.p.faint(100, 95, 14);
    expect(party.map((m) => m.experience - 1000)).toEqual([108, 108, 0]);
  });

  it("gives every player who fought the wild the whole share", () => {
    const g = game([[member(95, 10)], [member(95, 10)]]);
    g.fight(1, 0);
    g.fight(2, 0);
    g.p.faint(100, 95, 14);
    expect(g.learners.map((l) => l.progress.party[0]!.experience)).toEqual([1216, 1216]);
  });

  it("gives no experience at level 100, but still EVs", () => {
    const g = game([[member(95, 100)]]);
    g.fight(1, 0);
    g.p.faint(100, 95, 14);
    expect(g.learners[0]!.progress.party[0]!).toMatchObject({ experience: 1000000, evs: { defense: 1 } });
    expect(g.msgs(0, "exp-gain")).toEqual([]);
  });

  it("does nothing for a wild nobody fought", () => {
    const g = game([[member(95, 10)]]);
    g.p.faint(100, 95, 14);
    expect(g.learners[0]!.progress.party[0]!.experience).toBe(1000);
  });

  it("queues each level once over several KOs", () => {
    const g = game([[member(95, 10)]]);
    g.fight(1, 0);
    g.p.faint(100, 95, 50); // +771 → 1771: level 12
    g.p.engage(1, 101);
    g.p.faint(101, 95, 50); // → 2542: level 13
    expect(g.learners[0]!.progress.pending).toEqual([
      { kind: "level-up", member: 0, level: 11 },
      { kind: "level-up", member: 0, level: 12 },
      { kind: "level-up", member: 0, level: 13 },
    ]);
  });

  it("sends a saved queue again on join (SC-006) and ignores answers in combat", () => {
    const g = game([[member(161, 5)]], [[{ kind: "level-up", member: 0, level: 6 }]]);
    g.p.step();
    expect(g.msgs(0, "progression")).toHaveLength(1);
    g.fight(1, 0);
    g.p.answer(1, { type: "progression-ack" });
    expect(g.learners[0]!.progress.party[0]!.level).toBe(5);
  });
});

describe("joining", () => {
  it("keeps migrated experience inside the level's range on the species' curve", () => {
    // v3 → v4 gives 12³ = 1728, already level 13 on Cyndaquil's medium-slow curve (1261).
    const g = game([[member(155, 12, { experience: 1728 }), member(155, 12, { experience: 0 })]]);
    expect(g.learners[0]!.progress.party.map((m) => m.experience)).toEqual([1260, 973]);
  });
});

describe("a fifth move (US2)", () => {
  it("learns at once with a free slot, after the ack", () => {
    const g = game([[member(155, 11, { experience: 900 })]]);
    g.fight(1, 0);
    g.p.faint(100, 95, 10); // +154 → 1054: level 12
    g.end(1);
    g.p.answer(1, { type: "progression-ack" });
    expect(g.msgs(0, "progression").at(-1)).toMatchObject({ item: { kind: "learn", move: 98 }, moves: [33] });
    g.p.answer(1, { type: "progression-ack" });
    expect(g.learners[0]!.progress.party[0]!.moves).toEqual([33, 98]);
  });

  it("with four moves, replaces the chosen one or keeps them all", () => {
    for (const [forget, moves] of [
      [2, [33, 52, 98, 10]],
      [null, [33, 52, 108, 10]],
    ] as const) {
      const g = game([[member(155, 11, { experience: 900, moves: [33, 52, 108, 10] })]]);
      g.fight(1, 0);
      g.p.faint(100, 95, 10);
      g.end(1);
      g.p.answer(1, { type: "progression-ack" });
      g.p.answer(1, { type: "progression-ack" }); // the wrong reply for a full move set: ignored
      expect(g.learners[0]!.progress.pending[0]).toMatchObject({ kind: "learn" });
      g.p.answer(1, { type: "learn-answer", forget });
      expect(g.learners[0]!.progress.party[0]!.moves).toEqual(moves);
      expect(g.learners[0]!.progress.pending).toEqual([]);
    }
  });
});

describe("moves by class (block C)", () => {
  /** A level 11 Cyndaquil about to reach 12 (Quick Attack, normal) or a level 12 one about to reach 13 (Leer, special). */
  function learning(moves: number[], to: 12 | 13) {
    const level = to - 1;
    const g = game([[member(155, level, { experience: expForLevel("medium-slow", to) - 100, moves })]], [], SPECIAL);
    g.fight(1, 0);
    g.p.faint(100, 95, 10);
    g.end(1);
    g.p.answer(1, { type: "progression-ack" });
    return { g, m: g.learners[0]!.progress.party[0]! };
  }

  it("adds a special to its free slot even with two normals known", () => {
    const { g, m } = learning([33, 10], 13);
    expect(g.msgs(0, "progression").at(-1)).toMatchObject({ item: { kind: "learn", move: 43 } });
    expect(g.msgs(0, "progression").at(-1)!.replaceable).toBeUndefined();
    g.p.answer(1, { type: "progression-ack" });
    expect(m.moves).toEqual([33, 10, 43]);
  });

  it("a third normal may only replace one of the two normals", () => {
    const { g, m } = learning([33, 10, 43, 108], 12);
    expect(g.msgs(0, "progression").at(-1)).toMatchObject({ item: { kind: "learn", move: 98 }, replaceable: [0, 1] });
    g.p.answer(1, { type: "learn-answer", forget: 2 }); // a special: refused, it still waits
    expect(m.moves).toEqual([33, 10, 43, 108]);
    expect(g.learners[0]!.progress.pending[0]).toMatchObject({ kind: "learn" });
    g.p.answer(1, { type: "learn-answer", forget: 0 });
    expect(m.moves).toEqual([98, 10, 43, 108]);
  });

  it("asks even with three moves when the class is full, and keeps normals first", () => {
    const { g, m } = learning([33, 43, 10], 12);
    expect(g.msgs(0, "progression").at(-1)).toMatchObject({ replaceable: [0, 2] });
    g.p.answer(1, { type: "learn-answer", forget: null });
    expect(m.moves).toEqual([33, 43, 10]);
    const later = learning([33, 43], 12);
    later.g.p.answer(1, { type: "progression-ack" });
    expect(later.m.moves).toEqual([33, 98, 43]);
  });
});

describe("level evolution (US3)", () => {
  function toFourteen(accept: boolean) {
    const g = game([[member(155, 13, { experience: 1600, hp: 30 })]]);
    g.fight(1, 0);
    g.p.faint(100, 95, 14);
    g.end(1);
    g.p.answer(1, { type: "progression-ack" });
    expect(g.msgs(0, "progression").at(-1)).toMatchObject({ item: { kind: "evolve", member: 0, into: 156 } });
    g.p.answer(1, { type: "evolve-answer", accept });
    return g;
  }

  it("Cyndaquil reaching 14 becomes Quilava, gains the HP difference and learns its move (SC-004)", () => {
    const g = toFourteen(true);
    const m = g.learners[0]!.progress.party[0]!;
    // HP: 30 → 32 at level 14 (max 37 → 39), then Quilava max 44: +5.
    expect(m).toMatchObject({ species: 156, level: 14, hp: 37 });
    expect(g.learners[0]!.progress.pokedex).toEqual({ seen: [156], caught: [156] });
    expect(g.msgs(0, "progression").at(-1)).toMatchObject({ item: { kind: "learn", move: 172 } });
  });

  it("cancelling keeps Cyndaquil, and the evolution comes back on the next level", () => {
    const g = toFourteen(false);
    const m = g.learners[0]!.progress.party[0]!;
    expect(m.species).toBe(155);
    expect(g.learners[0]!.progress.pending).toEqual([]);
    g.fight(1, 0);
    g.p.faint(100, 95, 15); // 1816 + 231 = 2047: level 15
    expect(g.learners[0]!.progress.pending.at(-1)).toEqual({ kind: "evolve", member: 0, into: 156 });
  });
});
