import type { DuelRules, NoticeCode, ServerMessage } from "@soulsilver/shared/game";

// The duel flow (spec 028.5): an invitation with rules to a player nearby, then a fight in an arena of its own,
// each player controlling their own Pokémon. The session puts the parties in and gives them back: nothing is won
// or lost, so the flow here only says who began, who lost and when to give everything back.

type DuelState = Extract<ServerMessage, { type: "duelState" }>;
type ArenaPlace = NonNullable<DuelState["arena"]>;

export interface DuelsOptions {
  /** In combat, a cutscene or a trade: cannot be invited, and an invitation is withdrawn. */
  busy(playerId: number): boolean;
  near(a: number, b: number): boolean;
  send(playerId: number, msg: DuelState): void;
  /** Sets both parties up and sends them out; the arena, or undefined when the fight cannot begin. */
  begin(a: number, b: number, rules: DuelRules): ArenaPlace | undefined;
  /** The fight is over: both parties back as they were before it. */
  finish(a: number, b: number): void;
}

interface Duel {
  /** [inviter, invited] */
  who: [number, number];
  rules: DuelRules;
  arena: ArenaPlace | undefined;
}

export function createDuels(options: DuelsOptions) {
  const byPlayer = new Map<number, Duel>();
  const other = (d: Duel, id: number) => (d.who[0] === id ? d.who[1] : d.who[0]);

  function sendTo(d: Duel, id: number, extra: Partial<DuelState> = {}): void {
    const phase = d.arena ? "fighting" : id === d.who[0] ? "waiting" : "invited";
    options.send(id, { type: "duelState", phase, partner: other(d, id), rules: d.rules, ...(d.arena ? { arena: d.arena } : {}), ...extra });
  }

  /** Ends `d`; `loser` lost it, or nobody did (cancelled before the fight, aborted during it). */
  function end(d: Duel, loser?: number): void {
    for (const id of d.who) byPlayer.delete(id);
    if (d.arena) options.finish(d.who[0], d.who[1]);
    for (const id of d.who) {
      const result = loser === undefined ? (d.arena ? "aborted" : "cancelled") : id === loser ? "lost" : "won";
      options.send(id, { type: "duelState", phase: "ended", partner: other(d, id), rules: d.rules, result });
    }
  }

  return {
    invite(from: number, to: number, rules: DuelRules): NoticeCode | undefined {
      if (from === to) return "action-refused";
      if (byPlayer.has(from) || byPlayer.has(to) || options.busy(from) || options.busy(to)) return "trade-busy";
      if (!options.near(from, to)) return "trade-far";
      const d: Duel = { who: [from, to], rules, arena: undefined };
      byPlayer.set(from, d);
      byPlayer.set(to, d);
      for (const id of d.who) sendTo(d, id);
      return undefined;
    },
    answer(id: number, accept: boolean): boolean {
      const d = byPlayer.get(id);
      if (!d || d.arena || d.who[1] !== id) return false;
      if (!accept) {
        end(d);
        return true;
      }
      const arena = options.begin(d.who[0], d.who[1], d.rules);
      if (!arena) {
        for (const p of d.who) byPlayer.delete(p);
        for (const p of d.who) options.send(p, { type: "duelState", phase: "ended", partner: other(d, p), rules: d.rules, result: "aborted" });
        return true;
      }
      d.arena = arena;
      for (const p of d.who) sendTo(d, p);
      return true;
    },
    /** This player's last Pokémon in the duel fainted. */
    defeated(id: number): void {
      const d = byPlayer.get(id);
      if (d?.arena) end(d, id);
    },
    /** Backs out of an invitation, or leaves mid-fight (the session, on a disconnect). */
    cancel(id: number): void {
      const d = byPlayer.get(id);
      if (d) end(d);
    },
    /** Every tick: an invitation goes once a side gets busy or walks away. A fight holds them in its arena. */
    check(): void {
      for (const d of new Set(byPlayer.values())) if (!d.arena && (d.who.some((id) => options.busy(id)) || !options.near(d.who[0], d.who[1]))) end(d);
    },
    of: (id: number): Duel | undefined => byPlayer.get(id),
  };
}

export type Duels = ReturnType<typeof createDuels>;
