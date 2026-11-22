import { describe, expect, it } from "vitest";
import { combatSetup, MOVES } from "./combat-fixture";

const east = { x: 1, y: 0 };
const west = { x: -1, y: 0 };
const kinds = (t: ReturnType<typeof combatSetup>, target: number) => t.events.filter((e) => e.target === target).map((e) => e.kind);

function duel(move: number, targetAt: { x: number; y: number }, aim: { x: number; y: number } | undefined = east, ticks = 40) {
  const t = combatSetup();
  const a = t.spawn("cyndaquil", [move], { x: 0, y: 0 }, 1);
  const b = t.spawn("sentret", [], targetAt);
  t.press(a, 1, aim);
  t.step(ticks);
  return { t, a, b };
}

describe("archetypes", () => {
  it("melee auto-aims at a foe in reach, and misses one out of reach", () => {
    expect(kinds(duel(MOVES.tackle.id, { x: 20, y: 0 }).t, 2)).toEqual(["hit"]);
    expect(kinds(duel(MOVES.tackle.id, { x: -20, y: 0 }).t, 2)).toEqual(["hit"]);
    // Block C: a normal contact move leaps up to 48 px first, so 60 px away is reached; 100 px is not.
    expect(kinds(duel(MOVES.tackle.id, { x: 60, y: 0 }).t, 2)).toEqual(["hit"]);
    expect(kinds(duel(MOVES.tackle.id, { x: 100, y: 0 }).t, 2)).toEqual([]);
  });

  it("projectile travels, hits where aimed, and stops at its range", () => {
    const { t, b } = duel(MOVES.ember.id, { x: 100, y: 0 }, east, 6);
    expect(kinds(t, b)).toEqual([]); // still flying
    t.step(30);
    expect(kinds(t, b)).toContain("hit");
    // Auto-aim turns the shot towards a foe in range, whatever the input aim.
    expect(kinds(duel(MOVES.ember.id, { x: 100, y: 0 }, west).t, 2)).toContain("hit");
    expect(kinds(duel(MOVES.ember.id, { x: 0, y: 100 }).t, 2)).toContain("hit");
    expect(kinds(duel(MOVES.ember.id, { x: 200, y: 0 }).t, 2)).toEqual([]);
  });

  it("the projectile is an entity while it flies", () => {
    const { t } = duel(MOVES.ember.id, { x: 150, y: 0 }, east, 4);
    expect(t.world.all().filter((e) => e.kind === "projectile")).toHaveLength(1);
    t.step(40);
    expect(t.world.all().filter((e) => e.kind === "projectile")).toHaveLength(0);
  });

  it("beam hits along the aim, not beside it", () => {
    expect(kinds(duel(MOVES.hyperBeam.id, { x: 100, y: 0 }).t, 2)).toEqual(["hit"]);
    expect(kinds(duel(MOVES.hyperBeam.id, { x: 100, y: 20 }).t, 2)).toEqual([]);
  });

  it("self-area hits around the user", () => {
    expect(kinds(duel(MOVES.growl.id, { x: -30, y: 10 }).t, 2)).toEqual(["stages"]);
    expect(kinds(duel(MOVES.growl.id, { x: 80, y: 0 }).t, 2)).toEqual([]);
  });

  it("target-area hits at the aimed point", () => {
    expect(kinds(duel(MOVES.thunder.id, { x: 96, y: 0 }).t, 2)).toContain("hit");
    expect(kinds(duel(MOVES.thunder.id, { x: 20, y: 0 }).t, 2)).toEqual([]);
  });

  it("dash moves the user and hits what it runs into", () => {
    const { t, a, b } = duel(MOVES.quickAttack.id, { x: 50, y: 0 });
    expect(kinds(t, b)).toEqual(["hit"]);
    expect(t.pos(a).x).toBeGreaterThan(20);
  });

  it("self-buff changes the user only", () => {
    const { t, a, b } = duel(MOVES.swordsDance.id, { x: 20, y: 0 });
    expect(t.combat.get(a)!.stages.attack).toBe(2);
    expect(t.combat.get(b)!.stages.attack).toBe(0);
  });

  it("target-debuff reaches along the aim", () => {
    const { t, b } = duel(MOVES.sleepPowder.id, { x: 60, y: 0 });
    expect(kinds(t, b)).toEqual(["status"]);
    expect(t.combat.get(b)!.major?.id).toBe("sleep");
  });

  it("a field stays and catches who walks in", () => {
    const t = combatSetup();
    const a = t.spawn("cyndaquil", [MOVES.toxicSpikes.id], { x: 0, y: 0 }, 1);
    const b = t.spawn("sentret", [], { x: 64, y: 200 });
    t.press(a, 1, east);
    t.step(20);
    expect(kinds(t, b)).toEqual([]);
    t.world.update({ ...t.world.get(b)!, y: 0 });
    t.step(2);
    expect(t.combat.get(b)!.major?.id).toBe("poison");
  });

  it("without aim, the move goes the way the user faces", () => {
    const t = combatSetup();
    const a = t.spawn("cyndaquil", [MOVES.tackle.id], { x: 0, y: 0 }, 1);
    const b = t.spawn("sentret", [], { x: 0, y: 20 });
    t.walk(a, { x: 0, y: 1 });
    t.step();
    t.press(a, 1);
    t.step(5);
    expect(kinds(t, b)).toEqual(["hit"]);
  });
});

describe("generic archetypes", () => {
  it("unmapped moves of each category work without errors", () => {
    for (const move of [MOVES.unmappedPhysical, MOVES.unmappedSpecial, MOVES.unmappedStatus]) {
      const { t, b } = duel(move.id, { x: 20, y: 0 });
      expect(t.combat.get(1)!.moves.find((m) => m)!.archetype).toBe(`generic-${move.category}`);
      expect(kinds(t, b)).toEqual(move.category === "status" ? [] : ["hit"]);
    }
  });
});

describe("owners", () => {
  it("Pokémon of different players hurt each other (PvP)", () => {
    const t = combatSetup();
    const a = t.spawn("cyndaquil", [MOVES.tackle.id], { x: 0, y: 0 }, 1);
    const b = t.spawn("sentret", [], { x: 20, y: 0 }, 2);
    t.press(a, 1, east);
    t.step(10);
    expect(kinds(t, b)).toEqual(["hit"]);
  });

  it("nor their own, nor themselves", () => {
    const t = combatSetup();
    const a = t.spawn("cyndaquil", [MOVES.growl.id], { x: 0, y: 0 }, 1);
    const b = t.spawn("sentret", [], { x: 20, y: 0 }, 1);
    t.press(a, 1, east);
    t.step(10);
    expect(t.events).toEqual([]);
    expect(t.combat.get(a)!.stages.attack).toBe(0);
    expect(t.combat.get(b)!.stages.attack).toBe(0);
  });

  it("wild Pokémon can hurt and be hurt by players' Pokémon", () => {
    const t = combatSetup();
    const a = t.spawn("cyndaquil", [MOVES.tackle.id], { x: 0, y: 0 }, 1);
    const b = t.spawn("sentret", [MOVES.tackle.id], { x: 20, y: 0 });
    t.press(a, 1, east);
    t.press(b, 1, west);
    t.step(10);
    expect(kinds(t, a)).toEqual(["hit"]);
    expect(kinds(t, b)).toEqual(["hit"]);
  });
});
