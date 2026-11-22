import { BUTTON, type HitEvent } from "@soulsilver/shared/game";
import type { HeldItem } from "@soulsilver/shared/items";
import { describe, expect, it } from "vitest";
import { goesOffAt } from "../src/combat";
import { combatSetup, MOVES, realAction, SPECIES } from "./combat-fixture";

// Block C (docs/roadmap/combate.md): normal and special moves, accuracy, cadence and cooldowns, the leap, dodge,
// parry, guard, feint and combo, with the real tuning ("real") unless a test needs the formula's damage as is.

const { tackle, ember, hyperBeam, growl, quickAttack, strength, takeDown } = MOVES;
const east = { x: 1, y: 0 };
const kinds = (t: { events: HitEvent[] }, kind: string) => t.events.filter((e) => e.kind === kind);
const quickClaw: HeldItem = { item: 217, effect: { trigger: "quick" }, parameter: 100, consumable: false };
const leppa: HeldItem = { item: 154, effect: { trigger: "cooldown-restore", seconds: 2 }, parameter: 0, consumable: true };

/** A punching bag that never faints, put back where it was. */
function bag(t: ReturnType<typeof combatSetup>, id: number, at: { x: number; y: number }) {
  t.combat.get(id)!.hp = 999;
  t.world.update({ ...t.world.get(id)!, x: at.x, y: at.y });
}

/** Steps until the attacker's current cast has gone off. */
function finish(t: ReturnType<typeof combatSetup>, id: number) {
  const c = t.combat.get(id)!;
  if (c.casting) t.step(c.casting.readyTick - t.tick);
}

describe("move classes and slots (C.1)", () => {
  it("puts normal moves in slots 1–2 and specials in 3–4", () => {
    const t = combatSetup(1, "real");
    const a = t.spawn("cyndaquil", [hyperBeam.id, ember.id, growl.id, tackle.id], { x: 0, y: 0 }, 1);
    expect(t.combat.get(a)!.moves.map((m) => m?.id)).toEqual([ember.id, tackle.id, hyperBeam.id, growl.id]);
    expect(t.world.get(a)!.data).toMatchObject({ move1: ember.id, move2: tackle.id, move3: hyperBeam.id, move4: growl.id });
  });

  it("leaves a slot with no move of its class empty, and pressing it does nothing", () => {
    const t = combatSetup(1, "real");
    const a = t.spawn("cyndaquil", [tackle.id], { x: 0, y: 0 }, 1);
    t.spawn("sentret", [], { x: 20, y: 0 });
    t.hold(a, 1 << 2);
    t.step(20);
    expect(t.combat.get(a)!.used.count).toBe(0);
    expect(t.world.get(a)!.data["move3"]).toBeUndefined();
  });

  it("keeps PP Ups with their move", () => {
    const t = combatSetup(1, "real");
    const e = t.world.add({ kind: "pokemon", area: "arena", x: 0, y: 0, level: 0, facing: "east", data: {} });
    const c = t.combat.spawn(t.world, e.id, { species: SPECIES.cyndaquil.id, level: 10, moves: [hyperBeam.id, tackle.id], cooldownMul: [0.85, 1] }, 1);
    expect(c.cooldownMul).toEqual([1, 1, 0.85, 1]);
  });
});

describe("accuracy (C.2)", () => {
  function shots(accuracy: number | null, evasion = 0) {
    const t = combatSetup(7);
    const a = t.spawn("cyndaquil", [tackle.id], { x: 0, y: 0 }, 1);
    const b = t.spawn("sentret", [], { x: 20, y: 0 });
    t.data.move(tackle.id)!.accuracy = accuracy;
    t.combat.get(b)!.stages.evasion = evasion;
    for (let i = 0; i < 200; i++) {
      bag(t, b, { x: 20, y: 0 });
      t.world.update({ ...t.world.get(a)!, x: 0, y: 0 });
      t.press(a, 1, east);
      t.step(2);
    }
    return { hit: kinds(t, "hit").length, missed: kinds(t, "missed").length };
  }

  it("rolls the move's accuracy when it reaches its target", () => {
    const { hit, missed } = shots(50);
    expect(hit + missed).toBe(200);
    expect(missed).toBeGreaterThan(70);
    expect(missed).toBeLessThan(130);
  });

  it("misses more against raised evasion (the original's stages)", () => {
    expect(shots(50, 6).missed).toBeGreaterThan(150);
  });

  it("never misses with no accuracy", () => {
    expect(shots(null).missed).toBe(0);
  });
});

describe("bosses", () => {
  it("a wild legendary has twice its HP and is marked; a player's has its own, unmarked", () => {
    const t = combatSetup(1, "real");
    const wild = t.spawn("raikou", [tackle.id], { x: 0, y: 0 }, "wild", 40);
    const mine = t.spawn("raikou", [tackle.id], { x: 0, y: 0 }, 1, 40);
    const common = t.spawn("sentret", [tackle.id], { x: 0, y: 0 }, "wild", 40);
    t.step();
    expect(t.hp(wild)).toBe(2 * t.hp(mine));
    expect(t.world.get(wild)!.data).toMatchObject({ boss: true, hp: t.hp(wild), hpMax: t.hp(wild) });
    for (const id of [mine, common]) expect(t.world.get(id)!.data["boss"]).toBeUndefined();
  });
});

describe("cadence and cooldowns (C.3)", () => {
  it("chains normal moves with no cooldown: 0.4 s, 0.2 s, 0.2 s, then 0.4 s again", () => {
    const t = combatSetup(1, "real");
    const a = t.spawn("cyndaquil", [tackle.id], { x: 0, y: 0 }, 1);
    const b = t.spawn("sentret", [], { x: 20, y: 0 });
    const casts: number[] = [];
    for (let i = 0; i < 4; i++) {
      bag(t, b, { x: 20, y: 0 });
      t.press(a, 1, east);
      t.step();
      const c = t.combat.get(a)!.casting!;
      casts.push(c.readyTick - c.startTick);
      finish(t, a);
    }
    expect(casts).toEqual([8, 4, 4, 8]);
  });

  it("starts the cadence over after a pause longer than the combo window", () => {
    const t = combatSetup(1, "real");
    const a = t.spawn("cyndaquil", [tackle.id], { x: 0, y: 0 }, 1);
    t.spawn("sentret", [], { x: 20, y: 0 });
    t.press(a, 1, east);
    t.step();
    finish(t, a);
    t.step(31);
    t.press(a, 1, east);
    t.step();
    const c = t.combat.get(a)!.casting!;
    expect(c.readyTick - c.startTick).toBe(8);
  });

  it("casts a special for 0.8 s, then waits 5 s + (power − 80)/10 (Hyper Beam: 12 s)", () => {
    const t = combatSetup(1, "real");
    const a = t.spawn("cyndaquil", [hyperBeam.id], { x: 0, y: 0 }, 1);
    t.spawn("sentret", [], { x: 200, y: 0 });
    const c = t.combat.get(a)!;
    t.press(a, 1, east);
    t.step();
    expect(c.casting!.readyTick - c.casting!.startTick).toBe(16);
    finish(t, a);
    expect(c.used.count).toBe(1);
    expect(c.readyAt[2]! - t.tick).toBe(240);
    t.step();
    t.press(a, 1, east);
    t.step();
    expect(c.casting).toBeUndefined();
    t.step(240);
    t.press(a, 1, east);
    t.step();
    expect(c.casting).toBeDefined();
  });

  it("gives status moves the base cooldown, shortened by PP Ups", () => {
    const t = combatSetup(1, "real");
    const e = t.world.add({ kind: "pokemon", area: "arena", x: 0, y: 0, level: 0, facing: "east", data: {} });
    const c = t.combat.spawn(t.world, e.id, { species: SPECIES.cyndaquil.id, level: 10, moves: [growl.id], cooldownMul: [0.85] }, 1);
    t.spawn("sentret", [], { x: 20, y: 0 });
    t.hold(e.id, 1 << 2);
    t.step();
    finish(t, e.id);
    expect(c.readyAt[2]! - t.tick).toBe(85);
  });

  it("deals a third of the formula's damage with normal moves", () => {
    const amount = (mul: number) => {
      const t = combatSetup(3, { normalDamageMul: mul });
      const a = t.spawn("cyndaquil", [tackle.id], { x: 0, y: 0 }, 1, 50);
      t.spawn("sentret", [], { x: 20, y: 0 }, "wild", 50);
      t.press(a, 1, east);
      t.step(10);
      return kinds(t, "hit")[0]!.amount;
    };
    expect(amount(0.3333)).toBe(Math.max(1, Math.floor(amount(1) * 0.3333)));
  });

  it("an Ether ends the longest wait, an Elixir both; neither works with nothing waiting", () => {
    const t = combatSetup(1, "real");
    const a = t.spawn("cyndaquil", [hyperBeam.id, growl.id], { x: 0, y: 0 }, 1);
    t.spawn("sentret", [], { x: 30, y: 0 });
    const c = t.combat.get(a)!;
    for (const n of [1, 2]) {
      t.press(a, n, east);
      t.step();
      finish(t, a);
      t.step();
    }
    expect(c.readyAt[2]).toBeGreaterThan(c.readyAt[3]!);
    expect(t.combat.restore(a, false)).toBe(true);
    expect(c.readyAt[2]).toBeLessThanOrEqual(t.tick);
    expect(c.readyAt[3]).toBeGreaterThan(t.tick);
    expect(t.combat.restore(a, true)).toBe(true);
    expect(c.readyAt[3]).toBeLessThanOrEqual(t.tick);
    expect(t.combat.restore(a, true)).toBe(false);
  });

  it("Quick Claw: the first normal of a chain comes out as fast as the next ones", () => {
    const t = combatSetup(1, "real");
    const e = t.world.add({ kind: "pokemon", area: "arena", x: 0, y: 0, level: 0, facing: "east", data: {} });
    const c = t.combat.spawn(t.world, e.id, { species: SPECIES.cyndaquil.id, level: 10, moves: [tackle.id], held: quickClaw }, 1);
    t.spawn("sentret", [], { x: 20, y: 0 });
    t.hold(e.id, 1);
    t.step();
    expect(c.casting!.readyTick - c.casting!.startTick).toBe(4);
  });

  it("a Leppa Berry takes its seconds off a special's cooldown, once", () => {
    const t = combatSetup(1, "real");
    const e = t.world.add({ kind: "pokemon", area: "arena", x: 0, y: 0, level: 0, facing: "east", data: {} });
    const c = t.combat.spawn(t.world, e.id, { species: SPECIES.cyndaquil.id, level: 10, moves: [hyperBeam.id], held: leppa }, 1);
    t.spawn("sentret", [], { x: 200, y: 0 });
    t.hold(e.id, 1 << 2);
    t.step();
    finish(t, e.id);
    expect(c.readyAt[2]! - t.tick).toBe(200);
    expect(c.held).toBeUndefined();
  });
});

describe("the charge and leap of contact moves (C.4)", () => {
  /** Cyndaquil (a player's, or wild) with one move, and a Sentret `gap` px east; `begin` presses the move. */
  function lunge(move: number, gap: number, owner: 1 | "wild" = 1) {
    const t = combatSetup(1, "real");
    const a = t.spawn("cyndaquil", [move], { x: 0, y: 0 }, owner);
    const b = t.spawn("sentret", [], { x: gap, y: 0 }, owner === 1 ? "wild" : 1);
    const cast = t.data.move(move)!.special ? 16 : 8;
    /** Presses it and steps to the last tick before the charge is over. */
    const charge = () => {
      t.press(a, 1, east);
      t.step(cast);
    };
    return { t, a, b, ca: t.combat.get(a)!, charge };
  }

  it.each([
    ["normal melee", tackle.id],
    ["special melee", strength.id],
    ["normal dash", quickAttack.id],
    ["special dash", takeDown.id],
  ])("charges, then leaps until it touches its foe, then goes off: %s", (_name, move) => {
    const { t, a, b, ca, charge } = lunge(move, 60);
    charge();
    expect(t.pos(a)).toEqual({ x: 0, y: 0 });
    // 44 px at 16 px a tick: three ticks, and it goes off as it lands.
    const at: number[] = [];
    for (let i = 0; i < 3; i++) {
      expect(ca.used.count).toBe(0);
      t.step();
      at.push(Math.round(t.pos(a).x));
    }
    expect(at.slice(0, 2)).toEqual([15, 29]);
    expect(at[2]).toBeGreaterThanOrEqual(44);
    expect(ca.used.count).toBe(1);
    t.step();
    expect(t.events.filter((e) => e.target === b && (e.kind === "hit" || e.kind === "missed"))).toHaveLength(1);
  });

  it("walks while it charges, and not in the air", () => {
    const { t, a, b, ca } = lunge(tackle.id, 60);
    for (let i = 0; i < 8; i++) {
      t.hold(a, 1 << t.slotOf(a, 1), { x: 0, y: 1 }, east);
      t.step();
    }
    const from = t.pos(a);
    expect(from.y).toBeGreaterThan(20);
    // It leaps from where it walked to, straight at its foe.
    const gap = Math.hypot(60 - from.x, from.y);
    for (let i = 0; i < 4 && ca.used.count === 0; i++) {
      t.hold(a, 0, { x: 0, y: 1 });
      t.step();
    }
    const to = t.pos(a);
    expect(ca.used.count).toBe(1);
    expect(Math.hypot(to.x - from.x, to.y - from.y)).toBeCloseTo(Math.min(48, gap - 16));
    expect(Math.atan2(to.y - from.y, to.x - from.x)).toBeCloseTo(Math.atan2(t.pos(b).y - from.y, 60 - from.x), 1);
  });

  it("touching its foe already, it goes off as the charge ends", () => {
    const { t, ca, charge } = lunge(tackle.id, 16);
    charge();
    expect(ca.used.count).toBe(0);
    t.step();
    expect(ca.used.count).toBe(1);
  });

  it("leaps at most leapMaxPx", () => {
    const { t, a, charge } = lunge(tackle.id, 200);
    charge();
    t.step(5);
    expect(t.pos(a).x).toBeCloseTo(48);
    expect(kinds(t, "hit")).toHaveLength(0);
  });

  it("leaps at where the foe is when the charge ends, not where it was", () => {
    const { t, a, b, charge } = lunge(tackle.id, 60);
    t.world.update({ ...t.world.get(b)!, x: 0, y: -60 });
    charge();
    expect(t.world.get(a)!.facing).toBe("north");
    t.step(3);
    expect(t.pos(a).y).toBeCloseTo(-44);
    expect(kinds(t, "hit").length + kinds(t, "missed").length).toBe(1);
  });

  it("does not turn in the air: a foe that walks away is missed", () => {
    const { t, a, b, charge } = lunge(tackle.id, 60);
    charge();
    t.step();
    t.world.update({ ...t.world.get(b)!, x: 0, y: -60 });
    t.step(2);
    expect(t.pos(a).x).toBeCloseTo(44);
    expect(kinds(t, "hit")).toHaveLength(0);
  });

  it("a confused one that goes astray leaps the wrong way", () => {
    const { t, a, b, ca } = lunge(tackle.id, 60);
    const ys: number[] = [];
    for (let i = 0; i < 20; i++) {
      ca.statuses.set("confusion", { id: "confusion", startTick: t.tick, untilTick: 9999, count: 0 });
      bag(t, b, { x: 60, y: 0 });
      bag(t, a, { x: 0, y: 0 });
      t.press(a, 1, east);
      t.step(12);
      ys.push(t.pos(a).y);
    }
    expect(ys.some((y) => Math.abs(y) > 1)).toBe(true);
    expect(ys.some((y) => y === 0)).toBe(true);
  });

  it("does not leap with ranged moves", () => {
    const t = combatSetup(1, "real");
    const a = t.spawn("cyndaquil", [ember.id, hyperBeam.id], { x: 0, y: 0 }, 1);
    t.spawn("sentret", [], { x: 100, y: 0 });
    for (const n of [1, 2]) {
      t.press(a, n, east);
      t.step(17);
    }
    expect(t.pos(a).x).toBe(0);
  });

  it("can be parried until it lands, and not as it does", () => {
    for (const [press, parried] of [[9, true], [10, true], [11, false]] as const) {
      const { t, b } = lunge(tackle.id, 60, "wild");
      for (let tick = 1; tick <= 12; tick++) {
        if (tick === 1) t.press(1, 1, east);
        t.hold(b, tick === press ? BUTTON.guard : 0);
        t.step();
      }
      expect(kinds(t, "parried"), `press on tick ${press}`).toHaveLength(parried ? 1 : 0);
    }
  });

  it("tells the tick it goes off from the start of the charge", () => {
    const { t, a, ca } = lunge(tackle.id, 60);
    t.press(a, 1, east);
    for (let i = 1; i < 11; i++) {
      t.step();
      expect(goesOffAt(ca.casting!)).toBe(11);
    }
    t.step();
    expect(ca.used.count).toBe(1);
  });

  it("keeps the mark through the leap", () => {
    const { t, a, charge } = lunge(tackle.id, 60, "wild");
    charge();
    for (let i = 0; i < 2; i++) {
      t.step();
      expect(t.world.get(a)!.data["castMark"]).toBe("normal");
    }
    t.step();
    expect(t.world.get(a)!.data["castMark"]).toBeUndefined();
  });

  it("a guard press feints the charge, not the leap", () => {
    for (const leaping of [false, true]) {
      const { t, a, ca, charge } = lunge(tackle.id, 60);
      charge();
      if (leaping) t.step();
      t.hold(a, BUTTON.guard);
      t.step(3);
      expect(ca.used.count).toBe(leaping ? 1 : 0);
    }
  });

  it("publishes the area where it will land, and how far the leap is", () => {
    const { t, a, charge } = lunge(tackle.id, 60);
    const data = () => t.world.get(a)!.data;
    charge();
    expect(data()).toMatchObject({ castShape: "arc", castOx: 44, castOy: 0, castDx: 100, castMs: 400 });
    expect(data()["leap"]).toBeUndefined();
    t.step();
    expect(data()["leap"]).toBe(0.33);
    expect(data()["castShape"]).toBeUndefined();
    t.step(2);
    expect(data()["leap"]).toBeUndefined();
  });
});

describe("dodge, parry and guard (C.5)", () => {
  /** A wild Sentret 20 px east of the player's Cyndaquil, ready to tackle it (it lands 9 ticks after the press). */
  function duel(action: Parameters<typeof combatSetup>[1] = "real", moves: number[] = [tackle.id], level = 10) {
    const t = combatSetup(5, action);
    const a = t.spawn("cyndaquil", [tackle.id, hyperBeam.id], { x: 0, y: 0 }, 1, level);
    const b = t.spawn("sentret", moves, { x: 20, y: 0 }, "wild", level);
    return { t, a, b, ca: t.combat.get(a)!, cb: t.combat.get(b)! };
  }

  it("dodging leaves it untouchable for 0.5 s: the move goes through", () => {
    const { t, a, b, ca } = duel();
    t.press(b, 1, { x: -1, y: 0 });
    t.step(2);
    t.hold(a, BUTTON.dash, { x: 0, y: 1 });
    t.step(4);
    expect(t.world.get(a)!.data["dodge"]).toBe(true);
    t.world.update({ ...t.world.get(a)!, x: 0, y: 0 });
    t.step(4);
    expect(kinds(t, "evaded")).toMatchObject([{ attacker: b, target: a }]);
    expect(ca.hp).toBe(ca.stats.hp);
    t.step(4);
    expect(t.world.get(a)!.data["dodge"]).toBeUndefined();
  });

  it("dodges specials too", () => {
    const { t, a, b, ca } = duel("real", [hyperBeam.id]);
    t.press(b, 1, { x: -1, y: 0 });
    t.step(10);
    t.hold(a, BUTTON.dash, { x: 0, y: 1 });
    t.step(4);
    t.world.update({ ...t.world.get(a)!, x: 0, y: 0 });
    t.step(4);
    expect(kinds(t, "evaded")).toHaveLength(1);
    expect(ca.hp).toBe(ca.stats.hp);
  });

  it("opens the dodge again 0.5 s plus a cooldown of 0.8–1.6 s later, shorter with more Speed", () => {
    const t = combatSetup(1, "real");
    const fast = t.spawn("raikou", [tackle.id], { x: 0, y: 0 }, 1);
    const slow = t.spawn("sentret", [tackle.id], { x: 200, y: 0 }, 2);
    expect(t.combat.reflexTicks(fast)).toBeLessThan(t.combat.reflexTicks(slow));
    for (const id of [fast, slow]) {
      expect(t.combat.reflexTicks(id)).toBeGreaterThanOrEqual(16);
      expect(t.combat.reflexTicks(id)).toBeLessThanOrEqual(32);
    }
    t.hold(fast, BUTTON.dash);
    t.step();
    expect(t.combat.get(fast)!.evade.readyAt).toBe(t.tick + 10 + t.combat.reflexTicks(fast));
  });

  it("parrying a normal move: no damage, the attacker stunned 2 s, the parrier untouchable 1 s", () => {
    const { t, a, b, ca, cb } = duel();
    t.press(b, 1, { x: -1, y: 0 });
    t.step(6);
    t.hold(a, BUTTON.guard);
    t.step();
    const at = t.tick;
    t.step(2);
    expect(kinds(t, "parried")).toMatchObject([{ attacker: b, target: a }]);
    expect(kinds(t, "hit")).toHaveLength(0);
    expect(ca.hp).toBe(ca.stats.hp);
    expect(cb.stunUntil).toBe(t.tick + 40);
    expect(ca.invulnUntil).toBe(t.tick + 20);
    expect(t.world.get(b)!.data["stun"]).toBe(true);
    expect(at).toBeLessThan(t.tick);
  });

  it("pushes the parried attacker away from the parrier", () => {
    const { t, a, b } = duel();
    t.press(b, 1, { x: -1, y: 0 });
    t.step(6);
    t.hold(a, BUTTON.guard);
    t.step(3);
    const px = realAction().parryPushPx;
    expect(kinds(t, "parried")[0]!.push).toEqual({ x: px, y: 0 });
    expect(t.world.get(b)!.x).toBeGreaterThanOrEqual(t.world.get(a)!.x + px);
  });

  it("stuns the attacker of a parried projectile, however far it is", () => {
    const t = combatSetup(5, "real");
    const a = t.spawn("cyndaquil", [tackle.id], { x: 0, y: 0 }, 1);
    const b = t.spawn("sentret", [ember.id], { x: 120, y: 0 });
    t.press(b, 1, { x: -1, y: 0 });
    t.step(2);
    t.hold(a, BUTTON.guard);
    for (let i = 0; i < 60 && kinds(t, "parried").length === 0; i++) t.step();
    expect(kinds(t, "parried")).toMatchObject([{ attacker: b, target: a }]);
    expect(t.combat.get(b)!.stunUntil).toBeGreaterThan(t.tick);
    // Away from the parrier, not from the projectile.
    expect(kinds(t, "parried")[0]!.push.x).toBeGreaterThan(0);
  });

  it("a special goes through a parry", () => {
    const { t, a, b, ca } = duel("real", [hyperBeam.id]);
    t.press(b, 1, { x: -1, y: 0 });
    t.step(12);
    t.hold(a, BUTTON.guard);
    t.step(6);
    expect(kinds(t, "parried")).toHaveLength(0);
    expect(kinds(t, "hit")).toMatchObject([{ attacker: b, target: a }]);
    expect(ca.hp).toBeLessThan(ca.stats.hp);
  });

  it("parries every hit of a multi-hit move at once", () => {
    const { t, a, b } = duel();
    t.data.move(tackle.id)!.hits = 3;
    t.press(b, 1, { x: -1, y: 0 });
    t.step(6);
    t.hold(a, BUTTON.guard);
    t.step(3);
    expect(kinds(t, "parried")).toHaveLength(1);
    expect(kinds(t, "hit")).toHaveLength(0);
  });

  it("a stunned Pokémon does nothing; the first blow ends the stun and lands 10% harder", () => {
    const amount = (stun: boolean) => {
      const { t, a, b, cb } = duel({ normalDamageMul: 1 }, [tackle.id], 50);
      if (stun) cb.stunUntil = 1000;
      t.hold(b, 1, { x: 1, y: 0 });
      t.press(a, 1, east);
      t.step(10);
      if (stun) expect(cb.used.count).toBe(0);
      if (stun) expect(cb.stunUntil).toBe(0);
      return kinds(t, "hit").find((h) => h.target === b)!.amount;
    };
    expect(amount(true)).toBe(Math.floor(amount(false) * 1.1));
  });

  it("the stun wears off by itself after 2 s", () => {
    const { t, b, cb } = duel();
    cb.stunUntil = t.tick + 40;
    t.step(38);
    t.press(b, 1, { x: -1, y: 0 });
    t.step();
    expect(cb.casting).toBeUndefined();
    t.step();
    t.press(b, 1, { x: -1, y: 0 });
    t.step();
    expect(cb.casting).toBeDefined();
  });

  it("1 s untouchable after a parry: a second attacker cannot punish it", () => {
    const { t, a, b } = duel();
    const d = t.spawn("rattata", [tackle.id], { x: -20, y: 0 });
    t.press(b, 1, { x: -1, y: 0 });
    t.step(6);
    t.hold(a, BUTTON.guard);
    t.step(3);
    expect(kinds(t, "parried")).toHaveLength(1);
    t.press(d, 1, east);
    t.step(9);
    expect(kinds(t, "evaded")).toMatchObject([{ attacker: d, target: a }]);
  });

  it("guarding (held past the window) stands still and takes 80% less from normal moves, nothing less from specials", () => {
    const amount = (guard: boolean, move: number) => {
      const { t, a, b, ca } = duel({ normalDamageMul: 1 }, [move], 50);
      const from = t.pos(a);
      for (let i = 0; i < 40; i++) {
        t.hold(a, guard ? BUTTON.guard : 0, guard ? { x: 0, y: 1 } : { x: 0, y: 0 });
        if (i === 15) t.press(b, 1, { x: -1, y: 0 });
        t.step();
      }
      // It did not walk south (the hit's knockback pushed it west).
      if (guard) expect(t.pos(a).y).toBe(from.y);
      expect(kinds(t, "parried")).toHaveLength(0);
      expect(ca.hp).toBeLessThan(ca.stats.hp);
      return kinds(t, "hit").find((h) => h.target === a)!.amount;
    };
    expect(amount(true, tackle.id)).toBe(Math.max(1, Math.floor(amount(false, tackle.id) * 0.2)));
    expect(amount(true, hyperBeam.id)).toBe(amount(false, hyperBeam.id));
  });

  it("a player's guard press during a cast is a feint: no cooldown, and the parry opens", () => {
    const { t, a, ca } = duel();
    t.press(a, 2, east);
    t.step(4);
    t.hold(a, BUTTON.guard);
    t.step();
    expect(ca.casting).toBeUndefined();
    expect(ca.used.count).toBe(0);
    expect(ca.readyAt[2]).toBe(0);
    expect(ca.guard.until).toBe(t.tick + 10);
  });

  it("a CPU's guard press does not stop its cast", () => {
    const { t, b, cb } = duel();
    t.press(b, 1, { x: -1, y: 0 });
    t.step(2);
    t.hold(b, BUTTON.guard);
    t.step();
    expect(cb.casting).toBeDefined();
  });

  it("starts the parry cooldown when the window ends, set by Speed", () => {
    const { t, a, ca } = duel();
    t.hold(a, BUTTON.guard);
    t.step();
    const opened = t.tick;
    t.step();
    expect(ca.guard.readyAt).toBe(opened + 10 + t.combat.reflexTicks(a));
    t.step(12);
    t.hold(a, BUTTON.guard);
    t.step();
    expect(ca.guard.until).toBe(opened + 10);
  });
});

describe("parry window and the cast marks (C.5, C.8)", () => {
  const west = { x: -1, y: 0 };
  function duel(moves: number[] = [tackle.id], gap = 20, action: Parameters<typeof combatSetup>[1] = "real", level = 10) {
    const t = combatSetup(5, action);
    const a = t.spawn("cyndaquil", [tackle.id], { x: 0, y: 0 }, 1, level);
    const b = t.spawn("sentret", moves, { x: gap, y: 0 }, "wild", level);
    const mark = (id: number) => t.world.get(id)!.data["castMark"];
    /** Steps until the move of `b` reached someone or is gone, at most 80 ticks. */
    const settle = () => {
      for (let i = 0; i < 80 && (t.combat.get(b)!.casting || t.world.all().some((e) => e.kind === "projectile")); i++) t.step();
    };
    return { t, a, b, ca: t.combat.get(a)!, cb: t.combat.get(b)!, mark, settle };
  }

  // The tackle begins on tick 3 and leaves on tick 11: its window is ticks 3 to 10.
  it.each([
    [2, false],
    [3, true],
    [6, true],
    [10, true],
    [11, false],
  ])("a guard press on tick %i parries a move cast from tick 3 to 11: %s", (at, parried) => {
    const { t, a, b } = duel();
    for (let tick = 1; tick <= 12; tick++) {
      if (tick === 3) t.press(b, 1, west);
      t.hold(a, tick === at ? BUTTON.guard : 0);
      t.step();
    }
    expect(kinds(t, "parried")).toHaveLength(parried ? 1 : 0);
    expect(kinds(t, "hit")).toHaveLength(parried ? 0 : 1);
  });

  it("remembers the parry until the shot touches, long after the pose", () => {
    const { t, a, b, cb, settle, mark } = duel([ember.id], 120);
    t.press(b, 1, west);
    t.step();
    t.hold(a, BUTTON.guard);
    t.step(12);
    expect(t.world.get(a)!.data["parry"]).toBeUndefined();
    expect(kinds(t, "parried")).toHaveLength(0);
    expect(cb.stunUntil).toBe(0);
    expect(mark(b)).toBeUndefined();
    settle();
    expect(kinds(t, "parried")).toMatchObject([{ attacker: b, target: a }]);
    expect(kinds(t, "hit")).toHaveLength(0);
    expect(cb.stunUntil).toBeGreaterThan(t.tick);
  });

  it("parries nobody when the move never touches", () => {
    const { t, a, b, cb, settle } = duel([ember.id], 120);
    t.press(b, 1, west);
    t.step();
    t.hold(a, BUTTON.guard);
    t.step(10);
    t.world.update({ ...t.world.get(a)!, y: 200 });
    settle();
    expect(kinds(t, "parried")).toHaveLength(0);
    expect(cb.stunUntil).toBe(0);
  });

  it("a press while the shot flies is too late", () => {
    const { t, a, b, settle } = duel([ember.id], 120);
    t.press(b, 1, west);
    t.step(10);
    expect(t.world.all().some((e) => e.kind === "projectile")).toBe(true);
    t.hold(a, BUTTON.guard);
    t.step();
    settle();
    expect(kinds(t, "parried")).toHaveLength(0);
    expect(kinds(t, "hit").length + kinds(t, "missed").length).toBe(1);
  });

  it("a dropped cast takes its parry with it", () => {
    const { t, a, b, cb } = duel();
    t.press(b, 1, west);
    t.step(2);
    t.hold(a, BUTTON.guard);
    t.step();
    cb.casting = undefined;
    t.step();
    t.press(b, 1, west);
    t.step(12);
    expect(kinds(t, "parried")).toHaveLength(0);
    expect(kinds(t, "hit")).toHaveLength(1);
  });

  it("is each defender's own: the other one in the area takes the hit", () => {
    const { t, a, b } = duel();
    const d = t.spawn("cyndaquil", [tackle.id], { x: 0, y: 6 }, 1);
    t.press(b, 1, west);
    t.step(3);
    t.hold(a, BUTTON.guard);
    t.step(8);
    expect(kinds(t, "parried")).toMatchObject([{ attacker: b, target: a }]);
    expect(kinds(t, "hit")).toMatchObject([{ attacker: b, target: d }]);
  });

  it("holding without a parry guards at once; letting go takes it all", () => {
    const amount = (press: number, hold: boolean) => {
      const { t, a, b } = duel([tackle.id], 20, { normalDamageMul: 1 }, 50);
      for (let tick = 1; tick <= 12; tick++) {
        if (tick === 3) t.press(b, 1, west);
        t.hold(a, tick === press || (hold && tick > press) ? BUTTON.guard : 0);
        t.step();
      }
      expect(kinds(t, "parried")).toHaveLength(0);
      return kinds(t, "hit").find((h) => h.target === a)!.amount;
    };
    const full = amount(99, false);
    expect(amount(2, true)).toBe(Math.max(1, Math.floor(full * 0.2)));
    expect(amount(2, false)).toBe(full);
  });

  it("marks a CPU's normal cast for all of it, and nothing once it left", () => {
    const { t, b, mark } = duel([ember.id], 120);
    t.press(b, 1, west);
    for (let i = 0; i < 8; i++) {
      t.step();
      expect(mark(b)).toBe("normal");
    }
    t.step();
    expect(t.world.all().some((e) => e.kind === "projectile")).toBe(true);
    expect(mark(b)).toBeUndefined();
  });

  it("marks a special as special, and a player's cast not at all", () => {
    const { t, a, b, mark } = duel([hyperBeam.id]);
    t.press(b, 1, west);
    t.press(a, 1, east);
    for (let i = 0; i < 5; i++) {
      t.step();
      expect(mark(b)).toBe("special");
      expect(mark(a)).toBeUndefined();
    }
  });

  it("marks a parried CPU Pokémon for 0.4 s from the contact, not from the press", () => {
    const { t, a, b, mark } = duel();
    t.press(b, 1, west);
    t.step(2);
    t.hold(a, BUTTON.guard);
    t.step();
    expect(mark(b)).toBe("normal");
    t.step(6);
    expect(kinds(t, "parried")).toHaveLength(1);
    for (let i = 0; i < 8; i++) {
      expect(mark(b)).toBe("parried");
      t.step();
    }
    expect(mark(b)).toBeUndefined();
  });
});

describe("combo (C.6)", () => {
  function chain(seed = 1, action: Parameters<typeof combatSetup>[1] = "real") {
    const t = combatSetup(seed, action);
    const a = t.spawn("cyndaquil", [tackle.id, hyperBeam.id], { x: 0, y: 0 }, 1, 50);
    const b = t.spawn("sentret", [tackle.id], { x: 20, y: 0 }, "wild", 50);
    const hit = () => {
      bag(t, b, { x: 20, y: 0 });
      t.world.update({ ...t.world.get(a)!, x: 0, y: 0 });
      t.press(a, 1, east);
      t.step();
      finish(t, a);
    };
    return { t, a, b, ca: t.combat.get(a)!, hit };
  }

  it("counts normal hits in a row, up to 10", () => {
    const { t, a, ca, hit } = chain();
    for (let i = 0; i < 12; i++) hit();
    expect(ca.combo.count).toBe(10);
    expect(t.world.get(a)!.data["combo"]).toBe(10);
  });

  it("adds 1% damage per hit in a row", () => {
    const amount = (count: number) => {
      const { t, b, ca, hit } = chain(4, { normalDamageMul: 1 });
      ca.combo = { count, at: t.tick };
      hit();
      return kinds(t, "hit").find((h) => h.target === b)!.amount;
    };
    expect(amount(5)).toBe(Math.floor(amount(0) * 1.05));
  });

  it("starts over after 1.5 s without a hit", () => {
    const { t, ca, hit } = chain();
    hit();
    hit();
    t.step(31);
    hit();
    expect(ca.combo.count).toBe(1);
  });

  it("is lost when hurt, when parried and on a miss", () => {
    const hurt = chain();
    hurt.hit();
    hurt.hit();
    hurt.t.press(hurt.b, 1, { x: -1, y: 0 });
    hurt.t.step(10);
    expect(hurt.ca.combo.count).toBe(0);

    const parried = chain();
    parried.hit();
    bag(parried.t, parried.b, { x: 20, y: 0 });
    parried.t.world.update({ ...parried.t.world.get(parried.a)!, x: 0, y: 0 });
    parried.t.press(parried.a, 1, east);
    parried.t.step(2);
    parried.t.hold(parried.b, BUTTON.guard);
    parried.t.step();
    finish(parried.t, parried.a);
    expect(kinds(parried.t, "parried")).toHaveLength(1);
    expect(parried.ca.combo.count).toBe(0);

    const missed = chain();
    missed.hit();
    missed.t.data.move(tackle.id)!.accuracy = 0;
    missed.hit();
    expect(missed.ca.combo.count).toBe(0);
  });

  it("a special that lands takes the bonus and ends the combo", () => {
    const amount = (count: number) => {
      const { t, a, b, ca } = chain(4, { normalDamageMul: 1 });
      ca.combo = { count, at: t.tick };
      t.press(a, 2, east);
      t.step();
      finish(t, a);
      expect(ca.combo.count).toBe(0);
      return kinds(t, "hit").find((h) => h.target === b)!.amount;
    };
    expect(amount(10)).toBe(Math.floor(amount(0) * 1.1));
  });

  describe("missing the first normal of a chain", () => {
    const miss = (t: ReturnType<typeof combatSetup>) => void (t.data.move(tackle.id)!.accuracy = 0);

    it("makes that move wait 1 s, and the next normal is a first again", () => {
      const { t, a, ca, hit } = chain();
      miss(t);
      hit();
      expect(ca.readyAt[0]! - t.tick).toBe(20);
      t.step();
      expect(t.world.get(a)!.data).toMatchObject({ cd1: 950, cdFull1: 1000 });
      hit();
      expect(ca.used.count).toBe(1);
      t.step(20);
      expect(t.world.get(a)!.data["cd1"]).toBeUndefined();
      t.press(a, 1, east);
      t.step();
      expect(ca.casting!.readyTick - ca.casting!.startTick).toBe(8);
    });

    it("does not hold the other normal", () => {
      const t = combatSetup(1, "real");
      const a = t.spawn("cyndaquil", [tackle.id, ember.id], { x: 0, y: 0 }, 1, 50);
      t.spawn("sentret", [], { x: 20, y: 0 }, "wild", 50);
      miss(t);
      t.press(a, 1, east);
      t.step();
      finish(t, a);
      t.step();
      t.press(a, 2, east);
      t.step();
      expect(t.combat.get(a)!.casting?.slot).toBe(1);
    });

    it("waits from the end of a shot that reached nobody", () => {
      const t = combatSetup(1, "real");
      const a = t.spawn("cyndaquil", [ember.id], { x: 0, y: 0 }, 1, 50);
      const c = t.combat.get(a)!;
      t.press(a, 1, east);
      t.step();
      finish(t, a);
      expect(c.readyAt[0]).toBe(0);
      for (let i = 0; i < 100 && c.readyAt[0] === 0; i++) t.step();
      expect(c.readyAt[0]! - t.tick).toBe(20);
    });

    it("leaves the 2nd and 3rd with no cooldown", () => {
      const { t, ca, hit } = chain();
      hit();
      miss(t);
      hit();
      hit();
      expect(ca.used.count).toBe(3);
      expect(ca.readyAt[0]).toBe(0);
    });
  });
});
