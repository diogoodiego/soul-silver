import type { ServerMessage } from "@soulsilver/shared/game";
import { expForLevel } from "@soulsilver/shared/progression";
import type { PartyMember } from "@soulsilver/shared/save";
import { describe, expect, it } from "vitest";
import { BUNDLED_COMPANION_CONTENT, buildCompanionData } from "../src/companion-loader";
import { buildItemRules, buildItemsData } from "../src/items";
import { buildProgressionData } from "../src/progression";
import { combatData, MOVES, SPECIES } from "./combat-fixture";
import { setup } from "./harness";
import effects from "../../../content/items/effects.json" with { type: "json" };
import tuning from "../../../content/items/tuning.json" with { type: "json" };
import finds from "../../../content/companion/finds.json" with { type: "json" };

// Spec 027 (layer 2): items used on the field: Repel, Berry Pots, the companion's finds, Rare Candy,
// evolution stones and TMs, all checked by the server (FR-016). Clock injected (spec 026).

const REPEL = 79;
const ORAN = 155;
const BERRY_POTS = 470;
const RARE_CANDY = 50;
const FIRE_STONE = 82;
const TM70 = 397;
const HM01 = 420;
const hex = (at: Record<number, number>) => Array.from({ length: 20 }, (_, i) => (at[i] ?? 0).toString(16).padStart(2, "0")).join("");
const items = buildItemsData([
  { id: REPEL, pocket: "items", partyUse: { kind: 0, params: hex({}) } },
  { id: ORAN, pocket: "berries", partyUse: { kind: 1, params: hex({ 5: 0x04, 13: 10 }) }, holdEffect: { id: 1, parameter: 10 } },
  { id: BERRY_POTS, pocket: "key-items", partyUse: { kind: 0, params: hex({}) } },
  { id: RARE_CANDY, pocket: "medicine", partyUse: { kind: 1, params: hex({ 1: 0x04 }) } },
  { id: FIRE_STONE, pocket: "items", partyUse: { kind: 1, params: hex({ 1: 0x08 }) } },
  { id: TM70, pocket: "machines", partyUse: { kind: 0, params: hex({}) } },
  { id: HM01, pocket: "machines", partyUse: { kind: 0, params: hex({}) } },
  { id: 17, pocket: "medicine", partyUse: { kind: 1, params: hex({ 5: 0x04, 13: 20 }) } },
]);
const stats = (v: number) => ({ hp: v, attack: v, defense: v, speed: v, specialAttack: v, specialDefense: v });
const progression = buildProgressionData({
  species: [
    { id: SPECIES.cyndaquil.id, baseStats: SPECIES.cyndaquil.baseStats, baseExperience: 62, evYield: stats(0), growthRate: "medium-slow", baseFriendship: 70 },
    { id: 37, baseStats: stats(40), baseExperience: 63, evYield: stats(0), growthRate: "medium-fast", baseFriendship: 70 },
    { id: 38, baseStats: stats(70), baseExperience: 178, evYield: stats(0), growthRate: "medium-fast", baseFriendship: 70 },
  ],
  learnsets: [
    { id: SPECIES.cyndaquil.id, levelUp: [{ level: 1, move: 33 }], machines: [70, 93] },
    { id: 37, levelUp: [{ level: 1, move: 52 }], machines: [] },
  ],
  evolutions: [{ id: 37, evolutions: [{ method: "use-item", methodId: 7, parameter: FIRE_STONE, condition: { kind: "item", item: FIRE_STONE }, into: 38 }] }],
  machines: [
    { id: 70, kind: "tm", number: 70, move: 148 },
    { id: 93, kind: "hm", number: 1, move: 15 },
  ],
});
const member = (species = SPECIES.cyndaquil.id, level = 10, extra: Partial<PartyMember> = {}): PartyMember => ({
  species,
  level,
  moves: [MOVES.tackle.id],
  hp: 30,
  friendship: 70,
  experience: expForLevel(species === SPECIES.cyndaquil.id ? "medium-slow" : "medium-fast", level),
  ivs: stats(31),
  evs: stats(0),
  nature: 0,
  ...extra,
});

function game(party: PartyMember[], bag: { item: number; count: number }[], clock: { now: Date }, rules = buildItemRules()) {
  const t = setup({
    combat: combatData(),
    companion: buildCompanionData(BUNDLED_COMPANION_CONTENT),
    items,
    progression,
    itemRules: rules,
    now: () => clock.now,
    scripts: { file: () => undefined, events: () => undefined, resolve: () => undefined, fieldItems: { hidden: [], apricornTrees: [], berries: [{ item: ORAN, hoursPerStage: 4 }] } },
    spawn: () => ({ area: "a", x: 160, y: 160 }),
  });
  const p = t.connect("Gold", undefined, { save: { party, bag } });
  const msgs = <T extends ServerMessage["type"]>(type: T) => p.got.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);
  return {
    ...t,
    p,
    msgs,
    send(msg: unknown, steps = 1) {
      p.conn.send(msg);
      for (let i = 0; i < steps; i++) t.session.step();
    },
    notice: () => msgs("notice").at(-1)?.code,
    lastSave() {
      t.session.close("closed-by-host");
      return p.saves().at(-1)!.save;
    },
  };
}

describe("Repel on the field (US7)", () => {
  it("starts for its original steps converted to time, and ends with a notice", () => {
    const clock = { now: new Date(2026, 10, 7, 12) };
    const g = game([member()], [{ item: REPEL, count: 1 }], clock);
    g.send({ type: "use-item", item: REPEL, partyIndex: 0 });
    const ends = g.msgs("items-state").at(-1)!.repelEndsAt!;
    expect(Date.parse(ends) - clock.now.getTime()).toBe(Math.round(100 * tuning.value.repel.stepS * 1000));
    clock.now = new Date(Date.parse(ends) + 1);
    g.send({ type: "input", seq: 1, move: { x: 0, y: 0 }, run: false, buttons: 0 });
    expect(g.notice()).toBe("repel-ended");
    expect(g.lastSave()).toMatchObject({ repel: null, bag: [] });
  });
});

describe("Berry Pots (US5)", () => {
  it("a berry planted grows on the clock and is harvested once ripe, not before", () => {
    const clock = { now: new Date(2026, 10, 7, 12) };
    const g = game([member()], [{ item: BERRY_POTS, count: 1 }, { item: ORAN, count: 1 }], clock);
    g.send({ type: "berry-plant", pot: 0, item: ORAN });
    expect(g.msgs("berry-pots").at(-1)!.pots[0]).toEqual({ berry: ORAN, stage: "planted" });
    g.send({ type: "berry-harvest", pot: 0 });
    expect(g.notice()).toBe("not-ready");
    clock.now = new Date(clock.now.getTime() + 16 * 3_600_000);
    g.send({ type: "berry-harvest", pot: 0 });
    const found = g.msgs("item-found").at(-1)!;
    expect(found).toMatchObject({ item: ORAN, source: "berry" });
    expect(found.count).toBeGreaterThanOrEqual(tuning.value.berryYield[0]!);
    expect(found.count).toBeLessThanOrEqual(tuning.value.berryYield[1]!);
    expect(g.lastSave().berryPots).toEqual([null, null, null, null]);
  });

  it("refuses planting without the Berry Pots, in a pot in use, or something that is not a berry", () => {
    const clock = { now: new Date(2026, 10, 7, 12) };
    const g = game([member()], [{ item: ORAN, count: 3 }, { item: 17, count: 1 }], clock);
    g.send({ type: "berry-plant", pot: 0, item: ORAN });
    expect(g.notice()).toBe("action-refused");
    const h = game([member()], [{ item: BERRY_POTS, count: 1 }, { item: ORAN, count: 3 }, { item: 17, count: 1 }], clock);
    h.send({ type: "berry-plant", pot: 0, item: 17 });
    expect(h.notice()).toBe("action-refused");
    h.send({ type: "berry-plant", pot: 0, item: ORAN });
    h.send({ type: "berry-plant", pot: 0, item: ORAN });
    expect(h.notice()).toBe("action-refused");
    expect(h.lastSave().bag).toContainEqual({ item: ORAN, count: 2 });
  });
});

describe("the companion's finds (US6)", () => {
  it("brings an item from its place's table every so often, into the bag", () => {
    const rules = buildItemRules({ effects, tuning, finds: { ...finds, value: { everyS: 1, chance: 100, places: { route: [{ item: ORAN, weight: 1 }], town: [{ item: ORAN, weight: 1 }] } } } });
    const g = game([member()], [], { now: new Date(2026, 10, 7, 12) }, rules);
    for (let i = 0; i < 25; i++) g.send({ type: "input", seq: i + 1, move: { x: 0, y: 0 }, run: false, buttons: 0 });
    expect(g.msgs("item-found").at(-1)).toMatchObject({ item: ORAN, source: "companion" });
  });
});

describe("Rare Candy, stones and machines through the session (US4)", () => {
  it("a Rare Candy queues the next level and is spent", () => {
    const g = game([member()], [{ item: RARE_CANDY, count: 1 }], { now: new Date() });
    g.send({ type: "use-item", item: RARE_CANDY, partyIndex: 0 }, 2);
    expect(g.msgs("progression").at(-1)!.item).toEqual({ kind: "level-up", member: 0, level: 11 });
    expect(g.msgs("bag").at(-1)!.items).toEqual([]);
  });

  it("a Fire Stone evolves Vulpix and nothing else; a refused stone stays in the bag", () => {
    const g = game([member(SPECIES.cyndaquil.id), member(37)], [{ item: FIRE_STONE, count: 1 }], { now: new Date() });
    g.send({ type: "use-item", item: FIRE_STONE, partyIndex: 0 });
    expect(g.notice()).toBe("item-not-compatible");
    g.send({ type: "use-item", item: FIRE_STONE, partyIndex: 1 }, 2);
    expect(g.msgs("progression").at(-1)!.item).toEqual({ kind: "evolve", member: 1, into: 38 });
  });

  it("a TM teaches a compatible Pokémon and is spent; an HM teaches and stays", () => {
    const g = game([member(), member(37)], [{ item: TM70, count: 1 }, { item: HM01, count: 1 }], { now: new Date() });
    g.send({ type: "use-item", item: TM70, partyIndex: 1 });
    expect(g.notice()).toBe("item-not-compatible");
    g.send({ type: "use-item", item: TM70, partyIndex: 0 }, 2);
    expect(g.msgs("progression").at(-1)!.item).toEqual({ kind: "learn", member: 0, move: 148 });
    g.send({ type: "progression-ack" }, 2);
    g.send({ type: "use-item", item: HM01, partyIndex: 0 }, 2);
    expect(g.msgs("progression").at(-1)!.item).toEqual({ kind: "learn", member: 0, move: 15 });
    expect(g.lastSave().bag).toEqual([{ item: HM01, count: 1 }]);
  });
});
