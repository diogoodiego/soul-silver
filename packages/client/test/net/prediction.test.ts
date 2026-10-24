import { MOVE_SPEED_PX, type Entity } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { createPredictor, SNAP_PX } from "../../src/net/prediction";

const me = (x: number, y = 24): Entity => ({ id: 1, kind: "player", area: "a", x, y, facing: "east", data: {} });
const input = (seq: number) => ({ seq, dir: "east" as const, buttons: 0 });

function started() {
  const p = createPredictor(() => undefined);
  p.reconcile(me(24), -1, 0);
  return p;
}

describe("createPredictor", () => {
  it("shows the input on the same frame, before the server answers", () => {
    const p = started();
    p.apply(input(0));
    expect(p.view(0)?.x).toBe(24 + MOVE_SPEED_PX);
  });

  it("replays unconfirmed inputs on the server state with no visible correction when they agree", () => {
    const p = started();
    p.apply(input(0));
    p.apply(input(1));
    p.apply(input(2));
    p.reconcile(me(24 + MOVE_SPEED_PX), 0, 50);
    expect(p.view(50)?.x).toBe(24 + 3 * MOVE_SPEED_PX);
    expect(p.pendingCount()).toBe(2);
  });

  it("corrects a small disagreement smoothly over about 100 ms", () => {
    const p = started();
    p.apply(input(0));
    p.apply(input(1));
    // The server blocked the first step.
    p.reconcile(me(24), 0, 0);
    const corrected = 24 + MOVE_SPEED_PX;
    const shown = 24 + 2 * MOVE_SPEED_PX;
    expect(p.view(0)?.x).toBe(shown);
    const mid = p.view(50)!.x;
    expect(mid).toBeLessThan(shown);
    expect(mid).toBeGreaterThan(corrected);
    expect(p.view(100)?.x).toBe(corrected);
  });

  it("snaps when the disagreement is larger than the limit", () => {
    const p = started();
    p.apply(input(0));
    p.reconcile(me(24 + SNAP_PX + 10), 0, 0);
    expect(p.view(0)?.x).toBe(24 + SNAP_PX + 10);
  });

  it("has nothing to show before the first server state", () => {
    expect(createPredictor(() => undefined).view(0)).toBeUndefined();
  });
});
