import { createController, stepController, type Controller } from "../../src/ai/controller.ts";
import type { TemperamentRules } from "../../src/ai/schemas.ts";
import type { AiEnv, AiInput, AiTick, OpponentView, Point, SelfView } from "../../src/ai/view.ts";
import { env as makeEnv, profile, self as makeSelf, TEMPERAMENTS, TUNING } from "./fixtures.ts";

// A tiny headless world for controller scenarios: the AI walks 3 px per tick where the map allows,
// opponents follow a script. No combat: moves only show up as pressed buttons.

export interface Scenario {
  temperament?: keyof typeof TEMPERAMENTS;
  rules?: Partial<TemperamentRules>;
  profileId?: string;
  self?: Partial<SelfView>;
  home?: Point;
  leashTiles?: number;
  env?: AiEnv;
  /** Opponents at a tick. */
  opponents?: (tick: number, me: SelfView) => OpponentView[];
  /** Extra tick fields (hurtBy, noises) at a tick. */
  extra?: (tick: number, me: SelfView) => Partial<AiTick>;
}

export function simulate(s: Scenario) {
  const env = s.env ?? makeEnv();
  let me = makeSelf(s.self);
  const temperament = { ...TEMPERAMENTS[s.temperament ?? "aggressive"], ...s.rules };
  const c: Controller = createController({
    id: me.id,
    home: s.home ?? { x: me.x, y: me.y },
    leashPx: (s.leashTiles ?? 10) * 16,
    profile: profile(s.profileId ?? "veteran"),
    temperament,
    angry: TEMPERAMENTS.aggressive,
    tuning: TUNING,
    look: { x: 1, y: 0 },
  });
  const states: string[] = [];
  const inputs: AiInput[] = [];
  const alerts: boolean[] = [];
  let tick = 0;
  return {
    c,
    get me() {
      return me;
    },
    set me(v: SelfView) {
      me = v;
    },
    states,
    inputs,
    alerts,
    run(n: number) {
      for (let i = 0; i < n; i++, tick++) {
        const t: AiTick = { tick, self: me, opponents: s.opponents?.(tick, me) ?? [], noises: [], hurtBy: [], ...s.extra?.(tick, me) };
        const out = stepController(c, t, env);
        inputs.push(out.input);
        alerts.push(out.alert);
        if (states[states.length - 1] !== c.state) states.push(c.state);
        const len = Math.hypot(out.input.move.x, out.input.move.y);
        if (len > 0) {
          const next = { x: me.x + (out.input.move.x / len) * 3, y: me.y + (out.input.move.y / len) * 3 };
          if (env.walkable(next)) me = { ...me, ...next };
        }
      }
      return this;
    },
  };
}
