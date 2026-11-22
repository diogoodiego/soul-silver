import { describe, expect, it } from "vitest";
import { AI_BUTTONS } from "../../src/ai/controller.ts";
import { BUTTON } from "../../src/game/protocol.ts";
import { env, EMBER, foe, move, px, TACKLE } from "./fixtures.ts";
import { simulate } from "./sim.ts";

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe("state machine (US1)", () => {
  it("an aggressive one sees, shows the alert, closes in and fights", () => {
    const player = foe({ x: px(15), y: px(10) });
    const s = simulate({ self: { x: px(10), y: px(10) }, opponents: () => [player] }).run(20 * 4);
    expect(s.states.slice(0, 4)).toEqual(["idle", "alert", "approach", "combat"]);
    expect(s.alerts.some((a) => a)).toBe(true);
    expect(dist(s.me, player)).toBeLessThan(px(3));
    expect(s.inputs.some((i) => i.buttons !== 0)).toBe(true);
  });

  it("presses only slots it knows and that are ready", () => {
    const player = foe({ x: px(13), y: px(10) });
    const s = simulate({ self: { x: px(10), y: px(10), moves: [TACKLE, { ...EMBER, ready: false }] }, opponents: () => [player] }).run(20 * 6);
    const pressed = s.inputs.reduce((all, i) => all | i.buttons, 0);
    expect(pressed).toBe(1);
  });

  it("never presses a move while it is on cooldown", () => {
    const player = foe({ x: px(12), y: px(10) });
    const s = simulate({ self: { x: px(10), y: px(10), moves: [{ ...TACKLE, ready: false }] }, opponents: () => [player] }).run(20 * 6);
    expect(s.inputs.every((i) => i.buttons === 0)).toBe(true);
  });

  it("idles inside its zone and never steps on water", () => {
    const water = Array.from({ length: 10 }, (_, i) => `${7 + i},12`);
    const s = simulate({ self: { x: px(10), y: px(10) }, env: env(3, [], water) });
    let worst = 0;
    for (let i = 0; i < 400; i++) {
      s.run(1);
      worst = Math.max(worst, dist(s.me, { x: px(10), y: px(10) }));
      expect(Math.floor(s.me.y / 16)).not.toBe(12);
    }
    expect(s.states).toEqual(["idle"]);
    expect(worst).toBeLessThanOrEqual(px(4));
  });

  it("at its wander zone's edge it heads home instead of stepping back and forth every tick", () => {
    const s = simulate({ self: { x: px(10), y: px(10) }, env: env(7) }).run(20 * 30);
    // A new walk may turn it once per pause (idlePauseS 2: 15 in 30 s); the jitter turned it every tick.
    let reversals = 0;
    for (let i = 1; i < s.inputs.length; i++) {
      const [a, b] = [s.inputs[i - 1]!.move, s.inputs[i]!.move];
      if (a.x * b.x + a.y * b.y < 0) reversals++;
    }
    expect(reversals).toBeLessThanOrEqual(15);
  });

  it("boxed in, it stands and looks around once per pause instead of turning every tick", () => {
    const ring = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].filter((dy) => dx || dy).map((dy) => `${10 + dx},${10 + dy}`));
    // Home out of its wander zone, so the way back is blocked too (the case seen in game).
    const s = simulate({ self: { x: px(10), y: px(10) }, home: { x: px(16), y: px(10) }, env: env(3, [], ring) });
    let turns = 0;
    let look = s.c.senses.look;
    for (let i = 0; i < 20 * 4; i++) {
      s.run(1);
      if (s.c.senses.look !== look) turns++;
      look = s.c.senses.look;
    }
    // idlePauseS is 2: four seconds hold about two new looks, never one per tick.
    expect(turns).toBeLessThanOrEqual(3);
  });

  it("does not notice a player behind a wall", () => {
    const s = simulate({ self: { x: px(10), y: px(10) }, env: env(1, ["12,10"]), opponents: () => [foe({ x: px(14), y: px(10) })] }).run(60);
    expect(s.states).toEqual(["idle"]);
  });

  it("goes to where it last saw the player, searches, then gives up", () => {
    // Seen once, then the player is behind walls for good.
    const walls = ["13,8", "13,9", "13,10", "13,11", "13,12"];
    const s = simulate({
      self: { x: px(10), y: px(10) },
      env: env(1, walls),
      opponents: (tick) => [foe({ x: tick < 10 ? px(12) : px(16), y: px(10) })],
    }).run(20 * 10);
    expect(s.states).toContain("approach");
    expect(s.states[s.states.length - 1]).toMatch(/return|idle/);
  });
});

describe("temperaments (US4)", () => {
  const near = foe({ x: px(13), y: px(10) });

  it("passive: ignores a player in sight", () => {
    const s = simulate({ temperament: "passive", self: { x: px(10), y: px(10) }, opponents: () => [near] }).run(60);
    expect(s.states).toEqual(["idle"]);
  });

  it("passive: when hurt, fights back or flees by its weight", () => {
    const outcome = (fightWeight: number) =>
      simulate({
        temperament: "passive",
        rules: { fightWeight },
        self: { x: px(10), y: px(10) },
        opponents: () => [near],
        extra: (tick) => (tick === 5 ? { hurtBy: [{ id: 2, amount: 1 }] } : {}),
      }).run(40).states;
    expect(outcome(1)).toContain("approach");
    expect(outcome(0)).toContain("flee");
  });

  it("skittish: shows the alert and runs off", () => {
    const s = simulate({ temperament: "skittish", self: { x: px(10), y: px(10) }, leashTiles: 40, opponents: () => [near] }).run(20 * 3);
    expect(s.states.slice(0, 3)).toEqual(["idle", "alert", "flee"]);
    expect(dist(s.me, near)).toBeGreaterThan(px(6));
  });

  it("skittish: fights when cornered", () => {
    // Walls on three sides, the player on the fourth.
    const walls = ["9,9", "10,9", "11,9", "9,10", "9,11", "10,11", "11,11"];
    const s = simulate({ temperament: "skittish", self: { x: px(10), y: px(10) }, env: env(1, walls), opponents: () => [foe({ x: px(12), y: px(10) })] }).run(60);
    expect(s.states).toContain("combat");
  });

  it("territorial: attacks inside its zone and stops when the player leaves it", () => {
    let inside = true;
    const s = simulate({
      temperament: "territorial",
      self: { x: px(10), y: px(10) },
      opponents: () => [foe({ x: inside ? px(12) : px(16), y: px(10) })],
    }).run(40);
    expect(s.states).toContain("approach");
    inside = false;
    s.run(40);
    expect(s.states[s.states.length - 1]).toMatch(/return|idle/);
  });

  it("territorial: tolerates a player far from its zone", () => {
    const s = simulate({ temperament: "territorial", self: { x: px(10), y: px(10) }, opponents: () => [foe({ x: px(15), y: px(10) })] }).run(60);
    expect(s.states).toEqual(["idle"]);
  });

  it("flees under its HP threshold (SC-003)", () => {
    const s = simulate({ temperament: "passive", rules: { fightWeight: 1 }, self: { x: px(10), y: px(10), hp: 30 }, leashTiles: 40, opponents: () => [near], extra: (t) => (t === 2 ? { hurtBy: [{ id: 2, amount: 1 }] } : {}) }).run(30);
    expect(s.states).toContain("approach");
    s.me = { ...s.me, hp: 2 };
    s.run(10);
    expect(s.states[s.states.length - 1]).toBe("flee");
  });

  it("an aggressive one never flees on low HP", () => {
    const s = simulate({ self: { x: px(10), y: px(10), hp: 1 }, opponents: () => [near] }).run(60);
    expect(s.states).not.toContain("flee");
  });
});

describe("states (US4)", () => {
  it("pulled past the leash, it walks home and ignores provocation for a while (SC-004)", () => {
    const s = simulate({ self: { x: px(25), y: px(10) }, home: { x: px(10), y: px(10) }, opponents: () => [foe({ x: px(27), y: px(10) })] }).run(1);
    expect(s.c.state).toBe("return");
    s.run(20 * 8);
    expect(s.states).toEqual(["return", "idle"]);
    expect(dist(s.me, { x: px(10), y: px(10) })).toBeLessThanOrEqual(px(3));
  });

  it("enraged after a ball escape, any temperament attacks until the time runs out", async () => {
    const { enrage } = await import("../../src/ai/controller.ts");
    const s = simulate({ temperament: "passive", self: { x: px(10), y: px(10) }, opponents: () => [foe({ x: px(13), y: px(10) })] });
    enrage(s.c, 40);
    s.run(30);
    expect(s.states).toContain("approach");
  });

  it("asleep or stunned, it decides nothing until it recovers", () => {
    const s = simulate({ self: { x: px(10), y: px(10), immobile: true }, opponents: () => [foe({ x: px(12), y: px(10) })] }).run(40);
    expect(s.states).toEqual(["incapacitated"]);
    expect(s.inputs.every((i) => i.buttons === 0 && i.move.x === 0 && i.move.y === 0)).toBe(true);
    s.me = { ...s.me, immobile: false };
    s.run(40);
    expect(s.states.length).toBeGreaterThan(1);
  });

});

describe("block C: reactions and strategies (C.7)", () => {
  const DASH = BUTTON.dash;
  const GUARD = BUTTON.guard;
  const HYPER = move({ id: 63, slot: 2, special: true, behavior: "beam", category: "special", power: 150, hitbox: { shape: "capsule", lengthPx: 128, widthPx: 12 } });
  /** A foe 3 tiles east that casts every 20 ticks for 10 ticks, aimed at the AI. */
  const caster = (special: boolean) => (tick: number, me: { x: number; y: number }) => {
    const at = { x: px(13), y: px(10) };
    const d = Math.hypot(me.x - at.x, me.y - at.y) || 1;
    const casting = tick > 40 && tick % 20 < 10 ? { dir: { x: (me.x - at.x) / d, y: (me.y - at.y) / d }, reachPx: 500, elapsedTicks: tick % 20, leftTicks: 10 - (tick % 20), special } : undefined;
    return [foe({ ...at, casting })];
  };
  const presses = (inputs: { buttons: number }[], bit: number) => inputs.filter((i, k) => i.buttons & bit && !((inputs[k - 1]?.buttons ?? 0) & bit)).length;

  it("presses the same dash and guard bits as the players", () => {
    expect(AI_BUTTONS).toEqual({ dash: BUTTON.dash, guard: BUTTON.guard });
  });

  it("dodges a move just before it lands", () => {
    const s = simulate({ self: { x: px(10), y: px(10) }, opponents: caster(true) });
    s.c.tuning = { ...s.c.tuning, action: { ...s.c.tuning.action, wildReactChance: 1 } };
    s.run(60);
    const first = s.inputs.findIndex((i) => i.buttons & DASH);
    // The cast from tick 41 lands at 50; the dodge goes off reactLeadS (3 ticks) before.
    expect(first).toBe(47);
  });

  it("parries at any moment of the cast, never after it left", () => {
    const at = new Set<number>();
    for (let seed = 1; seed <= 5; seed++) {
      const s = simulate({ env: env(seed), self: { x: px(10), y: px(10) }, opponents: caster(false) });
      s.c.tuning = { ...s.c.tuning, action: { ...s.c.tuning.action, wildReactChance: 1 } };
      s.run(600).inputs.forEach((i, k, all) => {
        if (i.buttons & GUARD && !((all[k - 1]?.buttons ?? 0) & GUARD)) at.add(k % 20);
      });
    }
    // Casts run from tick 0 of every 20 and leave on tick 10.
    expect([...at].filter((k) => k >= 10)).toEqual([]);
    expect(at.size).toBeGreaterThan(4);
  });

  it("backing off, it raises its guard only as the move leaves: it guards, it does not parry", () => {
    // As caster, but with the tick the move leaves on (no time left) visible, as on the server.
    const leaving = (tick: number, me: { x: number; y: number }) => {
      const at = { x: px(13), y: px(10) };
      const d = Math.hypot(me.x - at.x, me.y - at.y) || 1;
      const k = tick % 20;
      return [foe({ ...at, casting: tick > 40 && k <= 10 ? { dir: { x: (me.x - at.x) / d, y: (me.y - at.y) / d }, reachPx: 500, elapsedTicks: k, leftTicks: 10 - k, special: false } : undefined })];
    };
    const s = simulate({ strategy: "trainer", self: { x: px(10), y: px(10) }, opponents: leaving });
    s.c.tuning = { ...s.c.tuning, states: { ...s.c.tuning.states, repositionS: 100 } };
    s.c.profile = { ...s.c.profile, reactChance: 0 };
    while (s.c.state !== "combat" && s.inputs.length < 100) s.run(1);
    s.c.state = "reposition";
    const from = s.inputs.length;
    s.run(60);
    const guards = s.inputs.flatMap((i, k) => (k >= from && i.buttons & GUARD ? [k % 20] : []));
    expect(guards.length).toBeGreaterThan(0);
    expect(guards.filter((k) => k !== 10)).toEqual([]);
  });

  it("only dodges a special (red), and dodges or parries a normal", () => {
    const run = (special: boolean, seed: number) => {
      const s = simulate({ env: env(seed), self: { x: px(10), y: px(10) }, opponents: caster(special) });
      s.c.tuning = { ...s.c.tuning, action: { ...s.c.tuning.action, wildReactChance: 1 } };
      return s.run(400).inputs;
    };
    const red = Array.from({ length: 5 }, (_, i) => run(true, i + 1));
    expect(red.every((inputs) => presses(inputs, GUARD) === 0 && presses(inputs, DASH) > 0)).toBe(true);
    const white = Array.from({ length: 5 }, (_, i) => run(false, i + 1));
    expect(white.reduce((n, inputs) => n + presses(inputs, GUARD), 0)).toBeGreaterThan(0);
    expect(white.reduce((n, inputs) => n + presses(inputs, DASH), 0)).toBeGreaterThan(0);
  });

  it("reacts by its chance: 20% for wild Pokémon, by the profile for trainers' (veteran 60%)", () => {
    // Over many seeds: one seed's rate swings by 0.05. The trainer's 0.6 measures about 0.5 here.
    const rate = (strategy: "wild" | "trainer") => {
      const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
      const runs = seeds.map((seed) => simulate({ strategy, env: env(seed), self: { x: px(10), y: px(10) }, opponents: caster(true) }).run(40 + 20 * 100));
      return runs.reduce((n, s) => n + presses(s.inputs, DASH), 0) / (100 * seeds.length);
    };
    const wild = rate("wild");
    const trainer = rate("trainer");
    expect(wild).toBeGreaterThan(0.12);
    expect(wild).toBeLessThan(0.28);
    expect(trainer).toBeGreaterThan(0.45);
    expect(trainer).toBeLessThan(0.7);
  });

  it("a trainer's Pokémon chains 3 normals, then backs off for 1 s, guarding when hurt", () => {
    let hurting = false;
    const s = simulate({ strategy: "trainer", self: { x: px(10), y: px(10) }, opponents: () => [foe({ x: px(12), y: px(10) })], extra: () => (hurting ? { hurtBy: [{ id: 2, amount: 1 }] } : {}) });
    while (s.c.state !== "reposition" && s.inputs.length < 400) s.run(1);
    expect(s.inputs.filter((i) => i.buttons & 0b1111).length).toBe(3);
    const since = s.inputs.length;
    s.run(5);
    expect(s.inputs.slice(since).every((i) => (i.buttons & 0b1111) === 0 && (i.move.x !== 0 || i.move.y !== 0))).toBe(true);
    hurting = true;
    s.run(3);
    expect(s.inputs.at(-1)).toMatchObject({ buttons: GUARD, move: { x: 0, y: 0 } });
    hurting = false;
    while (s.c.state === "reposition" && s.inputs.length < since + 100) s.run(1);
    // Backed off for repositionS (1 s, 20 ticks), then back to the fight.
    expect(s.inputs.length - since).toBe(20);
    expect(s.c.state).toBe("combat");
  });

  it("a trainer's Pokémon uses a ready special first", () => {
    const s = simulate({ strategy: "trainer", self: { x: px(10), y: px(10), moves: [TACKLE, HYPER] }, opponents: () => [foe({ x: px(12), y: px(10) })] }).run(80);
    const first = s.inputs.find((i) => i.buttons & 0b1111)!;
    expect(first.buttons).toBe(1 << 2);
  });

  it("a wild one uses a ready special only now and then, chaining normals otherwise", () => {
    const s = simulate({ self: { x: px(10), y: px(10), moves: [TACKLE, HYPER] }, opponents: () => [foe({ x: px(12), y: px(10) })] }).run(20 * 60);
    const special = presses(s.inputs, 1 << 2);
    const normal = presses(s.inputs, 1);
    expect(special).toBeGreaterThan(0);
    expect(special / (special + normal)).toBeLessThan(0.5);
  });

  it("never feints: no guard or dodge while it casts", () => {
    const s = simulate({ self: { x: px(10), y: px(10), casting: true }, opponents: caster(false) });
    s.c.tuning = { ...s.c.tuning, action: { ...s.c.tuning.action, wildReactChance: 1 } };
    s.run(200);
    expect(s.inputs.every((i) => (i.buttons & (DASH | GUARD)) === 0)).toBe(true);
  });
});
