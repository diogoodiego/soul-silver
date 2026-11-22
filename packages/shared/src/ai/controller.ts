import { MAP_TILE_PX } from "../maps/constants.ts";
import { aimAt, eightWay, preferredRange, rotate, steer, threatened } from "./action.ts";
import { newSenses, perceive, remember, type Senses } from "./perception.ts";
import type { AiTuning, SkillProfile, TemperamentRules } from "./schemas.ts";
import { pickWeighted, reachPx, scoreMoves } from "./scoring.ts";
import { addDamage, chooseTarget, decayThreat, forget, newThreat, type ThreatTable } from "./threat.ts";
import type { AiEnv, AiHooks, AiInput, AiTick, Decision, MoveScore, Point } from "./view.ts";

/** Block C: BUTTON.dash and BUTTON.guard (game/protocol imports this module, so they are repeated here; a test keeps them equal). */
export const AI_BUTTONS = { dash: 1 << 4, guard: 1 << 9 } as const;
const BUTTON = AI_BUTTONS;

/** Block C: wild Pokémon chain 1–3 normals on impulse; trainers' chain 3, back off and use every ready special. */
export type Strategy = "wild" | "trainer";

// The combat AI controller (spec 019): perceive, decide in a state machine, act through the same
// input a player sends. Pure: the server feeds it an AiTick and hands the input to combat.

export const AI_STATES = ["idle", "alert", "approach", "combat", "reposition", "flee", "return", "incapacitated"] as const;
export type AiStateName = (typeof AI_STATES)[number];

const TILE = MAP_TILE_PX;
const TICKS_PER_S = 20;
/** Combat body radius (content/combat tuning bodyRadiusPx); only used to judge reach. */
const BODY_PX = 8;
const ZERO: Point = { x: 0, y: 0 };

const ticks = (s: number) => Math.round(s * TICKS_PER_S);
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const toward = (from: Point, to: Point): Point => {
  const d = dist(from, to);
  return d < 1e-6 ? ZERO : { x: (to.x - from.x) / d, y: (to.y - from.y) / d };
};

type Plan = "approach" | "flee" | "watch";

export interface ControllerOptions {
  id: number;
  home: Point;
  /** Farther than this from home, it walks back (spawn leashTiles). */
  leashPx: number;
  profile: SkillProfile;
  temperament: TemperamentRules;
  /** The rules used while enraged (the aggressive ones). */
  angry: TemperamentRules;
  tuning: AiTuning;
  hooks?: AiHooks | undefined;
  look?: Point | undefined;
  /** Block C: "wild" when omitted. */
  strategy?: Strategy | undefined;
}

export interface Controller extends Required<Omit<ControllerOptions, "look" | "hooks">> {
  /** Block C: normals left in the current chain; back off once it is done (trainers). */
  chain: number;
  retreat: boolean;
  /** Block C: a dodge (or a parry) timed to the move it answers. */
  react: { at: number; parry: boolean; dir: Point } | undefined;
  hooks: AiHooks;
  state: AiStateName;
  since: number;
  senses: Senses;
  threat: ThreatTable;
  plan: Plan | undefined;
  /** Seen but only watched; it does not alert again for the same one. */
  watched: number | undefined;
  nextPerception: number;
  nextDecision: number;
  pending: number | undefined;
  wander: { dir: Point; until: number };
  ignoreUntil: number;
  angryUntil: number;
  stunUntil: number;
  fightStart: number | undefined;
  strafe: 1 | -1;
  dodgeDir: Point;
  /** Per opponent, the tick its current cast began, once judged. */
  dodged: Map<number, number>;
  lastDecision: Decision | undefined;
}

export function createController(o: ControllerOptions): Controller {
  return {
    id: o.id,
    home: o.home,
    leashPx: o.leashPx,
    profile: o.profile,
    temperament: o.temperament,
    angry: o.angry,
    tuning: o.tuning,
    hooks: o.hooks ?? {},
    strategy: o.strategy ?? "wild",
    chain: 0,
    retreat: false,
    react: undefined,
    state: "idle",
    since: 0,
    senses: newSenses(o.look ?? { x: 0, y: 1 }),
    threat: newThreat(),
    plan: undefined,
    watched: undefined,
    // Spread perception and decisions of many AIs over different ticks.
    nextPerception: o.id % o.tuning.perception.everyTicks,
    nextDecision: o.id % Math.max(1, ticks(o.profile.decisionIntervalS)),
    pending: undefined,
    wander: { dir: ZERO, until: 0 },
    ignoreUntil: 0,
    angryUntil: 0,
    stunUntil: 0,
    fightStart: undefined,
    strafe: 1,
    dodgeDir: ZERO,
    dodged: new Map(),
    lastDecision: undefined,
  };
}

/** After a ball escape: aggressive whatever the temperament until `untilTick`. */
export function enrage(c: Controller, untilTick: number): void {
  c.angryUntil = untilTick;
  c.ignoreUntil = 0;
}

export interface StepResult {
  input: AiInput;
  /** Shows the "!" bubble. */
  alert: boolean;
  /** State changes and move choices this tick, for the log. */
  decisions: Decision[];
}

export function stepController(c: Controller, t: AiTick, env: AiEnv): StepResult {
  const { self, tick } = t;
  const { profile, tuning: k } = c;
  const decisions: Decision[] = [];
  const input: AiInput = { move: ZERO, buttons: 0, aim: undefined };
  const log = (scores: MoveScore[] = [], chosenSlot?: number) => {
    const d: Decision = { tick, entityId: c.id, state: c.state, target: c.threat.current, scores, chosenSlot };
    decisions.push(d);
    return d;
  };
  const enter = (state: AiStateName) => {
    if (c.state === state) return;
    c.state = state;
    c.since = tick;
    if (state === "return") c.ignoreUntil = tick + ticks(k.states.returnIgnoreS);
    if (state !== "combat") c.pending = undefined;
    log();
  };
  const walk = (dir: Point) => steer(self, dir, TILE, env.walkable) ?? ZERO;

  // Perception.
  const present = new Set(t.opponents.map((o) => o.id));
  for (const id of [...c.threat.values.keys(), c.threat.current, c.threat.first]) if (id !== undefined && !present.has(id)) forget(c.threat, id);
  if (tick >= c.nextPerception) {
    perceive(c.senses, t, profile, k, env);
    decayThreat(c.threat, k.perception.everyTicks / TICKS_PER_S, k);
    c.nextPerception = tick + k.perception.everyTicks;
  }
  // A hit is felt, and shows where it came from.
  for (const h of t.hurtBy) {
    const o = t.opponents.find((x) => x.id === h.id);
    if (o) {
      remember(c.senses, o.id, o, tick);
      c.senses.look = toward(self, o);
    }
    addDamage(c.threat, h.id, (100 * h.amount) / Math.max(1, self.hpMax), k);
  }
  const hurt = t.hurtBy.length > 0;
  const known = [...c.senses.memory].map(([id, m]) => ({ id, distPx: dist(self, m) }));
  const target = chooseTarget(c.threat, known, profile.sightTiles * TILE, profile.targetSwitchMargin, k);
  const mem = target === undefined ? undefined : c.senses.memory.get(target);
  const opp = t.opponents.find((o) => o.id === target);
  const angry = tick < c.angryUntil;
  const rules = angry ? c.angry : c.temperament;
  const inZone = (p: Point) => dist(p, c.home) <= (rules.toleranceTiles ?? 0) * TILE;
  const byZone = rules.onSeePlayer === "alert-by-zone";

  // Incapacitated: nothing at all until it recovers.
  if (self.stunned) c.stunUntil = tick + ticks(profile.decisionIntervalS);
  if (self.immobile || tick < c.stunUntil) {
    enter("incapacitated");
    return { input, alert: false, decisions };
  }
  if (c.state === "incapacitated") enter(mem ? "combat" : "idle");

  if (c.state !== "return" && dist(self, c.home) > c.leashPx) enter("return");

  const react = (): Plan | undefined => {
    if (hurt) {
      if (rules.onHurt === "fight") return "approach";
      if (rules.onHurt === "flee") return "flee";
      return env.rng.nextFloat() < (rules.fightWeight ?? 0) ? "approach" : "flee";
    }
    switch (rules.onSeePlayer) {
      case "ignore":
        return undefined;
      case "alert-approach":
        return "approach";
      case "alert-flee":
        return "flee";
      case "alert-watch":
        return target === c.watched ? undefined : "watch";
      case "alert-by-zone":
        return mem && inZone(mem) ? "approach" : undefined;
    }
  };

  switch (c.state) {
    case "idle": {
      const plan = mem && tick >= c.ignoreUntil ? react() : undefined;
      if (plan) {
        c.plan = plan;
        enter("alert");
        break;
      }
      input.move = wander(c, t, env);
      break;
    }
    case "alert": {
      if (mem) c.senses.look = toward(self, mem);
      if (tick - c.since < ticks(Math.max(k.states.alertS, profile.reactionS))) break;
      if (c.plan === "watch") {
        c.watched = target;
        enter("idle");
      } else enter(c.plan ?? "idle");
      break;
    }
    case "approach":
    case "combat":
    case "reposition": {
      if (!mem) {
        enter("return");
        break;
      }
      const d = dist(self, mem);
      if (d > rules.chaseLimitTiles * TILE || (byZone && !angry && !inZone(mem))) {
        enter("return");
        break;
      }
      if (self.hp / self.hpMax < (rules.fleeHpFraction ?? profile.fleeHpFraction)) {
        enter("flee");
        break;
      }
      c.fightStart ??= tick;
      // Block C: a visible cast that will reach it: once per cast, by its chance, a dodge (the only answer to a
      // special) just before the move leaves, or a parry at any moment of the cast.
      const coming = t.opponents.filter((o) => o.casting && c.senses.visible.has(o.id) && threatened(self, { ...o, cast: o.casting }, BODY_PX));
      for (const o of coming) {
        const cast = o.casting!;
        if (c.dodged.get(o.id) === tick - cast.elapsedTicks) continue;
        c.dodged.set(o.id, tick - cast.elapsedTicks);
        if (env.rng.nextFloat() >= (c.strategy === "trainer" ? profile.reactChance : k.action.wildReactChance)) continue;
        const parry = !cast.special && env.rng.nextInt(2) === 0;
        const wait = parry ? env.rng.nextInt(Math.max(1, cast.leftTicks)) : Math.max(0, cast.leftTicks - ticks(k.action.reactLeadS));
        c.react = { at: tick + wait, parry, dir: rotate(cast.dir, env.rng.nextInt(2) === 0 ? 90 : -90) };
      }
      if (c.react && tick >= c.react.at) {
        const r = c.react;
        c.react = undefined;
        if (!self.casting) {
          input.buttons = r.parry ? BUTTON.guard : BUTTON.dash;
          if (!r.parry) input.move = eightWay(walk(r.dir));
          // It dodges sideways but keeps its eyes on the target.
          c.senses.look = toward(self, mem);
          return { input, alert: false, decisions };
        }
      }
      // A trainer's chain is over: it backs off.
      if (c.retreat && !self.casting) {
        c.retreat = false;
        c.dodgeDir = toward(mem, self);
        enter("reposition");
      }
      if (c.state === "reposition") {
        if (tick - c.since >= ticks(k.states.repositionS)) enter("combat");
        // Under attack, it stands and guards instead: only as the move leaves, as a press before would parry it.
        else if (hurt || coming.some((o) => !o.casting!.special && o.casting!.leftTicks <= 0)) input.buttons = BUTTON.guard;
        else {
          // It backs off facing the target.
          input.move = eightWay(walk(c.dodgeDir));
          c.senses.look = toward(self, mem);
          return { input, alert: false, decisions };
        }
        break;
      }
      const range = preferredRange(self.moves);
      if (c.state === "approach") {
        if (d > range.px * 1.2 + BODY_PX) {
          input.move = walk(toward(self, mem));
          break;
        }
        enter("combat");
      }
      if (tick >= c.nextDecision && opp) {
        c.nextDecision = tick + ticks(profile.decisionIntervalS);
        c.hooks.chooseSwitch?.(t);
        c.hooks.chooseItem?.(t);
        // A skittish one fights only while it has no way out.
        if (rules.onSeePlayer === "alert-flee" && !angry && steer(self, toward(mem, self), TILE, env.walkable)) {
          enter("flee");
          break;
        }
        const speed = Math.hypot(mem.velocity.x, mem.velocity.y);
        const scores = scoreMoves(self, opp, {
          profile,
          tuning: k,
          effectiveness: env.effectiveness,
          distPx: d,
          targetSpeedPx: speed,
          fightS: (tick - c.fightStart) / TICKS_PER_S,
          safe: d > k.score.buffSafeTiles * TILE,
        });
        if (scores.length > 0) {
          const pick = choose(c, self.moves, scores, env);
          c.pending = pick.slot;
          c.lastDecision = log(scores, pick.slot);
        }
        c.strafe = env.rng.nextInt(2) === 0 ? 1 : -1;
      }
      const m = c.pending === undefined ? undefined : self.moves.find((x) => x.slot === c.pending);
      if (c.pending !== undefined && !m?.ready) c.pending = undefined;
      const reach = m ? reachPx(m) + BODY_PX : range.px;
      if (d > Math.min(reach, range.px * 1.2 + BODY_PX) && d > reach * 0.9) input.move = walk(toward(self, mem));
      else if (d < range.px * 0.6) input.move = walk(toward(mem, self));
      else if (range.ranged) input.move = walk(rotate(toward(self, mem), 90 * c.strafe));
      if (m && c.pending !== undefined && !self.casting && d <= reach && c.senses.visible.has(target!)) {
        input.aim = aimAt(self, mem, mem.velocity, profile.leadFactor, m.speedPx, profile.aimErrorDeg, env.rng);
        input.buttons = 1 << c.pending;
        c.pending = undefined;
        // Block C: a chain goes on at once; a trainer backs off after its last normal.
        if (!m.special && c.chain > 0) {
          c.chain--;
          if (c.chain > 0) c.nextDecision = tick + 1;
          else if (c.strategy === "trainer") c.retreat = true;
        }
      } else if (mem) input.aim = toward(self, mem);
      break;
    }
    case "flee": {
      if (!mem) {
        enter("return");
        break;
      }
      const away = steer(self, toward(mem, self), TILE, env.walkable);
      if (!away) {
        if (rules.fightWhenCornered) enter("combat");
        break;
      }
      input.move = away;
      break;
    }
    case "return": {
      if (dist(self, c.home) <= k.states.idleWanderTiles * TILE) {
        enter("idle");
        break;
      }
      input.move = walk(toward(self, c.home));
      break;
    }
  }
  if (input.move.x !== 0 || input.move.y !== 0) {
    input.move = eightWay(input.move);
    c.senses.look = input.move;
  }
  // Searching the last place it saw the target: looks around.
  if (c.state === "approach" && mem && target !== undefined && !c.senses.visible.has(target) && dist(self, mem) < TILE && tick % 10 === 0) c.senses.look = rotate(c.senses.look, 90);
  return { input, alert: c.state === "alert", decisions };
}

/**
 * Block C: a trainer's Pokémon takes its best ready special (one worth more than a blocked move); a wild one only by
 * its chance. Otherwise a normal, starting a chain when none is under way.
 */
function choose(c: Controller, moves: AiTick["self"]["moves"], scores: MoveScore[], env: AiEnv): MoveScore {
  const k = c.tuning;
  const special = (s: MoveScore) => moves.find((m) => m.slot === s.slot)?.special === true;
  const specials = scores.filter((s) => special(s) && s.score > k.score.immuneScore);
  const normals = scores.filter((s) => !special(s));
  if (normals.length === 0) return pickWeighted(scores, c.profile.temperature, env.rng);
  if (specials.length > 0 && c.strategy === "trainer") return specials.reduce((a, b) => (b.score > a.score ? b : a));
  if (specials.length > 0 && env.rng.nextFloat() < k.action.wildSpecialChance) return pickWeighted(specials, c.profile.temperature, env.rng);
  if (c.chain === 0) c.chain = c.strategy === "trainer" ? k.action.trainerChain : 1 + env.rng.nextInt(k.action.wildChainMax);
  return pickWeighted(normals, c.profile.temperature, env.rng);
}

/** Idle: short walks and pauses near home, never onto water, ledges or edges. */
function wander(c: Controller, t: AiTick, env: AiEnv): Point {
  const { self, tick } = t;
  const k = c.tuning.states;
  if (tick >= c.wander.until) {
    c.wander.until = tick + ticks(k.idlePauseS);
    const a = env.rng.nextFloat() * Math.PI * 2;
    const dir = { x: Math.cos(a), y: Math.sin(a) };
    // Half the time it stands still and looks around.
    if (env.rng.nextInt(2) === 0) {
      c.wander.dir = ZERO;
      c.senses.look = dir;
    } else c.wander.dir = eightWay(dir);
  }
  // Past the zone's edge the walk itself turns home: keeping the old one stepped it out again the next tick.
  if (dist(self, c.home) > k.idleWanderTiles * TILE) c.wander.dir = eightWay(toward(self, c.home));
  const dir = c.wander.dir;
  if (dir.x === 0 && dir.y === 0) return ZERO;
  // Boxed in, it stands until the pause ends: choosing again at once turned it every tick.
  return steer(self, dir, TILE, env.walkable) ?? ZERO;
}
