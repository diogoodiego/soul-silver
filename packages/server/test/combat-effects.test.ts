import { describe, expect, it } from "vitest";
import { combatSetup, MOVES } from "./combat-fixture";

const east = { x: 1, y: 0 };

function setup(moves: number[], targetMoves: number[] = [], seed = 1) {
  const t = combatSetup(seed);
  const a = t.spawn("cyndaquil", moves, { x: 0, y: 0 }, 1, 20);
  const b = t.spawn("sentret", targetMoves, { x: 20, y: 0 }, "wild", 20);
  return { t, a, b };
}

describe("statuses", () => {
  it("burn: tick damage every interval, then it ends", () => {
    const { t, b } = setup([MOVES.willOWisp.id]);
    t.press(1, 1, east);
    t.step(10);
    expect(t.combat.get(b)!.statuses.has("burn")).toBe(true);
    expect(t.world.get(b)!.data.status).toBe("burn");
    t.step(170);
    const ticks = t.events.filter((e) => e.kind === "tick" && e.target === b);
    expect(ticks.length).toBe(4);
    expect(ticks[0]!.amount).toBe(Math.floor(t.combat.get(b)!.stats.hp / 16));
    expect(t.combat.get(b)!.statuses.size).toBe(0);
  });

  it("burn halves physical damage", () => {
    const damage = (burned: boolean) => {
      const t = combatSetup(9);
      const a = t.spawn("sentret", [MOVES.tackle.id], { x: 0, y: 0 }, 1, 50);
      t.spawn("chikorita", [], { x: 20, y: 0 }, "wild", 50);
      if (burned) t.combat.inflict(a, "burn", 0);
      t.press(a, 1, east);
      t.step(5);
      return t.events.find((e) => e.kind === "hit")!.amount;
    };
    expect(damage(true)).toBeLessThan(damage(false));
  });

  it("sleep keeps the target from moving and using moves", () => {
    const { t, b } = setup([MOVES.sleepPowder.id], [MOVES.tackle.id]);
    t.press(1, 1, east);
    t.step(10);
    t.walk(b, { x: 1, y: 0 });
    t.step();
    expect(t.pos(b).x).toBeCloseTo(20 + 0);
    t.press(b, 1, { x: -1, y: 0 });
    t.step(5);
    expect(t.events.filter((e) => e.attacker === b)).toHaveLength(0);
  });

  it("statuses run side by side", () => {
    const { t, b } = setup([]);
    t.combat.inflict(b, "burn", 0);
    t.combat.inflict(b, "sleep", 0);
    t.combat.inflict(b, "confusion", 0);
    expect([...t.combat.get(b)!.statuses.keys()]).toEqual(["burn", "sleep", "confusion"]);
    t.step();
    expect(t.world.get(b)!.data.status).toBe("burn,sleep,confusion");
  });

  it("each hit fills the bar by the move's chance; full, it inflicts the status and empties", () => {
    const t = combatSetup();
    t.spawn("cyndaquil", [MOVES.ember.id], { x: 0, y: 0 }, 1, 20);
    const b = t.spawn("sentret", [], { x: 20, y: 0 }, "wild", 90);
    const ember = t.data.move(MOVES.ember.id)!;
    ember.defaultChance = 40;
    ember.accuracy = null;
    const target = t.combat.get(b)!;
    const hit = () => {
      target.hp = target.stats.hp;
      t.world.update({ ...t.world.get(b)!, x: 20, y: 0 });
      t.press(1, 1, east);
      t.step(10);
    };
    hit();
    expect(target.buildup.get("burn")).toBe(40);
    expect(t.world.get(b)!.data.bld_burn).toBe(40);
    hit();
    expect(target.statuses.has("burn")).toBe(false);
    hit();
    expect(target.statuses.has("burn")).toBe(true);
    expect(target.buildup.has("burn")).toBe(false);
    expect(t.events.filter((e) => e.kind === "status")).toHaveLength(1);
    // Immune to burn while it burns, but another status still builds up.
    ember.effects = [...ember.effects, { kind: "status", status: "poison", chance: 30 }];
    hit();
    expect(target.buildup.has("burn")).toBe(false);
    expect(target.buildup.get("poison")).toBe(30);
  });

  it("an immune type builds nothing up", () => {
    const t = combatSetup();
    t.spawn("cyndaquil", [MOVES.ember.id], { x: 0, y: 0 }, 1, 20);
    const b = t.spawn("cyndaquil", [], { x: 20, y: 0 }, "wild", 20);
    t.press(1, 1, east);
    t.step(10);
    expect(t.combat.get(b)!.buildup.size).toBe(0);
  });

  it("no status lasts over 5 s, and tick damage keeps its count", () => {
    for (const s of combatSetup().data.statuses.values()) expect(s.durationS.max).toBeLessThanOrEqual(5);
    for (const [id, count] of [["burn", 4], ["poison", 5], ["toxic", 6]] as const) {
      const { t, b } = setup([]);
      t.combat.inflict(b, id, 0);
      t.step(105);
      expect(t.events.filter((e) => e.kind === "tick" && e.target === b)).toHaveLength(count);
    }
  });

  it("type immunities hold (fire cannot burn)", () => {
    const t = combatSetup();
    const a = t.spawn("cyndaquil", [], { x: 0, y: 0 });
    t.combat.inflict(a, "burn", 0);
    expect(t.combat.get(a)!.statuses.size).toBe(0);
  });

  it("paralysis slows the target", () => {
    const { t, b } = setup([]);
    const before = t.combat.movePx(b);
    t.combat.inflict(b, "paralysis", 0);
    expect(t.combat.movePx(b)).toBeLessThan(before);
  });

  it("confusion can send a move the wrong way", () => {
    const t = combatSetup(3);
    const conf = t.data.statuses.get("confusion")!;
    Object.assign(conf, { misdirect: 100, deviationDeg: 180, durationS: { min: 100, max: 100 } });
    const a = t.spawn("cyndaquil", [MOVES.ember.id], { x: 0, y: 0 }, 1, 50);
    const b = t.spawn("sentret", [], { x: 120, y: 0 }, "wild", 90);
    t.combat.inflict(a, "confusion", 0);
    for (let i = 0; i < 20; i++) {
      t.press(a, 1, east);
      t.step(40);
    }
    const hits = t.events.filter((e) => e.target === b && e.kind === "hit").length;
    expect(hits).toBeLessThan(20);
  });

  it("a fire hit thaws a frozen target", () => {
    const { t, b } = setup([MOVES.ember.id]);
    t.combat.inflict(b, "freeze", 0);
    expect(t.combat.get(b)!.statuses.has("freeze")).toBe(true);
    t.press(1, 1, east);
    t.step(10);
    expect(t.combat.get(b)!.statuses.has("freeze")).toBe(false);
  });
});

describe("stat stages", () => {
  it("Swords Dance raises attack two stages and the next hit hurts more", () => {
    const damage = (dance: boolean) => {
      const t = combatSetup(4);
      const a = t.spawn("cyndaquil", [MOVES.swordsDance.id, MOVES.scratch.id], { x: 0, y: 0 }, 1, 30);
      t.spawn("sentret", [], { x: 20, y: 0 }, "wild", 30);
      if (dance) {
        t.press(a, 1, east);
        t.step(80);
      }
      t.press(a, 2, east);
      t.step(5);
      return t.events.find((e) => e.kind === "hit")!.amount;
    };
    expect(damage(true)).toBeGreaterThan(damage(false));
  });

  it("stop at +6, and last until reset", () => {
    const { t, a } = setup([MOVES.swordsDance.id]);
    for (let i = 0; i < 5; i++) {
      t.press(a, 1, east);
      t.step(200);
    }
    expect(t.combat.get(a)!.stages.attack).toBe(6);
    expect(t.world.get(a)!.data.stg_attack).toBe(6);
    t.combat.resetStages(a);
    expect(t.combat.get(a)!.stages.attack).toBe(0);
  });

  it("Haze clears everyone's stages", () => {
    const { t, a, b } = setup([MOVES.swordsDance.id, MOVES.haze.id]);
    t.press(a, 1, east);
    t.step(80);
    t.combat.get(b)!.stages.defense = -2;
    t.press(a, 2, east);
    t.step(20);
    expect(t.combat.get(a)!.stages.attack).toBe(0);
    expect(t.combat.get(b)!.stages.defense).toBe(0);
  });
});

describe("other effects", () => {
  it("heal restores a fraction of max HP", () => {
    const { t, a } = setup([MOVES.synthesis.id]);
    const c = t.combat.get(a)!;
    c.hp = 1;
    t.press(a, 1, east);
    t.step(10);
    expect(c.hp).toBe(1 + Math.floor(c.stats.hp / 2));
    expect(t.events.at(-1)).toMatchObject({ kind: "heal", target: a });
  });

  it("recoil hurts the user, drain heals it", () => {
    const r = setup([MOVES.takeDown.id]);
    r.t.press(r.a, 1, east);
    r.t.step(20);
    const dealt = r.t.events.find((e) => e.kind === "hit" && e.target === r.b)!.amount;
    expect(r.t.hp(r.a)).toBe(r.t.combat.get(r.a)!.stats.hp - Math.max(1, Math.floor(dealt * 0.25)));

    const d = setup([MOVES.gigaDrain.id]);
    const c = d.t.combat.get(d.a)!;
    c.hp = 1;
    d.t.press(d.a, 1, east);
    d.t.step(20);
    const drained = d.t.events.find((e) => e.kind === "hit" && e.target === d.b)!.amount;
    expect(c.hp).toBe(1 + Math.max(1, Math.floor(drained / 2)));
  });

  it("sun boosts fire moves", () => {
    const damage = (sun: boolean) => {
      const t = combatSetup(8);
      const a = t.spawn("cyndaquil", [MOVES.sunnyDay.id, MOVES.ember.id], { x: 0, y: 0 }, 1, 40);
      t.spawn("sentret", [], { x: 20, y: 0 }, "wild", 40);
      if (sun) {
        t.press(a, 1, east);
        t.step(80);
      }
      t.press(a, 2, east);
      t.step(20);
      return t.events.find((e) => e.kind === "hit")!.amount;
    };
    expect(damage(true)).toBeGreaterThan(damage(false));
  });
});
