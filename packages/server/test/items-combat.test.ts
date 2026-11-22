import { BUTTON, type ServerMessage } from "@soulsilver/shared/game";
import type { PartyMember } from "@soulsilver/shared/save";
import { describe, expect, it } from "vitest";
import { BUNDLED_COMPANION_CONTENT, buildCompanionData } from "../src/companion-loader";
import { buildItemsData } from "../src/items";
import { combatData, MOVES, SPECIES } from "./combat-fixture";
import { setup } from "./harness";

// Spec 027, US1–US3 (layer 2): items in real-time combat as the trainer's action, held items acting on
// their own, giving and taking held items, and the PP items on cooldowns. Item bytes as the ROM lays them out.

const POTION = 17;
const ANTIDOTE = 18;
const ETHER = 38;
const PP_UP = 51;
const X_ATTACK = 57;
const ORAN = 155;
const KEY = 471;
const hex = (at: Record<number, number>) => Array.from({ length: 20 }, (_, i) => (at[i] ?? 0).toString(16).padStart(2, "0")).join("");
const items = buildItemsData([
  { id: POTION, pocket: "medicine", partyUse: { kind: 1, params: hex({ 5: 0x04, 13: 20 }) } },
  { id: ANTIDOTE, pocket: "medicine", partyUse: { kind: 1, params: hex({ 0: 0x02 }) } },
  { id: ETHER, pocket: "medicine", partyUse: { kind: 1, params: hex({ 5: 0x01, 14: 10 }) } },
  { id: PP_UP, pocket: "medicine", partyUse: { kind: 1, params: hex({ 4: 0x40 }) } },
  { id: X_ATTACK, pocket: "battle-items", partyUse: { kind: 1, params: hex({ 1: 0x10 }) } },
  { id: ORAN, pocket: "berries", partyUse: { kind: 1, params: hex({ 5: 0x04, 13: 10 }) }, holdEffect: { id: 1, parameter: 10 } },
  { id: KEY, pocket: "key-items", partyUse: { kind: 0, params: hex({}) } },
]);
const member = (hp: number, extra: Partial<PartyMember> = {}): PartyMember => ({
  species: SPECIES.cyndaquil.id,
  level: 20,
  moves: [MOVES.tackle.id, MOVES.ember.id],
  hp,
  friendship: 70,
  experience: 8000,
  ivs: { hp: 31, attack: 31, defense: 31, speed: 31, specialAttack: 31, specialDefense: 31 },
  evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 },
  nature: 0,
  ...extra,
});

function game(party: PartyMember[], bag: { item: number; count: number }[]) {
  const t = setup({ combat: combatData(), companion: buildCompanionData(BUNDLED_COMPANION_CONTENT), items, spawn: () => ({ area: "a", x: 160, y: 160 }) });
  const p = t.connect("Gold", undefined, { save: { party, bag } });
  let seq = 0;
  const msgs = <T extends ServerMessage["type"]>(type: T) => p.got.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);
  const combat = t.session.combat!;
  let foe: number | undefined;
  const g = {
    ...t,
    p,
    msgs,
    combat,
    send(msg: unknown) {
      p.conn.send(msg);
      t.session.step();
    },
    step(n = 1, attack = false) {
      for (let i = 0; i < n; i++) {
        // Block C: normal moves have no cooldown; one blow a second keeps the companion standing.
        if (attack && foe !== undefined) combat.input(foe, { move: { x: 0, y: 0 }, buttons: t.session.tick % 20 === 0 ? 1 : 0, aim: { x: -1, y: 0 } });
        t.session.step();
      }
    },
    fight() {
      p.conn.send({ type: "input", seq: seq++, move: { x: 0, y: 0 }, run: false, buttons: BUTTON.combat });
      t.session.step();
      p.conn.send({ type: "input", seq: seq++, move: { x: 0, y: 0 }, run: false, buttons: 0 });
      t.session.step();
      return g.mine();
    },
    /** A wild Sentret right next to the companion, attacking it when step(n, true). */
    foe(level = 40) {
      const me = t.entity(g.mine())!;
      const e = t.session.world.add({ kind: "pokemon", area: "a", x: me.x + 14, y: me.y, level: 0, facing: "west", data: {} });
      combat.spawn(t.session.world, e.id, { species: SPECIES.sentret.id, level, moves: [MOVES.tackle.id] }, "wild");
      foe = e.id;
      return e.id;
    },
    mine: () => msgs("control").at(-1)!.entityId,
    notice: () => msgs("notice").at(-1)?.code,
    bagOf: (item: number) => msgs("bag").at(-1)?.items.find((b) => b.item === item)?.count ?? 0,
    lastSave() {
      t.session.close("closed-by-host");
      return p.saves().at(-1)!.save;
    },
  };
  return g;
}

describe("items in combat (US1)", () => {
  it("a Potion heals only once its use time is over, and the item is spent then", () => {
    const g = game([member(10)], [{ item: POTION, count: 2 }]);
    const id = g.fight();
    const hp = g.combat.get(id)!.hp;
    g.send({ type: "use-item-combat", item: POTION });
    expect(g.msgs("items-state").at(-1)?.useEndsTick).toBeGreaterThan(g.session.tick);
    g.step(5);
    expect(g.combat.get(id)!.hp).toBe(hp);
    g.step(40);
    expect(g.combat.get(id)!.hp).toBe(hp + 20);
    expect(g.lastSave().bag).toEqual([{ item: POTION, count: 1 }]);
  });

  it("the Pokémon can be hit while its trainer uses the item, and the use goes on", () => {
    const g = game([member(40)], [{ item: POTION, count: 1 }]);
    const id = g.fight();
    g.foe(5);
    g.send({ type: "use-item-combat", item: POTION });
    const before = g.combat.get(id)!.hp;
    g.step(70, true);
    const hits = g.msgs("combat-event").flatMap((m) => m.events).filter((e) => e.kind === "hit" && e.target === id);
    expect(hits.length).toBeGreaterThan(0);
    expect(g.msgs("combat-event").flatMap((m) => m.events).some((e) => e.kind === "heal" && e.target === id && e.amount > 0)).toBe(true);
    expect(g.combat.get(id)!.hp).not.toBe(before);
  });

  it("a second item waits for the cooldown", () => {
    const g = game([member(10)], [{ item: POTION, count: 3 }]);
    g.fight();
    g.send({ type: "use-item-combat", item: POTION });
    g.send({ type: "use-item-combat", item: POTION });
    expect(g.notice()).toBe("item-busy");
    g.step(40);
    g.send({ type: "use-item-combat", item: POTION });
    expect(g.notice()).toBe("item-busy");
    expect(g.msgs("items-state").at(-1)?.cooldownUntilTick).toBeGreaterThan(g.session.tick);
  });

  it("refuses an item the player does not have, and the bag stays as it was", () => {
    const g = game([member(10)], [{ item: POTION, count: 1 }]);
    g.fight();
    g.send({ type: "use-item-combat", item: ANTIDOTE });
    expect(g.notice()).toBe("action-refused");
    expect(g.lastSave().bag).toEqual([{ item: POTION, count: 1 }]);
  });

  it("refuses outside combat, an Antidote with no poison, and a key item", () => {
    const g = game([member(10)], [{ item: POTION, count: 1 }, { item: ANTIDOTE, count: 1 }, { item: KEY, count: 1 }]);
    g.send({ type: "use-item-combat", item: POTION });
    expect(g.notice()).toBe("action-refused");
    g.fight();
    g.send({ type: "use-item-combat", item: ANTIDOTE });
    expect(g.notice()).toBe("item-not-compatible");
    g.send({ type: "use-item-combat", item: KEY });
    expect(g.notice()).toBe("item-not-compatible");
  });

  it("an Antidote cures poison after its use time", () => {
    const g = game([member(40)], [{ item: ANTIDOTE, count: 1 }]);
    const id = g.fight();
    g.combat.inflict(id, "poison", g.session.tick);
    g.send({ type: "use-item-combat", item: ANTIDOTE });
    g.step(30);
    expect(g.combat.get(id)!.statuses.size).toBe(0);
    expect(g.lastSave().bag).toEqual([]);
  });

  it("fainting during the use cancels it and keeps the item", () => {
    const g = game([member(10), member(40)], [{ item: POTION, count: 1 }]);
    const id = g.fight();
    g.send({ type: "use-item-combat", item: POTION });
    g.combat.get(id)!.hp = 0;
    g.step(40);
    expect(g.lastSave().bag).toEqual([{ item: POTION, count: 1 }]);
  });

  it("an X Attack raises the attack stage", () => {
    const g = game([member(40)], [{ item: X_ATTACK, count: 1 }]);
    const id = g.fight();
    g.send({ type: "use-item-combat", item: X_ATTACK });
    g.step(30);
    expect(g.combat.get(id)!.stages.attack).toBe(1);
  });
});

describe("held items (US3)", () => {
  it("a held Oran Berry is eaten on its own when HP crosses half during a fight, and leaves the save", () => {
    const g = game([member(40, { held: ORAN })], []);
    const id = g.fight();
    const c = g.combat.get(id)!;
    c.hp = Math.floor(c.stats.hp / 2) + 1;
    g.foe(8);
    for (let i = 0; i < 40 && c.held; i++) g.step(10, true);
    const ate = g.msgs("combat-event").flatMap((m) => m.events).find((e) => e.kind === "held" && e.target === id);
    expect(ate).toMatchObject({ item: ORAN });
    expect(ate!.amount).toBeGreaterThan(0);
    expect(g.msgs("party").at(-1)!.members[0]!.held).toBeUndefined();
    expect(g.lastSave().party[0]!.held).toBeUndefined();
  });

  it("gives an item to hold and takes it back, through the bag", () => {
    const g = game([member(40)], [{ item: ORAN, count: 2 }]);
    g.send({ type: "set-held", partyIndex: 0, item: ORAN });
    expect(g.msgs("party").at(-1)!.members[0]!.held).toBe(ORAN);
    expect(g.bagOf(ORAN)).toBe(1);
    g.send({ type: "set-held", partyIndex: 0, item: null });
    expect(g.bagOf(ORAN)).toBe(2);
    expect(g.lastSave().party[0]!.held).toBeUndefined();
  });

  it("refuses a held item not in the bag, a key item and a member that does not exist", () => {
    const g = game([member(40)], [{ item: KEY, count: 1 }]);
    g.send({ type: "set-held", partyIndex: 0, item: ORAN });
    expect(g.notice()).toBe("action-refused");
    g.send({ type: "set-held", partyIndex: 0, item: KEY });
    expect(g.notice()).toBe("action-refused");
    g.send({ type: "set-held", partyIndex: 3, item: null });
    expect(g.notice()).toBe("action-refused");
  });
});

describe("PP items on the cooldowns (US2, research R4, block C)", () => {
  it("an Ether in combat ends a special's cooldown", () => {
    const g = game([member(40, { moves: [MOVES.tackle.id, MOVES.hyperBeam.id] })], [{ item: ETHER, count: 1 }]);
    const id = g.fight();
    const c = g.combat.get(id)!;
    c.readyAt[2] = 100_000;
    g.send({ type: "use-item-combat", item: ETHER });
    g.step(30);
    expect(c.readyAt[2]).toBeLessThan(100_000);
  });

  it("PP Up on a move raises its count to the limit, and the cooldown in combat follows", () => {
    const g = game([member(40)], [{ item: PP_UP, count: 4 }]);
    g.send({ type: "use-item", item: PP_UP, partyIndex: 0 });
    expect(g.notice()).toBe("action-refused");
    for (let i = 0; i < 3; i++) g.send({ type: "use-item", item: PP_UP, partyIndex: 0, moveIndex: 1 });
    g.send({ type: "use-item", item: PP_UP, partyIndex: 0, moveIndex: 1 });
    expect(g.notice()).toBe("item-not-compatible");
    expect(g.msgs("party").at(-1)!.members[0]!.ppUps).toEqual([0, 3]);
    const id = g.fight();
    // PP Ups only shorten specials' cooldowns; Ember (a normal) keeps its multiplier anyway, in its slot.
    expect(g.combat.get(id)!.cooldownMul).toEqual([1, 0.85, 1, 1]);
    expect(g.lastSave().bag).toEqual([{ item: PP_UP, count: 1 }]);
  });
});
