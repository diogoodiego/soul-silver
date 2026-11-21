import type { Entity, PlayerInput } from "@soulsilver/shared/game";
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

  it("faces the way it is pushed", () => {
    const p = started();
    p.apply(push(0, 0, -1), 0);
    expect(p.view(TICK_MS)!.facing).toBe("north");
  });

  it("replays unconfirmed inputs on the server's position", () => {
    const p = started();
    p.apply(push(0), 0);
    p.apply(push(1), TICK_MS);
    p.reconcile(mon(24 + COMBAT_SPEED_PX), 0, TICK_MS * 1.5);
    expect(p.view(TICK_MS * 10)!.x).toBe(24 + 2 * COMBAT_SPEED_PX);
  });
});
