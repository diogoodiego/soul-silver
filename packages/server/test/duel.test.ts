import type { DuelRules, ServerMessage } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { createDuels } from "../src/duel";

// Spec 028.5: the duel flow as a state machine, without the network (contracts/protocol-v24.md).

type State = Extract<ServerMessage, { type: "duelState" }>;
const A = 1;
const B = 2;
const C = 3;
const RULES: DuelRules = { level: "50", team: 2 };

function setup(beginOk = true) {
  const sent = new Map<number, State[]>();
  const busy = new Set<number>();
  const far = new Set<number>();
  const begun: [number, number, DuelRules][] = [];
  const finished: [number, number][] = [];
  const duels = createDuels({
    busy: (id) => busy.has(id),
    near: (a, b) => !far.has(a) && !far.has(b),
    send: (id, msg) => sent.set(id, [...(sent.get(id) ?? []), msg]),
    begin: (a, b, rules) => (begun.push([a, b, rules]), beginOk ? { area: "a", x: 10, y: 20, radiusPx: 64 } : undefined),
    finish: (a, b) => void finished.push([a, b]),
  });
  const last = (id: number) => sent.get(id)?.at(-1);
  return { duels, busy, far, last, begun, finished };
}

describe("duel state machine (spec 028.5)", () => {
  it("an invitation shows the rules to both, waiting and invited", () => {
    const t = setup();
    expect(t.duels.invite(A, B, RULES)).toBeUndefined();
    expect(t.last(A)).toEqual({ type: "duelState", phase: "waiting", partner: B, rules: RULES });
    expect(t.last(B)).toEqual({ type: "duelState", phase: "invited", partner: A, rules: RULES });
  });

  it("accepted, the fight begins in the arena the session gives, with the chosen rules", () => {
    const t = setup();
    t.duels.invite(A, B, RULES);
    t.duels.answer(B, true);
    expect(t.begun).toEqual([[A, B, RULES]]);
    expect(t.last(A)).toMatchObject({ phase: "fighting", arena: { area: "a", x: 10, y: 20, radiusPx: 64 } });
    expect(t.last(B)?.phase).toBe("fighting");
  });

  it("the one left without a Pokémon loses, the other wins, and both get everything back", () => {
    const t = setup();
    t.duels.invite(A, B, RULES);
    t.duels.answer(B, true);
    t.duels.defeated(B);
    expect([t.last(A)?.result, t.last(B)?.result]).toEqual(["won", "lost"]);
    expect(t.finished).toEqual([[A, B]]);
    expect(t.duels.of(A)).toBeUndefined();
  });

  it("declined or cancelled before the fight, nothing begins", () => {
    const t = setup();
    t.duels.invite(A, B, RULES);
    t.duels.answer(B, false);
    expect(t.last(A)).toMatchObject({ phase: "ended", result: "cancelled" });
    t.duels.invite(A, B, RULES);
    t.duels.cancel(A);
    expect(t.last(B)).toMatchObject({ phase: "ended", result: "cancelled" });
    expect(t.begun).toEqual([]);
    expect(t.finished).toEqual([]);
  });

  it("a player leaving mid-fight aborts it, and both still get everything back", () => {
    const t = setup();
    t.duels.invite(A, B, RULES);
    t.duels.answer(B, true);
    t.duels.cancel(B);
    expect(t.last(A)).toMatchObject({ phase: "ended", result: "aborted" });
    expect(t.finished).toEqual([[A, B]]);
  });

  it("a fight the session cannot begin (no Pokémon to send out) ends aborted, with nothing to give back", () => {
    const t = setup(false);
    t.duels.invite(A, B, RULES);
    t.duels.answer(B, true);
    expect(t.last(A)).toMatchObject({ phase: "ended", result: "aborted" });
    expect(t.finished).toEqual([]);
    expect(t.duels.of(B)).toBeUndefined();
  });

  it("refuses a partner far away, busy (combat, cutscene, trade), already in a duel, or oneself", () => {
    const t = setup();
    t.far.add(B);
    expect(t.duels.invite(A, B, RULES)).toBe("trade-far");
    t.far.clear();
    t.busy.add(B);
    expect(t.duels.invite(A, B, RULES)).toBe("trade-busy");
    t.busy.clear();
    t.duels.invite(A, B, RULES);
    expect(t.duels.invite(C, B, RULES)).toBe("trade-busy");
    expect(t.duels.invite(C, C, RULES)).toBe("action-refused");
  });

  it("an invitation is withdrawn once one side gets busy or walks away; a fight is not (both are in combat)", () => {
    const t = setup();
    t.duels.invite(A, B, RULES);
    t.far.add(B);
    t.duels.check();
    expect(t.last(A)).toMatchObject({ phase: "ended", result: "cancelled" });
    t.far.clear();
    t.duels.invite(A, B, RULES);
    t.duels.answer(B, true);
    t.busy.add(A);
    t.busy.add(B);
    t.duels.check();
    expect(t.last(A)?.phase).toBe("fighting");
  });
});
