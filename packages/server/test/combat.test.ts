import { computeDamage, computeStats } from "@soulsilver/shared/combat";
import { describe, expect, it } from "vitest";
import { combatSetup, MOVES, SPECIES } from "./combat-fixture";

const { tackle, ember, scratch } = MOVES;
const east = { x: 1, y: 0 };

describe("combatants", () => {
  it("get Gen 4 stats and start at full HP", () => {
    const t = combatSetup();
    const id = t.spawn("cyndaquil", [tackle.id], { x: 0, y: 0 });
    const c = t.combat.get(id)!;
    expect(c.stats).toEqual(computeStats(SPECIES.cyndaquil.baseStats, 10));
    expect(c.hp).toBe(c.stats.hp);
    expect(t.world.get(id)!.data).toMatchObject({ species: 155, level: 10, hp: 30, hpMax: 30, owner: "wild" });
  });

  it("refuse unknown species", () => {
    const t = combatSetup();
    const e = t.world.add({ kind: "pokemon", area: "arena", x: 0, y: 0, level: 0, facing: "east", data: {} });
    expect(() => t.combat.spawn(t.world, e.id, { species: 9999, level: 5, moves: [33] }, "wild")).toThrow(/9999/);
  });
});

describe("using a move", () => {
  it("hits a target in the hitbox for damage in the formula's range", () => {
    const t = combatSetup();
    const a = t.spawn("cyndaquil", [tackle.id], { x: 0, y: 0 }, 1);
    const b = t.spawn("sentret", [tackle.id], { x: 20, y: 0 });
    t.press(a, 1, east);
    t.step(5);
    const hit = t.events.find((e) => e.kind === "hit")!;
    expect(hit).toMatchObject({ attacker: a, target: b, move: tackle.id, effectiveness: 1 });
    const atk = t.combat.get(a)!.stats;
    const def = t.combat.get(b)!.stats;
    const range = (crit: boolean, random: number) =>
      computeDamage({ level: 10, power: 35, attack: atk.attack, defense: def.defense, attackStage: 0, defenseStage: 0, stab: false, typeMultipliers: [1], burned: false, weather: 1, crit, random });
    expect(hit.amount).toBeGreaterThanOrEqual(range(false, 85));
    expect(hit.amount).toBeLessThanOrEqual(range(true, 100));
    expect(t.hp(b)).toBe(def.hp - hit.amount);
  });

  it("starts on the press only, and waits for the action bar", () => {
    const t = combatSetup();
    const a = t.spawn("cyndaquil", [tackle.id], { x: 0, y: 0 }, 1);
    t.spawn("sentret", [], { x: 20, y: 0 });
    const fill = Math.ceil(t.combat.gaugeTicks(a));
    // Held while the bar fills again: one use.
    for (let i = 0; i < fill + 5; i++) {
      t.press(a, 1, east);
      t.step();
    }
    expect(t.events.filter((e) => e.kind === "hit")).toHaveLength(1);
    // Released, then pressed again with the bar full: a second use.
    t.step();
    t.press(a, 1, east);
    t.step(5);
    expect(t.events.filter((e) => e.kind === "hit")).toHaveLength(2);
  });

  it("ignores a press while the action bar fills", () => {
    const t = combatSetup();
    const a = t.spawn("cyndaquil", [tackle.id], { x: 0, y: 0 }, 1);
    t.spawn("sentret", [], { x: 20, y: 0 });
    t.press(a, 1, east);
    t.step(3);
    t.press(a, 1, east);
    t.step(3);
    expect(t.events.filter((e) => e.kind === "hit")).toHaveLength(1);
    expect(t.world.get(a)!.data.gauge).toBeLessThan(100);
  });

  it("enters combat with an empty action bar that fills, then lets any move go", () => {
    const t = combatSetup();
    const a = t.spawn("cyndaquil", [tackle.id, MOVES.ember.id], { x: 0, y: 0 }, 1);
    t.spawn("sentret", [], { x: 20, y: 0 });
    const c = t.combat.get(a)!;
    c.gauge = 0;
    t.press(a, 2, east);
    t.step(3);
    expect(c.used.count).toBe(0);
    t.step(Math.ceil(t.combat.gaugeTicks(a)));
    expect(c.gauge).toBe(1);
    expect(t.world.get(a)!.data.gauge).toBe(100);
    t.press(a, 2, east);
    t.step(5);
    expect(c.used.move).toBe(MOVES.ember.id);
    expect(c.gauge).toBeLessThan(0.5);
  });

  it("aims itself at the nearest foe", () => {
    const t = combatSetup();
    const a = t.spawn("cyndaquil", [tackle.id], { x: 0, y: 0 }, 1);
    const b = t.spawn("sentret", [], { x: 20, y: 0 });
    t.press(a, 1, { x: -1, y: 0 }); // aimed the wrong way
    t.step(5);
    expect(t.events.find((e) => e.kind === "hit")).toMatchObject({ attacker: a, target: b });
  });

  it("with no aim, turns to the nearest foe at any distance (players never aim)", () => {
    const t = combatSetup();
    const a = t.spawn("cyndaquil", [ember.id], { x: 0, y: 0 }, 1);
    t.spawn("sentret", [], { x: 0, y: -300 });
    t.press(a, 1);
    t.step(5);
    expect(t.combat.get(a)!.used.dir.y).toBeCloseTo(-1);
  });

  it("keeps walking while a move charges, even a melee one (block H)", () => {
    const t = combatSetup();
    const a = t.spawn("cyndaquil", [tackle.id], { x: 100, y: 100 }, 1);
    expect(t.data.move(tackle.id)!.behavior).toBe("melee");
    t.combat.input(a, { move: { x: 0, y: 1 }, buttons: 1 });
    t.step();
    expect(t.combat.get(a)!.casting).toBeDefined();
    const y = t.world.get(a)!.y;
    t.combat.input(a, { move: { x: 0, y: 1 }, buttons: 1 });
    t.step();
    expect(t.world.get(a)!.y).toBeGreaterThan(y);
  });

  it("dashes on bit 4 in the move direction, then waits for the cooldown", () => {
    const t = combatSetup();
    const a = t.spawn("cyndaquil", [], { x: 100, y: 100 }, 1);
    t.combat.input(a, { move: { x: 1, y: 0 }, buttons: 1 << 4 });
    t.step(4);
    const x = t.world.get(a)!.x;
    expect(x).toBeGreaterThanOrEqual(130);
    t.step();
    t.combat.input(a, { move: { x: 0, y: 0 }, buttons: 1 << 4 });
    t.step(4);
    expect(t.world.get(a)!.x).toBe(x);
  });

  it("publishes each use, with the move and its direction, even when it hits nothing", () => {
    const t = combatSetup();
    const a = t.spawn("cyndaquil", [tackle.id], { x: 0, y: 0 }, 1);
    t.press(a, 1, east);
    t.step(5);
    const hitbox = t.data.move(tackle.id)!.hitbox!;
    if (hitbox.shape !== "arc") throw new Error("Tackle should be a melee arc");
    expect(t.world.get(a)!.data).toMatchObject({ used: 1, usedMove: tackle.id, usedDx: 100, usedDy: 0, usedReach: hitbox.radiusPx, usedArc: hitbox.angleDeg });
  });

  it("publishes the cast's area, length and type while it charges, then clears them", () => {
    const t = combatSetup();
    const a = t.spawn("cyndaquil", [ember.id], { x: 0, y: 0 }, 1);
    t.press(a, 1, east);
    t.step();
    const castMs = t.data.move(ember.id)!.castTicks * 50;
    expect(castMs).toBeGreaterThan(0);
    expect(t.world.get(a)!.data).toMatchObject({ casting: 1, castMs, castType: ember.type, castShape: "rect", castOx: 0, castOy: 0, castSize: 172, castSpan: 12, castDx: 100, castDy: 0 });
    t.step(5);
    expect(t.world.get(a)!.data["castShape"]).toBeUndefined();
  });

  it("ignores an empty slot", () => {
    const t = combatSetup();
    const a = t.spawn("cyndaquil", [tackle.id], { x: 0, y: 0 }, 1);
    t.spawn("sentret", [], { x: 20, y: 0 });
    t.press(a, 3, east);
    t.step(5);
    expect(t.events).toHaveLength(0);
  });

  it("a combatant at 0 HP stops acting and takes no more damage", () => {
    const t = combatSetup();
    const a = t.spawn("cyndaquil", [ember.id], { x: 0, y: 0 }, 1, 60);
    const b = t.spawn("sentret", [scratch.id], { x: 20, y: 0 }, "wild", 2);
    t.press(a, 1, east);
    t.step(20);
    expect(t.hp(b)).toBe(0);
    const hits = t.events.length;
    t.press(b, 1, { x: -1, y: 0 });
    t.step(20);
    t.press(a, 1, east);
    t.step(60);
    expect(t.events.slice(hits).filter((e) => e.target === b || e.attacker === b)).toHaveLength(0);
  });

  it("is deterministic for a seed", () => {
    const run = () => {
      const t = combatSetup(42);
      const a = t.spawn("cyndaquil", [tackle.id, ember.id], { x: 0, y: 0 }, 1);
      t.spawn("sentret", [], { x: 20, y: 0 });
      t.spawn("chikorita", [], { x: 24, y: 6 });
      for (let i = 0; i < 100; i++) {
        if (i % 30 === 0) t.press(a, 1 + ((i / 30) % 2), east);
        t.step();
      }
      return t.events;
    };
    expect(run()).toEqual(run());
  });
});

describe("movement", () => {
  it("moves freely in 8 directions at the speed scale", () => {
    const t = combatSetup();
    const a = t.spawn("cyndaquil", [], { x: 0, y: 0 }, 1);
    const d = Math.SQRT1_2;
    t.walk(a, { x: d, y: d });
    t.step();
    const p = t.pos(a);
    expect(p.x).toBeCloseTo(p.y);
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(t.combat.movePx(a));
  });

  it("faster Pokémon move further and recover sooner (within the limits)", () => {
    const t = combatSetup();
    const fast = t.spawn("rattata", [tackle.id], { x: 0, y: 0 }, 1, 40);
    const slow = t.spawn("hoothoot", [tackle.id], { x: 0, y: 100 }, 1, 40);
    expect(t.combat.movePx(fast)).toBeGreaterThan(t.combat.movePx(slow));
    expect(t.combat.gaugeTicks(fast)).toBeLessThan(t.combat.gaugeTicks(slow));
    const { moveMinPx, moveMaxPx } = t.data.tuning.speed;
    for (const id of [fast, slow]) {
      expect(t.combat.movePx(id)).toBeGreaterThanOrEqual(moveMinPx / 20);
      expect(t.combat.movePx(id)).toBeLessThanOrEqual(moveMaxPx / 20);
    }
  });

});
