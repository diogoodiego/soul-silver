import type { NoticeCode, ServerMessage, TradeOffer } from "@soulsilver/shared/game";

// The trade flow (spec 028.2): a proposal to a player nearby, both offers on one screen, both confirm,
// then both confirm again. Any offer change clears the confirmations. The last confirmation commits (spec 028.3).

type TradeState = Extract<ServerMessage, { type: "tradeState" }>;

export interface TradesOptions {
  /** In combat, a cutscene or a duel: cannot start a trade, and an open one ends. */
  busy(playerId: number): boolean;
  /** Close enough to trade. */
  near(a: number, b: number): boolean;
  /** What a player can offer: the party size and the bag. */
  holdings(playerId: number): { party: number; bag: readonly { item: number; count: number }[] };
  send(playerId: number, msg: TradeState): void;
  /** Spec 028.3: applies both offers in one step; false when one is no longer held (the trade is cancelled). */
  commit?(a: number, giveA: TradeOffer, b: number, giveB: TradeOffer): boolean;
}

interface Trade {
  /** [proposer, partner] */
  who: [number, number];
  phase: "invited" | "open" | "final";
  offers: Map<number, TradeOffer>;
  confirmed: Set<number>;
}

const EMPTY: TradeOffer = { party: [], items: [] };

export function createTrades(options: TradesOptions) {
  const byPlayer = new Map<number, Trade>();
  const other = (t: Trade, id: number) => (t.who[0] === id ? t.who[1] : t.who[0]);

  function sendTo(t: Trade, id: number, phase?: TradeState["phase"]): void {
    const partner = other(t, id);
    const shown = phase ?? (t.phase === "invited" ? (id === t.who[0] ? "waiting" : "invited") : t.phase);
    options.send(id, { type: "tradeState", phase: shown, partner, mine: t.offers.get(id) ?? EMPTY, theirs: t.offers.get(partner) ?? EMPTY, confirmed: { mine: t.confirmed.has(id), theirs: t.confirmed.has(partner) } });
  }
  const sendBoth = (t: Trade, phase?: TradeState["phase"]) => t.who.forEach((id) => sendTo(t, id, phase));

  function end(t: Trade, phase: "done" | "cancelled"): void {
    for (const id of t.who) byPlayer.delete(id);
    sendBoth(t, phase);
  }

  /** Whether `offer` names party slots and bag items this player has, each once. */
  function holds(id: number, offer: TradeOffer): boolean {
    const { party, bag } = options.holdings(id);
    if (new Set(offer.party).size !== offer.party.length || offer.party.some((i) => i >= party)) return false;
    if (new Set(offer.items.map((i) => i.item)).size !== offer.items.length) return false;
    return offer.items.every((o) => (bag.find((b) => b.item === o.item)?.count ?? 0) >= o.count);
  }

  return {
    /** Starts a trade from `from` to `to`; the refusal, if any. */
    propose(from: number, to: number): NoticeCode | undefined {
      if (from === to) return "action-refused";
      if (byPlayer.has(from) || byPlayer.has(to) || options.busy(from) || options.busy(to)) return "trade-busy";
      if (!options.near(from, to)) return "trade-far";
      const t: Trade = { who: [from, to], phase: "invited", offers: new Map(), confirmed: new Set() };
      byPlayer.set(from, t);
      byPlayer.set(to, t);
      sendBoth(t);
      return undefined;
    },
    /** The invited player accepts or declines; whether there was an invitation to answer. */
    answer(id: number, accept: boolean): boolean {
      const t = byPlayer.get(id);
      if (!t || t.phase !== "invited" || t.who[1] !== id) return false;
      if (!accept) end(t, "cancelled");
      else {
        t.phase = "open";
        sendBoth(t);
      }
      return true;
    },
    /** Replaces this player's offer and clears both confirmations; false when refused. */
    offer(id: number, offer: TradeOffer): boolean {
      const t = byPlayer.get(id);
      if (!t || t.phase === "invited" || !holds(id, offer)) return false;
      t.offers.set(id, offer);
      t.confirmed.clear();
      t.phase = "open";
      sendBoth(t);
      return true;
    },
    /** One confirmation: both move the trade to the final step, then both again end it. */
    confirm(id: number): boolean {
      const t = byPlayer.get(id);
      if (!t || t.phase === "invited") return false;
      t.confirmed.add(id);
      if (t.confirmed.size < 2) sendBoth(t);
      else if (t.phase === "open") {
        t.phase = "final";
        t.confirmed.clear();
        sendBoth(t);
      } else {
        const [a, b] = t.who;
        const applied = options.commit?.(a, t.offers.get(a) ?? EMPTY, b, t.offers.get(b) ?? EMPTY) ?? true;
        end(t, applied ? "done" : "cancelled");
      }
      return true;
    },
    /** Either side backs out, declines, or leaves the session. */
    cancel(id: number): void {
      const t = byPlayer.get(id);
      if (t) end(t, "cancelled");
    },
    /** Every tick: a trade ends when one side gets busy or the two drift apart. */
    check(): void {
      for (const t of new Set(byPlayer.values())) if (t.who.some((id) => options.busy(id)) || !options.near(t.who[0], t.who[1])) end(t, "cancelled");
    },
    /** The trade this player is in, if any. */
    of: (id: number): Trade | undefined => byPlayer.get(id),
  };
}

export type Trades = ReturnType<typeof createTrades>;
