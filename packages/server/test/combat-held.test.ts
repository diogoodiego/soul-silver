import { readFileSync } from "node:fs";
import { heldOf, parseItemFile, type HeldItem } from "@soulsilver/shared/items";
import { describe, expect, it } from "vitest";
import { combatSetup, MOVES, SPECIES } from "./combat-fixture";

// Spec 027, US3: held items act on their own in real-time combat, from content/items/effects.json.

const raw = JSON.parse(readFileSync(new URL("../../../content/items/effects.json", import.meta.url), "utf8")) as unknown;
const parsed = parseItemFile("effects", raw, "effects.json");
if (!parsed.ok) throw new Error(parsed.error.problem);
const effects = parsed.data.value;
const held = (id: number, pocket: "berries" | "items", holdId: number, parameter: number): HeldItem => heldOf({ id, pocket, holdEffect: { id: holdId, parameter } }, effects)!;
const ORAN = () => held(155, "berries", 1, 10);
const east = { x: 1, y: 0 };

function duel(holder: HeldItem | undefined, attackerMoves: number[] = [MOVES.tackle.id], level = 20) {
  const t = combatSetup(3);
  const a = t.spawn("rattata", attackerMoves, { x: 0, y: 0 }, "wild", level);
  const entity = t.world.add({ kind: "pokemon", area: "arena", x: 20, y: 0, level: 0, facing: "west", data: {} });
  t.combat.spawn(t.world, entity.id, { species: SPECIES.sentret.id, level, moves: [MOVES.tackle.id], ...(holder ? { held: holder } : {}) }, 1);
  return { t, a, b: entity.id };
}

describe("held items in combat", () => {
  it("an Oran Berry is eaten on its own once HP crosses half, with the heal on screen, and only once", () => {
    const { t, a, b } = duel(ORAN());
    const c = t.combat.get(b)!;
    c.hp = Math.floor(c.stats.hp / 2) + 2;
    for (let i = 0; i < 6 && !t.events.some((e) => e.kind === "held"); i++) {
      t.press(a, 1, east);
      t.step(30);
    }
    const ate = t.events.filter((e) => e.kind === "held" && e.target === b);
    expect(ate).toHaveLength(1);
    expect(ate[0]!.item).toBe(155);
    expect(ate[0]!.amount).toBeGreaterThan(0);
    expect(c.held).toBeUndefined();
  });

  it("a berry does nothing above the threshold", () => {
    const { t, b } = duel(ORAN());
    t.step(40);
    expect(t.events.some((e) => e.kind === "held")).toBe(false);
    expect(t.combat.get(b)!.held?.item).toBe(155);
  });

  it("a Cheri Berry cures paralysis as soon as it lands", () => {
    const { t, b } = duel(held(149, "berries", 5, 0));
    expect(t.combat.inflict(b, "paralysis", 1)).toBe(true);
    expect(t.combat.get(b)!.major).toBeUndefined();
    expect(t.combat.get(b)!.held).toBeUndefined();
  });

  it("a Cheri Berry leaves burn alone", () => {
    const { t, b } = duel(held(149, "berries", 5, 0));
    t.combat.inflict(b, "burn", 1);
    expect(t.combat.get(b)!.major?.id).toBe("burn");
    expect(t.combat.get(b)!.held?.item).toBe(149);
  });

  it("Leftovers heal 1/16 of max HP every second of combat and stay", () => {
    const { t, b } = duel(held(234, "items", 69, 10), []);
    const c = t.combat.get(b)!;
    c.hp = 1;
    t.step(20 * 3 + 1);
    expect(c.hp).toBe(1 + 3 * Math.max(1, Math.floor(c.stats.hp / 16)));
    expect(c.held?.item).toBe(234);
  });

  it("a Focus Sash keeps a full-HP Pokémon at 1 HP once, then is gone", () => {
    const { t, a, b } = duel(held(275, "items", 103, 0), [MOVES.hyperBeam.id], 60);
    const c = t.combat.get(b)!;
    c.stats.hp = 5;
    c.hp = 5;
    t.press(a, 1, east);
    t.step(60);
    expect(c.hp).toBe(1);
    expect(c.held).toBeUndefined();
  });

  it("a type booster raises its type's damage only", () => {
    const damage = (item: HeldItem | undefined, move: number) => {
      const t = combatSetup(9);
      const entity = t.world.add({ kind: "pokemon", area: "arena", x: 0, y: 0, level: 0, facing: "east", data: {} });
      t.combat.spawn(t.world, entity.id, { species: SPECIES.cyndaquil.id, level: 50, moves: [move], ...(item ? { held: item } : {}) }, 1);
      t.combat.get(entity.id)!.gauge = 1;
      t.spawn("chikorita", [], { x: 20, y: 0 }, "wild", 50);
      t.press(entity.id, 1, east);
      t.step(30);
      return t.events.find((e) => e.kind === "hit")!.amount;
    };
    const charcoal = held(249, "items", 84, 20);
    expect(damage(charcoal, MOVES.ember.id)).toBeGreaterThan(damage(undefined, MOVES.ember.id));
    expect(damage(charcoal, MOVES.tackle.id)).toBe(damage(undefined, MOVES.tackle.id));
  });

  it("PP Ups leave part of the action bar after the move: 1 − 1/(1 + 0.2 per use) (research R4)", () => {
    const t = combatSetup(1);
    const plain = t.spawn("cyndaquil", [MOVES.tackle.id], { x: 0, y: 0 }, 1, 20);
    const entity = t.world.add({ kind: "pokemon", area: "arena", x: 0, y: 40, level: 0, facing: "east", data: {} });
    t.combat.spawn(t.world, entity.id, { species: SPECIES.cyndaquil.id, level: 20, moves: [MOVES.tackle.id], cooldownMul: [1 / 1.6] }, 2);
    t.combat.get(entity.id)!.gauge = 1;
    t.press(plain, 1, east);
    t.press(entity.id, 1, east);
    t.step(10);
    expect([plain, entity.id].map((id) => t.combat.get(id)!.used.count)).toEqual([1, 1]);
    // Same species and level: the bars fill alike, so the gap is what the PP Ups left.
    expect(t.combat.get(entity.id)!.gauge - t.combat.get(plain)!.gauge).toBeCloseTo(1 - 1 / 1.6);
  });
});
