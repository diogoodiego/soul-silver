import { BUTTON, type ServerMessage } from "@soulsilver/shared/game";
import type { PartyMember } from "@soulsilver/shared/save";
import { describe, expect, it } from "vitest";
import { BUNDLED_COMPANION_CONTENT, buildCompanionData } from "../src/companion-loader";
import { buildItemsData } from "../src/items";
import { combatData, MOVES, SPECIES } from "./combat-fixture";
import { setup } from "./harness";

// Spec 017: the full menu marks the player busy (US6), party reorder and item use (US5),
// contracts/game-protocol-v9.md.

const POTION = 17;
const MAX_POTION = 24;
const REVIVE = 28;
const POKE_BALL = 4;
const items = buildItemsData([
  { id: POTION, pocket: "medicine", partyUse: { kind: 1, params: "0000000000040000000000000014000000000000" } },
  { id: MAX_POTION, pocket: "medicine", partyUse: { kind: 1, params: "00000000000400000000000000ff000000000000" } },
  { id: REVIVE, pocket: "medicine", partyUse: { kind: 1, params: "00010000000400000000000000fe000000000000" } },
  { id: POKE_BALL, pocket: "balls", partyUse: { kind: 0, params: "0300000000000000000000000000000000000000" } },
]);

const member = (species: keyof typeof SPECIES, hp: number): PartyMember => ({ species: SPECIES[species].id, level: 10, moves: [MOVES.tackle.id], hp, friendship: 70, experience: 1000, ivs: { hp: 31, attack: 31, defense: 31, speed: 31, specialAttack: 31, specialDefense: 31 }, evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 }, nature: 0 });

function game(party: PartyMember[], bag = [{ item: POTION, count: 2 }]) {
  const t = setup({ world: () => undefined, combat: combatData(), companion: buildCompanionData(BUNDLED_COMPANION_CONTENT), items, spawn: () => ({ area: "a", x: 160, y: 160 }) });
  const p = t.connect("Gold", undefined, { save: { party, bag } });
  const other = t.connect("Silver");
  let seq = 0;
  const msgs = <T extends ServerMessage["type"]>(type: T) => p.got.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);
  return {
    ...t,
    p,
    other,
    msgs,
    send(msg: unknown) {
      p.conn.send(msg);
      t.session.step();
    },
    fight() {
      p.conn.send({ type: "input", seq: seq++, move: { x: 0, y: 0 }, run: false, buttons: BUTTON.combat });
      t.session.step();
      p.conn.send({ type: "input", seq: seq++, move: { x: 0, y: 0 }, run: false, buttons: 0 });
      t.session.step();
    },
    me: () => t.entity(p.welcome!.entityId)!,
    party: () => msgs("party").at(-1)!.members,
    notice: () => msgs("notice").at(-1)?.code,
    lastSave() {
      t.session.close("closed-by-host");
      return p.saves().at(-1)!.save;
    },
  };
}

describe("busy in a menu (US6)", () => {
  it("marks the player busy while the menu is open, and the other player sees it", () => {
    const g = game([member("cyndaquil", 20)]);
    g.send({ type: "menu", open: true });
    expect(g.me().data["busy"]).toBe(true);
    const seen = g.other.lastState()!;
    expect([...seen.spawned, ...seen.changed].find((e) => e.id === g.p.welcome!.entityId)?.data?.["busy"]).toBe(true);
    g.send({ type: "menu", open: false });
    expect(g.me().data["busy"]).toBeUndefined();
  });

  it("refuses the menu in combat and says why", () => {
    const g = game([member("cyndaquil", 20)]);
    g.fight();
    g.send({ type: "menu", open: true });
    expect(g.me().data["busy"]).toBeUndefined();
    expect(g.notice()).toBe("menu-blocked");
  });

  it("clears busy when a fight starts with the menu open", () => {
    const g = game([member("cyndaquil", 20)]);
    g.send({ type: "menu", open: true });
    g.fight();
    expect(g.me().data["busy"]).toBeUndefined();
  });
});

describe("party reorder (US5)", () => {
  it("moves a member and keeps the order in the save", () => {
    const g = game([member("cyndaquil", 20), member("chikorita", 20)]);
    g.send({ type: "reorder-party", from: 1, to: 0 });
    expect(g.party().map((m) => m.species)).toEqual([SPECIES.chikorita.id, SPECIES.cyndaquil.id]);
    expect(g.lastSave().party.map((m) => m.species)).toEqual([SPECIES.chikorita.id, SPECIES.cyndaquil.id]);
  });

  it("refuses an index outside the party, the same slot, and combat", () => {
    const g = game([member("cyndaquil", 20), member("chikorita", 20)]);
    g.send({ type: "reorder-party", from: 0, to: 2 });
    expect(g.notice()).toBe("action-refused");
    g.send({ type: "reorder-party", from: 1, to: 1 });
    expect(g.notice()).toBe("action-refused");
    g.fight();
    g.send({ type: "reorder-party", from: 1, to: 0 });
    expect(g.lastSave().party.map((m) => m.species)).toEqual([SPECIES.cyndaquil.id, SPECIES.chikorita.id]);
  });
});

describe("item use (US5)", () => {
  it("heals with a Potion, capped at max HP, and uses one", () => {
    const g = game([member("cyndaquil", 5)]);
    const max = g.party()[0]!.hpMax;
    g.send({ type: "use-item", item: POTION, partyIndex: 0 });
    expect(g.party()[0]!.hp).toBe(Math.min(max, 25));
    expect(g.msgs("bag").at(-1)!.items).toEqual([{ item: POTION, count: 1 }]);
    g.send({ type: "use-item", item: POTION, partyIndex: 0 });
    expect(g.party()[0]!.hp).toBe(Math.min(max, 45));
    expect(g.lastSave().bag).toEqual([]);
  });

  it("restores everything with a Max Potion", () => {
    const g = game([member("cyndaquil", 1)], [{ item: MAX_POTION, count: 1 }]);
    g.send({ type: "use-item", item: MAX_POTION, partyIndex: 0 });
    expect(g.party()[0]!.hp).toBe(g.party()[0]!.hpMax);
  });

  it("refuses a fainted target, full HP, a missing item, a bad index and combat, without using the item", () => {
    const g = game([member("cyndaquil", 0), member("chikorita", 999), member("chikorita", 5)]);
    g.send({ type: "use-item", item: POTION, partyIndex: 0 });
    expect(g.notice()).toBe("action-refused");
    g.send({ type: "use-item", item: POTION, partyIndex: 1 });
    expect(g.notice()).toBe("action-refused");
    g.send({ type: "use-item", item: MAX_POTION, partyIndex: 2 });
    expect(g.notice()).toBe("action-refused");
    g.send({ type: "use-item", item: POTION, partyIndex: 5 });
    expect(g.notice()).toBe("action-refused");
    g.fight();
    g.send({ type: "use-item", item: POTION, partyIndex: 2 });
    expect(g.lastSave().bag).toEqual([{ item: POTION, count: 2 }]);
  });

  it("answers item-unavailable for anything that is not a potion yet", () => {
    const g = game([member("cyndaquil", 5)], [{ item: REVIVE, count: 1 }, { item: POKE_BALL, count: 1 }]);
    g.send({ type: "use-item", item: REVIVE, partyIndex: 0 });
    expect(g.notice()).toBe("item-unavailable");
    g.send({ type: "use-item", item: POKE_BALL, partyIndex: 0 });
    expect(g.notice()).toBe("item-unavailable");
    expect(g.lastSave().bag).toHaveLength(2);
  });
});

describe("party details (US5)", () => {
  it("sends moves, stats, nature and experience for the party screen", () => {
    const g = game([member("cyndaquil", 20)]);
    expect(g.party()[0]).toMatchObject({ moves: [MOVES.tackle.id], nature: 0, exp: 1000 });
    expect(g.party()[0]!.stats?.hp).toBe(g.party()[0]!.hpMax);
  });
});
