import { describe, expect, it } from "vitest";
import { env, EMBER, foe, px, TACKLE } from "./fixtures.ts";
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

  it("steps aside from a cast it sees coming", () => {
    const s = simulate({
      profileId: "veteran",
      self: { x: px(10), y: px(10) },
      opponents: (tick) => [foe({ x: px(13), y: px(10), casting: tick > 30 ? { dir: { x: -1, y: 0 }, reachPx: 80, elapsedTicks: tick - 30 } : undefined })],
    });
    s.c.profile = { ...s.c.profile, dodgeChance: 1 };
    s.run(60);
    expect(s.states).toContain("reposition");
  });
});
