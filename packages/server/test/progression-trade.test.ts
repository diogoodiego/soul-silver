import type { ServerMessage } from "@soulsilver/shared/game";
import { expForLevel } from "@soulsilver/shared/progression";
import type { PartyMember } from "@soulsilver/shared/save";
import { describe, expect, it } from "vitest";
import { buildProgressionData, createProgression } from "../src/progression";
import { setup } from "./harness";
import { BUNDLED_COMPANION_CONTENT, buildCompanionData } from "../src/companion-loader";
import { combatData } from "./combat-fixture";

// Spec 028.4: trade evolutions from the extracted data, after a trade, through the same queue as levels (spec 016).
// Synthetic species: 1 evolves into 2 by trade; 3 into 4 by trade holding item 50; 5 has no trade evolution.

const stats = (v: number) => ({ hp: v, attack: v, defense: v, speed: v, specialAttack: v, specialDefense: v });
const COAT = 50;
const OTHER = 51;
const DATA = buildProgressionData({
  species: [1, 2, 3, 4, 5].map((id) => ({ id, baseStats: stats(40 + id * 10), baseExperience: 60, evYield: stats(0), growthRate: "medium-fast" as const, baseFriendship: 70 })),
  learnsets: [1, 2, 3, 4, 5].map((id) => ({ id, levelUp: [{ level: 1, move: 33 }], machines: [] })),
  evolutions: [
    { id: 1, evolutions: [{ method: "trade", methodId: 5, parameter: 0, condition: { kind: "none" }, into: 2 }] },
    { id: 3, evolutions: [{ method: "trade-item", methodId: 6, parameter: COAT, condition: { kind: "item", item: COAT }, into: 4 }] },
    { id: 5, evolutions: [{ method: "level", methodId: 4, parameter: 30, condition: { kind: "level", level: 30 }, into: 1 }] },
  ],
  machines: [],
});

const member = (species: number, held?: number): PartyMember => ({ species, level: 30, moves: [33], hp: 20, friendship: 70, experience: expForLevel("medium-fast", 30), ivs: stats(31), evs: stats(0), nature: 0, ...(held ? { held } : {}) });

function game(party: PartyMember[]) {
  const got: ServerMessage[] = [];
  const p = createProgression({ data: DATA, inCombat: () => false, active: () => undefined, refresh: () => {} });
  const learner = { playerId: 1, progress: { party, pending: [] as never[], pokedex: { seen: [], caught: [] } }, send: (m: ServerMessage) => got.push(m) };
  p.join(learner);
  /** Answers the evolution the queue offers. */
  const answer = (accept: boolean) => {
    p.step();
    p.answer(1, { type: "evolve-answer", accept });
  };
  return { p, learner, got, answer, party };
}

describe("trade evolution through a session trade (spec 028.4)", () => {
  it("the receiver is offered the evolution, and the accepted species reaches the save; the sender's side does not evolve", () => {
    const t = setup({ progression: DATA, combat: combatData(), companion: buildCompanionData(BUNDLED_COMPANION_CONTENT), spawn: () => ({ area: "a", x: 160, y: 160 }) });
    const a = t.connect("Gold", undefined, { save: { party: [member(5), member(1)] } });
    const b = t.connect("Silver", undefined, { save: { party: [member(5), member(3, COAT)] } });
    const send = (c: typeof a, msg: unknown) => (c.conn.send(msg), t.session.step());
    send(a, { type: "trade-propose", to: b.welcome!.playerId });
    send(b, { type: "trade-answer", accept: true });
    send(a, { type: "trade-offer", offer: { party: [1], items: [] } });
    send(b, { type: "trade-offer", offer: { party: [1], items: [] } });
    for (const c of [a, b, a, b]) send(c, { type: "trade-confirm" });
    const offered = (c: typeof a) => c.got.filter((m): m is Extract<ServerMessage, { type: "progression" }> => m.type === "progression").map((m) => m.item);
    expect(offered(b)).toContainEqual({ kind: "evolve", member: 1, into: 2 });
    expect(offered(a)).toContainEqual({ kind: "evolve", member: 1, into: 4 });
    send(b, { type: "evolve-answer", accept: true });
    send(a, { type: "evolve-answer", accept: true });
    t.session.close("closed-by-host");
    const last = (c: typeof a) => c.saves().at(-1)!.save.party;
    expect(last(b).map((m) => m.species)).toEqual([5, 2]);
    expect(last(a).map((m) => [m.species, m.held])).toEqual([[5, undefined], [4, undefined]]);
  });
});

describe("trade evolutions (spec 028.4)", () => {
  it("a trade evolution is offered after the trade and, accepted, changes the species", () => {
    const g = game([member(5), member(1)]);
    g.p.traded(1, 1);
    expect(g.learner.progress.pending).toEqual([{ kind: "evolve", member: 1, into: 2 }]);
    g.answer(true);
    expect(g.party[1]!.species).toBe(2);
  });

  it("an evolution that needs a held item happens with it, and uses it up", () => {
    const g = game([member(3, COAT)]);
    g.p.traded(1, 0);
    g.answer(true);
    expect(g.party[0]!.species).toBe(4);
    expect(g.party[0]!.held).toBeUndefined();
  });

  it("without the held item, or with another one, nothing is offered", () => {
    for (const held of [undefined, OTHER]) {
      const g = game([member(3, held)]);
      g.p.traded(1, 0);
      expect(g.learner.progress.pending).toEqual([]);
    }
  });

  it("a Pokémon with no trade evolution does not evolve", () => {
    const g = game([member(5)]);
    g.p.traded(1, 0);
    expect(g.learner.progress.pending).toEqual([]);
  });

  it("declined, the species and the held item stay", () => {
    const g = game([member(3, COAT)]);
    g.p.traded(1, 0);
    g.answer(false);
    expect(g.party[0]).toMatchObject({ species: 3, held: COAT });
  });
});
