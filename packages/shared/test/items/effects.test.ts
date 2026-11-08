import { describe, expect, it } from "vitest";
import type { ItemRecord } from "../../src/game-data/items.ts";
import { ppUpCooldownMul, restoreCooldown, useEffectOf, type ItemEffects } from "../../src/items/index.ts";

// Spec 027, US1/US2/US4: what an item does, read from the extracted party-use bytes (item_data: ItemPartyParam)
// and, where those bytes say nothing, from content/items/effects.json.

/** Party-use bytes as 40 hex characters; `at` sets byte i. */
const params = (at: Record<number, number>) => Array.from({ length: 20 }, (_, i) => (at[i] ?? 0).toString(16).padStart(2, "0")).join("");
const item = (id: number, pocket: ItemRecord["pocket"], at: Record<number, number> = {}, extra: Partial<ItemRecord> = {}): ItemRecord => ({
  id,
  dataIndex: id,
  name: { catalog: "item-names", index: id },
  price: 100,
  pocket,
  battlePockets: 0,
  holdEffect: { id: 0, parameter: 0 },
  fling: { effect: 0, power: 0 },
  naturalGift: { power: 0, type: 31 },
  pluckEffect: 0,
  preventToss: false,
  selectable: false,
  fieldUse: 0,
  battleUse: 0,
  partyUse: { kind: 1, params: params(at) },
  ...extra,
});
const effects: ItemEffects = { use: { "79": { archetype: "repel", levelFilter: true }, "92": { archetype: "none", reason: "sell" } }, held: {} };

describe("use effects", () => {
  it("reads potions: a flat amount, full, and Full Restore's cure of everything", () => {
    expect(useEffectOf(item(17, "medicine", { 5: 0x04, 13: 20 }), effects)).toEqual({ archetype: "heal", amount: 20, cures: [] });
    expect(useEffectOf(item(24, "medicine", { 5: 0x04, 13: 0xff }), effects)).toEqual({ archetype: "heal", amount: "full", cures: [] });
    const fullRestore = useEffectOf(item(23, "medicine", { 0: 0x3f, 5: 0x04, 13: 0xff }), effects) as { archetype: string; amount: string; cures: string[] };
    expect([fullRestore.archetype, fullRestore.amount]).toEqual(["heal", "full"]);
    expect([...fullRestore.cures].sort()).toEqual(["burn", "confusion", "freeze", "paralysis", "poison", "sleep", "toxic"]);
  });

  it("reads Revive (half), Max Revive (full) and a berry's quarter heal", () => {
    expect(useEffectOf(item(28, "medicine", { 1: 0x01, 5: 0x04, 13: 0xfe }), effects)).toEqual({ archetype: "revive", amount: "half" });
    expect(useEffectOf(item(29, "medicine", { 1: 0x01, 5: 0x04, 13: 0xff }), effects)).toEqual({ archetype: "revive", amount: "full" });
    expect(useEffectOf(item(158, "berries", { 5: 0x04, 13: 0xfd }), effects)).toEqual({ archetype: "heal", amount: "quarter", cures: [] });
  });

  it("reads the status cures, Antidote counting for bad poison", () => {
    expect(useEffectOf(item(18, "medicine", { 0: 0x02 }), effects)).toEqual({ archetype: "cure", cures: ["poison", "toxic"] });
    expect(useEffectOf(item(22, "medicine", { 0: 0x10 }), effects)).toEqual({ archetype: "cure", cures: ["paralysis"] });
    expect(useEffectOf(item(150, "berries", { 0: 0x01 }), effects)).toEqual({ archetype: "cure", cures: ["sleep"] });
  });

  it("reads Ether, Max Ether and Elixir", () => {
    expect(useEffectOf(item(38, "medicine", { 5: 0x01, 14: 10 }), effects)).toEqual({ archetype: "pp-ether", all: false, pp: 10 });
    expect(useEffectOf(item(39, "medicine", { 5: 0x01, 14: 0x7f }), effects)).toEqual({ archetype: "pp-ether", all: false, pp: "full" });
    expect(useEffectOf(item(40, "medicine", { 5: 0x02, 14: 10 }), effects)).toEqual({ archetype: "pp-ether", all: true, pp: 10 });
  });

  it("reads PP Up, PP Max, Rare Candy and the evolution stones", () => {
    expect(useEffectOf(item(51, "medicine", { 4: 0x40 }), effects)).toEqual({ archetype: "pp-up", max: false });
    expect(useEffectOf(item(53, "medicine", { 4: 0x80 }), effects)).toEqual({ archetype: "pp-up", max: true });
    expect(useEffectOf(item(50, "medicine", { 1: 0x04 }), effects)).toEqual({ archetype: "rare-candy" });
    // The ROM's Rare Candy also has the revive bit (byte 1 = 0x05).
    expect(useEffectOf(item(50, "medicine", { 1: 0x05, 6: 0x0e }), effects)).toEqual({ archetype: "rare-candy" });
    expect(useEffectOf(item(80, "items", { 1: 0x08 }), effects)).toEqual({ archetype: "evolve" });
  });

  it("reads the X items, Dire Hit and Guard Spec.", () => {
    expect(useEffectOf(item(57, "battle-items", { 1: 0x10 }), effects)).toEqual({ archetype: "battle-stat", stages: { attack: 1 } });
    expect(useEffectOf(item(62, "battle-items", { 3: 0x01 }), effects)).toEqual({ archetype: "battle-stat", stages: { specialDefense: 1 } });
    expect(useEffectOf(item(59, "battle-items", { 3: 0x10 }), effects)).toEqual({ archetype: "battle-stat", stages: { speed: 1 } });
    expect(useEffectOf(item(60, "battle-items", { 4: 0x01 }), effects)).toEqual({ archetype: "battle-stat", stages: { accuracy: 1 } });
    expect(useEffectOf(item(56, "battle-items", { 4: 0x10 }), effects)).toEqual({ archetype: "battle-stat", stages: { crit: 1 } });
    expect(useEffectOf(item(55, "battle-items", { 0: 0x80 }), effects)).toEqual({ archetype: "battle-stat", stages: {}, guard: true });
  });

  it("balls and machines come from the pocket; the data file wins over the bytes", () => {
    expect(useEffectOf(item(4, "balls"), effects)).toEqual({ archetype: "ball" });
    expect(useEffectOf(item(328, "machines"), effects)).toEqual({ archetype: "teach" });
    expect(useEffectOf(item(79, "items"), effects)).toEqual({ archetype: "repel", levelFilter: true });
    expect(useEffectOf(item(92, "items"), effects)).toEqual({ archetype: "none", reason: "sell" });
    expect(useEffectOf(item(160, "berries"), effects)).toBeUndefined();
  });
});

describe("PP as cooldown (research R4)", () => {
  it("PP Up divides the base cooldown by 1 + 0.2 per use", () => {
    expect(ppUpCooldownMul(0, 0.2)).toBe(1);
    expect(ppUpCooldownMul(1, 0.2)).toBeCloseTo(1 / 1.2);
    expect(ppUpCooldownMul(3, 0.2)).toBeCloseTo(1 / 1.6);
  });

  it("an Ether takes PP × seconds off the wait left; a full restore clears it", () => {
    expect(restoreCooldown(100, 10, 0.5, 20)).toBe(0);
    expect(restoreCooldown(100, 2, 0.5, 20)).toBe(80);
    expect(restoreCooldown(100, "full", 0.5, 20)).toBe(0);
    expect(restoreCooldown(0, 10, 0.5, 20)).toBe(0);
  });
});
