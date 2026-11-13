import type { ServerMessage } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { createTrades } from "../src/trade";

// Spec 028.2: the trade flow as a state machine, without the network (contracts/protocol-v23.md).

type State = Extract<ServerMessage, { type: "tradeState" }>;
const A = 1;
const B = 2;
const C = 3;

function setup() {
  const sent = new Map<number, State[]>();
  const busy = new Set<number>();
  const far = new Set<number>();
  const trades = createTrades({
    busy: (id) => busy.has(id),
    near: (a, b) => !far.has(a) && !far.has(b),
    holdings: () => ({ party: 3, bag: [{ item: 17, count: 5 }] }),
    send: (id, msg) => sent.set(id, [...(sent.get(id) ?? []), msg]),
  });
  const last = (id: number) => sent.get(id)?.at(-1);
  /** A and B in an open trade. */
  const open = () => {
    expect(trades.propose(A, B)).toBeUndefined();
    expect(trades.answer(B, true)).toBe(true);
  };
  return { trades, sent, busy, far, last, open };
}

describe("trade state machine (spec 028.2)", () => {
  it("a proposal waits for the partner, who sees the invitation", () => {
    const t = setup();
    expect(t.trades.propose(A, B)).toBeUndefined();
    expect(t.last(A)).toMatchObject({ phase: "waiting", partner: B });
    expect(t.last(B)).toMatchObject({ phase: "invited", partner: A });
  });

  it("accepted, both see the open trade with empty offers", () => {
    const t = setup();
    t.open();
    for (const [me, other] of [[A, B], [B, A]] as const) expect(t.last(me)).toEqual({ type: "tradeState", phase: "open", partner: other, mine: { party: [], items: [] }, theirs: { party: [], items: [] }, confirmed: { mine: false, theirs: false } });
  });

  it("offers show on both sides", () => {
    const t = setup();
    t.open();
    expect(t.trades.offer(A, { party: [0], items: [{ item: 17, count: 2 }] })).toBe(true);
    expect(t.last(A)?.mine).toEqual({ party: [0], items: [{ item: 17, count: 2 }] });
    expect(t.last(B)?.theirs).toEqual({ party: [0], items: [{ item: 17, count: 2 }] });
  });

  it("both confirm, then both confirm again: done", () => {
    const t = setup();
    t.open();
    t.trades.offer(A, { party: [1], items: [] });
    t.trades.confirm(A);
    expect(t.last(B)).toMatchObject({ phase: "open", confirmed: { mine: false, theirs: true } });
    t.trades.confirm(B);
    expect(t.last(A)).toMatchObject({ phase: "final", confirmed: { mine: false, theirs: false } });
    t.trades.confirm(B);
    t.trades.confirm(A);
    expect([t.last(A)?.phase, t.last(B)?.phase]).toEqual(["done", "done"]);
    expect(t.trades.of(A)).toBeUndefined();
  });

  it("changing the offer clears both confirmations, also at the final step", () => {
    const t = setup();
    t.open();
    t.trades.confirm(A);
    t.trades.offer(B, { party: [0], items: [] });
    expect(t.last(A)).toMatchObject({ phase: "open", confirmed: { mine: false, theirs: false } });
    t.trades.confirm(A);
    t.trades.confirm(B);
    t.trades.confirm(A);
    t.trades.offer(A, { party: [], items: [{ item: 17, count: 1 }] });
    expect(t.last(B)).toMatchObject({ phase: "open", confirmed: { mine: false, theirs: false } });
  });

  it.each([
    ["invited", (t: ReturnType<typeof setup>) => void t.trades.propose(A, B)],
    ["open", (t: ReturnType<typeof setup>) => t.open()],
    ["final", (t: ReturnType<typeof setup>) => (t.open(), t.trades.confirm(A), t.trades.confirm(B))],
  ])("cancelling while %s ends it for both, who are free again", (_, reach) => {
    const t = setup();
    reach(t);
    t.trades.cancel(B);
    expect([t.last(A)?.phase, t.last(B)?.phase]).toEqual(["cancelled", "cancelled"]);
    expect(t.trades.propose(A, C)).toBeUndefined();
  });

  it("declining the invitation cancels it", () => {
    const t = setup();
    t.trades.propose(A, B);
    t.trades.answer(B, false);
    expect(t.last(A)?.phase).toBe("cancelled");
  });

  it("refuses a partner far away, busy (combat, cutscene, duel), already trading, or oneself", () => {
    const t = setup();
    t.far.add(B);
    expect(t.trades.propose(A, B)).toBe("trade-far");
    t.far.clear();
    t.busy.add(B);
    expect(t.trades.propose(A, B)).toBe("trade-busy");
    expect(t.trades.propose(B, A)).toBe("trade-busy");
    t.busy.clear();
    t.trades.propose(A, B);
    expect(t.trades.propose(C, B)).toBe("trade-busy");
    expect(t.trades.propose(C, C)).toBe("action-refused");
  });

  it("cancels an open trade once one side gets busy or walks away", () => {
    const t = setup();
    t.open();
    t.busy.add(A);
    t.trades.check();
    expect(t.last(B)?.phase).toBe("cancelled");
    t.busy.clear();
    t.open();
    t.far.add(B);
    t.trades.check();
    expect(t.last(A)?.phase).toBe("cancelled");
  });

  it("refuses offers it cannot hold: a party slot out of range or repeated, more items than in the bag, or before the trade opens", () => {
    const t = setup();
    t.trades.propose(A, B);
    expect(t.trades.offer(A, { party: [0], items: [] })).toBe(false);
    t.trades.answer(B, true);
    expect(t.trades.offer(A, { party: [3], items: [] })).toBe(false);
    expect(t.trades.offer(A, { party: [0, 0], items: [] })).toBe(false);
    expect(t.trades.offer(A, { party: [], items: [{ item: 17, count: 6 }] })).toBe(false);
    expect(t.trades.offer(A, { party: [], items: [{ item: 4, count: 1 }] })).toBe(false);
    expect(t.last(B)?.theirs).toEqual({ party: [], items: [] });
  });

  it("leaving the session cancels the trade for the partner", () => {
    const t = setup();
    t.open();
    t.trades.cancel(A);
    expect(t.last(B)?.phase).toBe("cancelled");
  });
});
