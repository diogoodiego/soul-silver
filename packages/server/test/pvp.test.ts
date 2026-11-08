import { BUTTON, type ServerMessage } from "@soulsilver/shared/game";
import type { PartyMember } from "@soulsilver/shared/save";
import { describe, expect, it } from "vitest";
import { BUNDLED_COMPANION_CONTENT, buildCompanionData } from "../src/companion-loader";
import { combatData, MOVES, SPECIES } from "./combat-fixture";
import { setup } from "./harness";

// Player against player: Pokémon out in combat hurt each other's Pokémon, never the trainers;
// no experience from it, and a blackout caused by a player costs no money.

const member = (species: keyof typeof SPECIES, hp = 999): PartyMember => ({ species: SPECIES[species].id, level: 10, moves: [MOVES.tackle.id], hp, friendship: 70, experience: 1000, ivs: { hp: 31, attack: 31, defense: 31, speed: 31, specialAttack: 31, specialDefense: 31 }, evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 }, nature: 0 });

function duel() {
  // A at x 160 facing east (toward B), B at x 224 facing west: the companions step forward and meet.
  const spots = [{ area: "a", x: 160, y: 160 }, { area: "a", x: 224, y: 160 }];
  const t = setup({ world: () => undefined, combat: combatData(), companion: buildCompanionData(BUNDLED_COMPANION_CONTENT), spawn: (n) => spots[n - 1]! });
  const a = t.connect("A", undefined, { save: { party: [member("cyndaquil")], money: 3000 } });
  const b = t.connect("B", undefined, { save: { party: [member("chikorita")], money: 3000 } });
  const seq = [0, 0];
  const send = (i: number, buttons: number, aim?: { x: number; y: number }) => [a, b][i]!.conn.send({ type: "input", seq: seq[i]!++, move: { x: 0, y: 0 }, run: false, buttons, ...(aim ? { aim } : {}) });
  const companionOf = (p: typeof a) => t.session.world.all().find((e) => e.kind === "pokemon" && e.data["owner"] === String(p.welcome!.playerId));
  const msgs = <T extends ServerMessage["type"]>(p: typeof a, type: T) => p.got.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);
  return {
    t,
    a,
    b,
    companionOf,
    msgs,
    /** Both players send their Pokémon out. */
    fight() {
      send(0, BUTTON.combat);
      send(1, BUTTON.combat);
      t.session.step();
      // Out of the ball takes a moment; then the two stand side by side.
      for (let i = 0; i < 20; i++) {
        send(0, 0);
        send(1, 0);
        t.session.step();
      }
      const ca = companionOf(a)!;
      const cb = companionOf(b)!;
      t.session.world.update({ ...cb, x: ca.x + 20, y: ca.y });
    },
    /** A uses move 1 toward B's Pokémon, then waits. */
    attack(ticks = 30) {
      // A move waits for a full action bar.
      for (let i = 0; i < 100 && companionOf(a)!.data["gauge"] !== 100; i++) {
        send(0, 0);
        send(1, 0);
        t.session.step();
      }
      const ca = companionOf(a)!;
      const cb = companionOf(b)!;
      const d = Math.hypot(cb.x - ca.x, cb.y - ca.y);
      send(0, 1, { x: (cb.x - ca.x) / d, y: (cb.y - ca.y) / d });
      t.session.step();
      for (let i = 0; i < ticks; i++) {
        send(0, 0);
        send(1, 0);
        t.session.step();
      }
    },
  };
}

describe("PvP", () => {
  it("a player's Pokémon damages another player's Pokémon", () => {
    const g = duel();
    g.fight();
    const before = Number(g.companionOf(g.b)!.data["hp"]);
    g.attack();
    expect(Number(g.companionOf(g.b)!.data["hp"])).toBeLessThan(before);
    expect(g.msgs(g.a, "exp-gain")).toEqual([]);
  });

  it("losing the whole party to a player blacks out without losing money", () => {
    const g = duel();
    g.fight();
    g.t.session.combat!.get(g.companionOf(g.b)!.id)!.hp = 1;
    g.attack();
    expect(g.msgs(g.b, "blackout").at(-1)).toMatchObject({ moneyLost: 0 });
  });
});
