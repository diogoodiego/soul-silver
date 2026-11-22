import { castKit, packKit } from "@soulsilver/shared/combat";
import { BUTTON, type Entity, type PlayerInput } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { COMBAT_SPEED_PX, createCombatPredictor, TICK_MS } from "../../src/net/prediction";

const mon = (x: number, y = 24): Entity => ({ id: 2, kind: "pokemon", area: "a", x, y, level: 5, facing: "east", data: {} });
const push = (seq: number, x = 1, y = 0, buttons = 0): PlayerInput => ({ seq, move: { x, y }, run: false, buttons });

function started() {
  const p = createCombatPredictor();
  p.reconcile(mon(24), -1, 0);
  return p;
}

describe("createCombatPredictor", () => {
  it("moves the Pokémon at once, before the server answers", () => {
    const p = started();
    p.apply(push(0), 0);
    expect(p.view(TICK_MS / 2)!.x).toBeGreaterThan(24);
    expect(p.view(TICK_MS)!.x).toBe(24 + COMBAT_SPEED_PX);
  });

  it("learns its speed from how far the server moved it for one input", () => {
    const p = started();
    p.apply(push(0), 0);
    p.reconcile(mon(29), 0, TICK_MS);
    p.apply(push(1), TICK_MS);
    expect(p.view(TICK_MS * 10)!.x).toBe(34);
  });

  it("does not learn from a dash or a wall", () => {
    for (const x of [24 + 8, 24 + 0.5]) {
      const p = started();
      p.apply(push(0), 0);
      p.reconcile(mon(x), 0, TICK_MS);
      p.apply(push(1), TICK_MS);
      expect(p.view(TICK_MS * 10)!.x).toBe(x + COMBAT_SPEED_PX);
    }
  });

  it("goes slower with the stick half tilted, as the server", () => {
    const p = started();
    p.apply(push(0, 0.5, 0), 0);
    expect(p.view(TICK_MS)!.x).toBe(24 + COMBAT_SPEED_PX / 2);
  });

  it("stands still in a contact move's leap, and does not take it for its speed", () => {
    const p = started();
    p.reconcile({ ...mon(24), data: { used: 0, leap: 0.5 } }, -1, 0);
    p.apply(push(0), 0);
    expect(p.view(TICK_MS)!.x).toBe(24);
    // Its last 5 px: as short as a step.
    p.reconcile({ ...mon(29), data: { used: 1 } }, 0, TICK_MS);
    p.apply(push(1), TICK_MS);
    expect(p.view(TICK_MS * 10)!.x).toBe(29 + COMBAT_SPEED_PX);
  });

  it("does not take a leap of one tick for its speed", () => {
    const p = started();
    p.reconcile({ ...mon(24), data: { used: 0 } }, -1, 0);
    p.apply(push(0), 0);
    p.reconcile({ ...mon(29), data: { used: 1 } }, 0, TICK_MS);
    p.apply(push(1), TICK_MS);
    expect(p.view(TICK_MS * 10)!.x).toBe(29 + COMBAT_SPEED_PX);
  });

  it("faces the way it is pushed", () => {
    const p = started();
    p.apply(push(0, 0, -1), 0);
    expect(p.view(TICK_MS)!.facing).toBe("north");
  });

  describe("presses (block C)", () => {
    const kit = packKit(castKit({ behavior: "melee", rangePx: 0, hitbox: { shape: "arc", radiusPx: 28, angleDeg: 100 }, type: 3 }, 400));
    const ready = { hp: 20, used: 0, casting: 0, cdDodge: 0, cdGuard: 0, status: "", kit1: kit, kit3: kit, cd3: 0 };
    const foe = { x: 84, y: 24 };
    function fight(data: Entity["data"] = {}, solid = (x: number) => x === Infinity) {
      const p = createCombatPredictor({ solid: (_e, x) => solid(x), foe: () => foe });
      const server = (x: number, more: Entity["data"] = {}) => ({ ...mon(x), data: { ...ready, ...data, ...more } });
      p.reconcile(server(24), -1, 0);
      let id = 0;
      const press = (buttons: number, move = { x: 0, y: 0 }, now = 0) => p.press({ id: id++, buttons, move }, now);
      const data_ = (now = 0) => p.view(now)!.data;
      return { p, server, press, data: data_ };
    }

    it("shows the parry's pose and a move's charge in the very frame of the press", () => {
      const a = fight();
      a.press(BUTTON.guard);
      expect(a.data()).toMatchObject({ parry: true });
      const b = fight();
      b.press(1);
      expect(b.data()).toMatchObject({ casting: 1, castShape: "arc", castMs: 400, castOx: 44, castOy: 0, castDx: 100 });
      expect(b.p.view(0)!.facing).toBe("east");
    });

    it("dodges at once: 32 px in four ticks, the way it is pushed or faces", () => {
      for (const [move, x, y] of [[{ x: 0, y: 1 }, 24, 24 + 32], [{ x: 0, y: 0 }, 24 + 32, 24]] as const) {
        const { p, press, data } = fight();
        press(BUTTON.dash, move);
        expect(data()).toMatchObject({ dodge: true });
        for (let i = 0; i < 3; i++) p.apply(push(i, 0, 0), i * TICK_MS);
        expect(p.view(10 * TICK_MS)).toMatchObject({ x, y });
      }
    });

    it("stands still in the pose, and stops at a wall", () => {
      const a = fight();
      a.press(BUTTON.guard);
      a.p.apply(push(0), 0);
      expect(a.p.view(TICK_MS)!.x).toBe(24);
      const b = fight({}, (x) => x > 40);
      b.press(BUTTON.dash);
      for (let i = 0; i < 3; i++) b.p.apply(push(i, 0, 0), i * TICK_MS);
      expect(b.p.view(10 * TICK_MS)!.x).toBe(40);
    });

    it.each([
      ["a special on cooldown", 1 << 2, { cd3: 900 }],
      ["an empty slot", 1 << 1, {}],
      ["a move while another charges", 1, { casting: 1, castShape: "arc" }],
      ["a dodge on cooldown", BUTTON.dash, { cdDodge: 600 }],
      ["a dodge while it charges", BUTTON.dash, { casting: 1 }],
      ["a parry on cooldown", BUTTON.guard, { cdGuard: 600 }],
      ["anything while stunned", 1, { stun: true }],
      ["anything asleep", 1, { status: "sleep" }],
      ["anything knocked out", BUTTON.dash, { hp: 0 }],
    ])("shows nothing the server would refuse: %s", (_name, buttons, data) => {
      const f = fight(data);
      const before = f.p.view(0);
      f.press(buttons);
      expect(f.p.view(0)).toEqual(before);
    });

    it("a guard press drops its charge (a feint), but not in the leap", () => {
      const a = fight({ casting: 1, castShape: "arc", castMs: 400 });
      a.press(BUTTON.guard);
      expect(a.data()["castShape"]).toBeUndefined();
      expect(a.data()["casting"]).toBe(0);
      const b = fight({ casting: 1, leap: 0.3, leapLeft: 2, leapDx: 14, leapDy: 0 });
      b.press(BUTTON.guard);
      expect(b.data()).toMatchObject({ casting: 1, leap: 0.3 });
      expect(b.data()["parry"]).toBeUndefined();
    });

    it("gives way to the server's word once it took the press", () => {
      const { p, server, press, data } = fight();
      press(BUTTON.guard);
      p.reconcile(server(24), 0, TICK_MS, -1);
      expect(data(TICK_MS)).toMatchObject({ parry: true });
      p.reconcile(server(24, { cdGuard: 300 }), 1, 2 * TICK_MS, 0);
      expect(data(2 * TICK_MS)["parry"]).toBeUndefined();
    });

    it("goes on with a dodge the server began", () => {
      const { p, server, press } = fight();
      press(BUTTON.dash);
      p.apply(push(0, 0, 0), 0);
      p.apply(push(1, 0, 0), TICK_MS);
      // Two of the four steps done on the server, with one input still on its way.
      p.reconcile(server(24 + 16, { evade: 2, evDx: 100, evDy: 0, dodge: true }), 0, TICK_MS, 0);
      expect(p.view(10 * TICK_MS)!.x).toBe(24 + 24);
    });

    it("leaps when the charge runs out, without waiting for the server", () => {
      const { p, server, data } = fight();
      p.reconcile(server(24, { casting: 1, castShape: "arc", castOx: 44, castOy: 0, lungeIn: 2 }), -1, 0);
      p.apply(push(0, 0, 0), 0);
      expect(p.view(TICK_MS)!.x).toBe(24);
      p.apply(push(1, 0, 0), TICK_MS);
      expect(p.view(2 * TICK_MS)!.x).toBeCloseTo(24 + 44 / 3);
      expect(data(2 * TICK_MS)["leap"]).toBeCloseTo(1 / 3, 1);
      expect(data(2 * TICK_MS)["castShape"]).toBeUndefined();
      for (let i = 2; i < 6; i++) p.apply(push(i, 0, 0), i * TICK_MS);
      expect(p.view(20 * TICK_MS)!.x).toBeCloseTo(24 + 44);
      expect(data(20 * TICK_MS)["leap"]).toBeUndefined();
    });
  });

  it("replays unconfirmed inputs on the server's position", () => {
    const p = started();
    p.apply(push(0), 0);
    p.apply(push(1), TICK_MS);
    p.reconcile(mon(24 + COMBAT_SPEED_PX), 0, TICK_MS * 1.5);
    expect(p.view(TICK_MS * 10)!.x).toBe(24 + 2 * COMBAT_SPEED_PX);
  });
});
