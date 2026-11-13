import type { DuelRules, ServerMessage } from "@soulsilver/shared/game";
import type { PartyMember, Save } from "@soulsilver/shared/save";
import { describe, expect, it } from "vitest";
import { BUNDLED_COMPANION_CONTENT, buildCompanionData } from "../src/companion-loader";
import { combatData, MOVES, SPECIES } from "./combat-fixture";
import { setup } from "./harness";

// Spec 028.5: a duel through the session, two fake clients, each one's own Pokémon. Neither save changes:
// no experience, no money, no HP, no item, no Pokédex entry, no move of the player, also with the party at level 50.

const member = (species: keyof typeof SPECIES, level: number, hp: number): PartyMember => ({ species: SPECIES[species].id, level, moves: [MOVES.tackle.id], hp, friendship: 70, experience: level ** 3, ivs: { hp: 31, attack: 31, defense: 31, speed: 31, specialAttack: 31, specialDefense: 31 }, evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 }, nature: 0 });
const START: Record<"Gold" | "Silver", Partial<Save>> = {
  Gold: { party: [member("cyndaquil", 12, 20), member("chikorita", 8, 25)], bag: [{ item: 17, count: 3 }], money: 1500 },
  Silver: { party: [member("chikorita", 30, 40), member("cyndaquil", 5, 0)], bag: [{ item: 4, count: 2 }], money: 800 },
};
/** What the duel must leave as it was. */
const kept = (s: Save) => ({ party: s.party, bag: s.bag, money: s.money, pokedex: s.pokedex, pending: s.pending, area: s.area, x: s.x, y: s.y });

function duel(rules: DuelRules) {
  const t = setup({ combat: combatData(), companion: buildCompanionData(BUNDLED_COMPANION_CONTENT), spawn: () => ({ area: "a", x: 160, y: 160 }) });
  const gold = t.connect("Gold", undefined, { save: START.Gold });
  const silver = t.connect("Silver", undefined, { save: START.Silver });
  // What each sent in its hello, as the server reads it back in its first periodic save.
  for (let i = 0; i < 700 && !(gold.saves().length && silver.saves().length); i++) {
    gold.input(i + 1, null);
    silver.input(i + 1, null);
    t.session.step();
  }
  const before = { Gold: kept(gold.saves().at(-1)!.save), Silver: kept(silver.saves().at(-1)!.save) };
  const send = (c: typeof gold, msg: unknown) => {
    c.conn.send(msg);
    t.session.step();
  };
  const state = (c: typeof gold) => c.got.filter((m): m is Extract<ServerMessage, { type: "duelState" }> => m.type === "duelState").at(-1);
  /** The Pokémon `c` has out in the duel. */
  const out = (c: typeof gold) => t.session.world.all().find((e) => e.kind === "pokemon" && t.session.combat?.get(e.id)?.owner === c.welcome!.playerId);
  /** Knocks out what `c` has out, as the other player's hits would. */
  const knockOut = (c: typeof gold) => {
    const e = out(c);
    if (e) t.session.combat!.get(e.id)!.hp = 0;
    for (let i = 0; i < 3; i++) t.session.step();
  };
  const after = () => {
    t.session.close("closed-by-host");
    return { Gold: kept(gold.saves().at(-1)!.save), Silver: kept(silver.saves().at(-1)!.save) };
  };
  send(gold, { type: "duel-invite", to: silver.welcome!.playerId, rules });
  send(silver, { type: "duel-answer", accept: true });
  return { ...t, gold, silver, before, state, out, knockOut, after, send };
}

describe("duel through the session (spec 028.5)", () => {
  it("at current levels: both fight with their own Pokémon, the loser loses nothing, the winner gains nothing", () => {
    const d = duel({ level: "current", team: 1 });
    expect([d.state(d.gold)?.phase, d.state(d.silver)?.phase]).toEqual(["fighting", "fighting"]);
    expect(d.out(d.gold)).toBeDefined();
    expect(d.out(d.silver)).toBeDefined();
    d.knockOut(d.gold);
    expect([d.state(d.gold)?.result, d.state(d.silver)?.result]).toEqual(["lost", "won"]);
    // No blackout: the loser stays where the duel was.
    expect(d.gold.got.some((m) => m.type === "blackout")).toBe(false);
    expect(d.after()).toEqual(d.before);
  });

  it("levelled to 50, with a team of 2: the duel's levels and HP never reach the saves", () => {
    const d = duel({ level: "50", team: 2 });
    const party = d.gold.got.filter((m): m is Extract<ServerMessage, { type: "party" }> => m.type === "party").at(-1)!.members;
    expect(party.map((m) => m.level)).toEqual([50, 50]);
    // A save goes out mid-duel (every 600 ticks): it holds the party from before the duel.
    // Both keep sending (as the host, Gold's silence would close the session).
    for (let i = 0; i < 620; i++) {
      d.gold.input(1000 + i, null);
      d.silver.input(1000 + i, null);
      d.session.step();
    }
    expect(d.session.state).toBe("open");
    expect(kept(d.gold.saves().at(-1)!.save)).toEqual(d.before.Gold);
    d.knockOut(d.silver);
    // Silver sends out the second member of the team, as the player picks it after a faint.
    expect(d.state(d.silver)?.phase).toBe("fighting");
    d.send(d.silver, { type: "swap", partyIndex: 1 });
    expect(d.out(d.silver)).toBeDefined();
    d.knockOut(d.silver);
    expect([d.state(d.gold)?.result, d.state(d.silver)?.result]).toEqual(["won", "lost"]);
    expect(d.after()).toEqual(d.before);
  });

  it("a player dropping mid-duel aborts it, and both saves stay as they were", () => {
    const d = duel({ level: "50", team: 1 });
    d.silver.conn.close();
    d.session.step();
    expect(d.state(d.gold)).toMatchObject({ phase: "ended", result: "aborted" });
    expect(d.after().Gold).toEqual(d.before.Gold);
  });

  it("the invited player losing at current levels keeps everything too, the fainted second member included", () => {
    const d = duel({ level: "current", team: 1 });
    d.knockOut(d.silver);
    expect(d.state(d.silver)?.result).toBe("lost");
    expect(d.after()).toEqual(d.before);
  });
});
