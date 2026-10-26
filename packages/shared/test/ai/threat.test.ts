import { describe, expect, it } from "vitest";
import { addDamage, chooseTarget, decayThreat, forget, newThreat } from "../../src/ai/threat.ts";
import { TUNING } from "./fixtures.ts";

const SIGHT = 100;

describe("threat table (US5)", () => {
  it("damage, proximity and the first attacker all count", () => {
    const t = newThreat();
    // Same distance: the one that hit first and hardest wins.
    addDamage(t, 3, 10, TUNING);
    expect(chooseTarget(t, [{ id: 2, distPx: 50 }, { id: 3, distPx: 50 }], SIGHT, 0, TUNING)).toBe(3);
    const near = newThreat();
    expect(chooseTarget(near, [{ id: 2, distPx: 90 }, { id: 3, distPx: 10 }], SIGHT, 0, TUNING)).toBe(3);
  });

  it("decays over time", () => {
    const t = newThreat();
    addDamage(t, 2, 10, TUNING);
    const before = t.values.get(2)!;
    decayThreat(t, 1, TUNING);
    expect(t.values.get(2)!).toBeCloseTo(before * (1 - TUNING.threat.decayPerS));
  });

  it("keeps the target while the others stay within the margin, switches past it", () => {
    const t = newThreat();
    let switches = 0;
    let last = chooseTarget(t, [{ id: 2, distPx: 40 }, { id: 3, distPx: 41 }], SIGHT, 0.5, TUNING);
    // 600 ticks of two players trading places by a few pixels.
    for (let i = 0; i < 600; i++) {
      const wobble = i % 2 === 0 ? 3 : -3;
      const now = chooseTarget(t, [{ id: 2, distPx: 40 + wobble }, { id: 3, distPx: 40 - wobble }], SIGHT, 0.5, TUNING);
      if (now !== last) switches++;
      last = now;
    }
    expect(switches).toBe(0);
    addDamage(t, 3, 40, TUNING);
    expect(chooseTarget(t, [{ id: 2, distPx: 40 }, { id: 3, distPx: 40 }], SIGHT, 0.5, TUNING)).toBe(3);
  });

  it("breaks ties by the lowest id", () => {
    expect(chooseTarget(newThreat(), [{ id: 5, distPx: 40 }, { id: 4, distPx: 40 }], SIGHT, 0, TUNING)).toBe(4);
  });

  it("forgets an opponent that left", () => {
    const t = newThreat();
    addDamage(t, 2, 10, TUNING);
    chooseTarget(t, [{ id: 2, distPx: 40 }], SIGHT, 0, TUNING);
    forget(t, 2);
    expect(t.values.has(2)).toBe(false);
    expect(t.current).toBeUndefined();
    expect(t.first).toBeUndefined();
  });
});
