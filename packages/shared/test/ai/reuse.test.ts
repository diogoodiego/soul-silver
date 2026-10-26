import { describe, expect, it } from "vitest";
import { createController, stepController } from "../../src/ai/controller.ts";
import { lineOfSight } from "../../src/ai/sight.ts";
import { env, foe, profile, px, self, TEMPERAMENTS, tickOf, TUNING } from "./fixtures.ts";

describe("reuse by the trainers spec (US7)", () => {
  it("a trainer profile with original flags drives the same controller, and the hooks change nothing", () => {
    const run = (hooks?: Parameters<typeof createController>[0]["hooks"]) => {
      const calls: string[] = [];
      const c = createController({
        id: 1,
        home: { x: px(10), y: px(10) },
        leashPx: 160,
        profile: profile("veteran", { source: "trainer", aiFlags: ["basic"] }),
        temperament: TEMPERAMENTS.aggressive,
        angry: TEMPERAMENTS.aggressive,
        tuning: TUNING,
        look: { x: 1, y: 0 },
        hooks: hooks && {
          chooseSwitch: (t) => (calls.push(`switch@${t.tick}`), hooks.chooseSwitch?.(t)),
          chooseItem: (t) => (calls.push(`item@${t.tick}`), hooks.chooseItem?.(t)),
        },
      });
      const e = env(9);
      const inputs = [];
      for (let tick = 0; tick < 80; tick++) inputs.push(stepController(c, tickOf(tick, self({ x: px(10), y: px(10) }), [foe({ x: px(11), y: px(10) })]), e).input);
      return { inputs, calls };
    };
    const plain = run();
    const hooked = run({ chooseSwitch: () => undefined, chooseItem: () => undefined });
    expect(hooked.calls.length).toBeGreaterThan(0);
    expect(hooked.inputs).toEqual(plain.inputs);
  });

  it("line of sight answers on its own, without a controller or combat", () => {
    expect(lineOfSight(() => false, { x: 0, y: 0 }, { x: 100, y: 0 })).toBe(true);
  });
});
