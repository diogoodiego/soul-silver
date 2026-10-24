import { MOVE_SPEED_PX, type Entity, type PlayerInput } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { createPredictor, SNAP_PX, TICK_MS } from "../../src/net/prediction";

const me = (x: number, y = 24): Entity => ({ id: 1, kind: "player", area: "a", x, y, level: 0, facing: "east", data: {} });
const input = (seq: number): PlayerInput => ({ seq, move: { x: 1, y: 0 }, run: false, buttons: 0 });

function started() {
  const p = createPredictor(() => undefined);
  p.reconcile(me(24), -1, 0);
  return p;
}

describe("createPredictor", () => {
  it("starts showing the input on the next frame, before the server answers", () => {
    const p = started();
    p.apply(input(0), 0);
    expect(p.view(16)!.x).toBeGreaterThan(24);
    expect(p.view(TICK_MS)?.x).toBe(24 + MOVE_SPEED_PX);
  });

  it("moves smoothly between ticks", () => {
    const p = started();
    p.apply(input(0), 0);
    expect(p.view(TICK_MS / 2)?.x).toBeCloseTo(24 + MOVE_SPEED_PX / 2, 5);
  });

  it("replays unconfirmed inputs on the server state with no visible correction when they agree", () => {
    const p = started();
    p.apply(input(0), 0);
    p.apply(input(1), 0);
    p.apply(input(2), 0);
    p.reconcile(me(24 + MOVE_SPEED_PX), 0, 50);
    expect(p.view(50)?.x).toBe(24 + 3 * MOVE_SPEED_PX);
    expect(p.pendingCount()).toBe(2);
  });

  it("corrects a small disagreement smoothly over about 100 ms", () => {
    const p = started();
    p.apply(input(0), 0);
    p.apply(input(1), 0);
    // The server blocked the first step.
    p.reconcile(me(24), 0, 50);
    const corrected = 24 + MOVE_SPEED_PX;
    const shown = 24 + 2 * MOVE_SPEED_PX;
    expect(p.view(50)?.x).toBe(shown);
    const mid = p.view(100)!.x;
    expect(mid).toBeLessThan(shown);
    expect(mid).toBeGreaterThan(corrected);
    expect(p.view(150)?.x).toBe(corrected);
  });

  it("snaps when the disagreement is larger than the limit", () => {
    const p = started();
    p.apply(input(0), 0);
    p.reconcile(me(24 + SNAP_PX + 10), 0, 0);
    expect(p.view(0)?.x).toBe(24 + SNAP_PX + 10);
  });

  it("has nothing to show before the first server state", () => {
    expect(createPredictor(() => undefined).view(0)).toBeUndefined();
  });
});
