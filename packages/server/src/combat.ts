import {
  applyStage,
  canApply,
  computeDamage,
  computeStats,
  effectiveness,
  overlaps,
  rollCrit,
  rollRandom,
  segmentHits,
  speedScale,
  stageMultiplier,
  STAGE_KEYS,
  startStatus,
  tickStatus,
  toTicks,
  type Body,
  type Effect,
  type Point,
  type StageKey,
  type StatusId,
  type StatusState,
  type StatOptions,
  type Stats,
  type Weather,
} from "@soulsilver/shared/combat";
import { tileAt, type EntityData, type HitEvent, type Rng, type WorldLookup } from "@soulsilver/shared/game";
import type { Direction } from "@soulsilver/shared/maps";
import type { CombatData, CombatMove } from "./combat-loader";
import type { World } from "./world";

// Real-time combat (spec 013): the server decides every hit, every amount and every status.
// Combatants are `pokemon` entities; projectiles and fields in flight are `projectile` entities.

/** A player id, "wild" for Pokémon nobody owns, or "trainer" for an NPC trainer's (spec 022). */
export type Owner = number | "wild" | "trainer";

export interface CombatantSpec {
  species: number;
  level: number;
  moves: number[];
  /** IVs, EVs and nature of a party member (spec 016); the dev arena defaults otherwise. */
  stats?: StatOptions | undefined;
}

export interface CombatInput {
  move: Point;
  /** Bits 0–3 are move slots 1–4. */
  buttons: number;
  aim?: Point | undefined;
  /** The AI's floor on cast time (spec 019, FR-026): none of its moves comes out without a wind-up. */
  minCastTicks?: number | undefined;
}

export interface Combatant {
  entityId: number;
  owner: Owner;
  /** The trainer battle it fights in (spec 022); moves only reach combatants with the same value. */
  battle: number | undefined;
  species: number;
  level: number;
  types: number[];
  moves: CombatMove[];
  stats: Stats;
  hp: number;
  stages: Record<StageKey, number>;
  major: StatusState | undefined;
  confusion: StatusState | undefined;
  /** Tick at which each slot can be used again. */
  readyAt: number[];
  casting: { slot: number; dir: Point; startTick: number; readyTick: number } | undefined;
  /** Last move used (executed), so clients can play its animation even when it hits nothing. */
  used: { count: number; move: number; dir: Point; arc?: { radiusPx: number; angleDeg: number } | undefined };
  dashing: boolean;
  /** Space dash: direction, ticks left and the tick it can be used again. */
  evade: { dir: Point; left: number; readyAt: number };
  flashUntil: number;
  /** Buttons held on the previous tick: a move starts on the press. */
  buttons: number;
}

interface Active {
  kind: "projectile" | "dash" | "field";
  caster: Combatant;
  move: CombatMove;
  /** The world entity drawn for projectiles and fields. */
  entityId: number | undefined;
  x: number;
  y: number;
  dir: Point;
  travelled: number;
  until: number;
  hits: Map<number, number>;
}

export interface CombatOptions {
  data: CombatData;
  rng: Rng;
  lookup: WorldLookup;
}

const SOLID = new Set(["blocked", "water", "ledge"]);
const TICKS_PER_S = 20;
const FIRE = 10;
const WATER = 11;
/** Moves that aim themselves at the nearest foe; self-centred ones keep the input direction. */
const AIMED = new Set(["melee", "projectile", "beam", "target-area", "dash", "target-debuff"]);
const AUTO_AIM_MIN_PX = 64;
/** Space dash: shortcut: fixed tuning, move to combat content JSON if it needs balancing. */
const DASH_BIT = 1 << 4;
const DASH_TICKS = 4;
const DASH_PX_PER_TICK = 8;
const DASH_COOLDOWN_TICKS = 20;
const zeroStages =() => Object.fromEntries(STAGE_KEYS.map((k) => [k, 0])) as Record<StageKey, number>;

const rotate = (d: Point, deg: number): Point => {
  const r = (deg * Math.PI) / 180;
  return { x: d.x * Math.cos(r) - d.y * Math.sin(r), y: d.x * Math.sin(r) + d.y * Math.cos(r) };
};
const facingOf = (d: Point): Direction => (Math.abs(d.x) >= Math.abs(d.y) ? (d.x >= 0 ? "east" : "west") : d.y >= 0 ? "south" : "north");
const VECTORS: Record<Direction, Point> = { north: { x: 0, y: -1 }, south: { x: 0, y: 1 }, east: { x: 1, y: 0 }, west: { x: -1, y: 0 } };

/** Any two owners fight: wild against players and player against player (PvP); never one's own Pokémon. */
export const canHarm = (a: Owner, b: Owner): boolean => a !== b;

export function createCombat(options: CombatOptions) {
  const { data, rng, lookup } = options;
  const { tuning } = data;
  const combatants = new Map<number, Combatant>();
  const inputs = new Map<number, CombatInput>();
  let actives: Active[] = [];
  let weather: { kind: Weather; until: number } | undefined;
  let world: World;
  let tick = 0;
  let events: HitEvent[] = [];

  const statusDef = (id: StatusId) => data.statuses.get(id)!;
  const majorDef = (c: Combatant) => (c.major ? statusDef(c.major.id) : undefined);
  const immobile = (c: Combatant) => majorDef(c)?.immobile === true;
  const pos = (c: Combatant) => world.get(c.entityId)!;
  const body = (c: Combatant): Body => ({ x: pos(c).x, y: pos(c).y, r: tuning.bodyRadiusPx });
  const foes = (c: Combatant) => [...combatants.values()].filter((t) => t.hp > 0 && canHarm(c.owner, t.owner) && c.battle === t.battle);
  const roll = (chance: number) => chance >= 100 || rng.nextInt(100) < chance;
  /** Position of the closest foe within `range` px, if any. */
  function nearestFoe(c: Combatant, range: number): Point | undefined {
    const me = pos(c);
    let best: Point | undefined;
    let bestD = range;
    for (const t of foes(c)) {
      const p = pos(t);
      const d = Math.hypot(p.x - me.x, p.y - me.y);
      if (p.area === me.area && d <= bestD) [best, bestD] = [{ x: p.x, y: p.y }, d];
    }
    return best;
  }

  function speedOf(c: Combatant): number {
    return Math.floor(c.stats.speed * stageMultiplier(c.stages.speed) * (majorDef(c)?.speedMul ?? 1));
  }
  const movePx = (c: Combatant) => speedScale(tuning.speed, speedOf(c)).movePx / TICKS_PER_S;
  const cooldownTicks = (c: Combatant, slot: number) => Math.round(c.moves[slot]!.cooldownTicks * speedScale(tuning.speed, speedOf(c)).cooldownMul);

  function emit(e: Omit<HitEvent, "effectiveness" | "crit" | "push" | "amount"> & Partial<HitEvent>): void {
    events.push({ amount: 0, effectiveness: 1, crit: false, push: { x: 0, y: 0 }, ...e });
  }

  /** Moves the entity by (dx, dy), axis by axis, stopping at solid tiles. */
  function shift(entityId: number, dx: number, dy: number, facing?: Direction): void {
    const e = world.get(entityId)!;
    let { x, y } = e;
    if (!SOLID.has(tileAt(lookup, e.area, e.level, x + dx, y)?.category ?? "")) x += dx;
    if (!SOLID.has(tileAt(lookup, e.area, e.level, x, y + dy)?.category ?? "")) y += dy;
    world.update({ ...e, x, y, facing: facing ?? e.facing });
  }

  function hurt(t: Combatant, amount: number): void {
    t.hp = Math.max(0, t.hp - amount);
    t.flashUntil = tick + toTicks(tuning.flashS);
    if (t.hp === 0) t.casting = undefined;
  }

  function inflict(t: Combatant, id: StatusId): boolean {
    const def = statusDef(id);
    if (!canApply(def, t.types, { major: t.major?.id, confused: t.confusion !== undefined })) return false;
    const state = startStatus(def, tick, rng);
    if (def.major) t.major = state;
    else t.confusion = state;
    if (def.immobile) t.casting = undefined;
    return true;
  }

  function weatherMul(type: number): number {
    if (!weather || tick >= weather.until) return 1;
    if (weather.kind === "sun") return type === FIRE ? 1.5 : type === WATER ? 0.5 : 1;
    if (weather.kind === "rain") return type === WATER ? 1.5 : type === FIRE ? 0.5 : 1;
    return 1;
  }

  function damageOf(c: Combatant, t: Combatant, move: CombatMove, e: Extract<Effect, { kind: "damage" }>): { amount: number; crit: boolean } {
    if (e.fixed) return { amount: e.fixed, crit: false };
    if (e.level) return { amount: c.level, crit: false };
    if (e.targetHpFraction) return { amount: Math.max(1, Math.floor(t.hp * e.targetHpFraction)), crit: false };
    const physical = move.category === "physical";
    const row = data.typeChart.find((r) => r.id === move.type);
    const crit = rollCrit(rng, move.critStage + c.stages.crit, tuning.critChances);
    const amount = computeDamage({
      level: c.level,
      power: move.power,
      attack: physical ? c.stats.attack : c.stats.specialAttack,
      defense: physical ? t.stats.defense : t.stats.specialDefense,
      attackStage: physical ? c.stages.attack : c.stages.specialAttack,
      defenseStage: physical ? t.stages.defense : t.stages.specialDefense,
      stab: c.types.includes(move.type),
      typeMultipliers: [...new Set(t.types)].map((type) => (row?.against[type] ?? 10) / 10),
      burned: physical && majorDef(c)?.attackMul !== undefined,
      weather: weatherMul(move.type),
      crit,
      random: rollRandom(rng),
    });
    return { amount, crit };
  }

  /** Pushes `t` away from `from` (or along `dir` when they overlap). */
  function push(t: Combatant, from: Point, dir: Point, px: number): Point {
    const p = pos(t);
    const dx = p.x - from.x;
    const dy = p.y - from.y;
    const len = Math.hypot(dx, dy);
    const d = len > 0.001 ? { x: dx / len, y: dy / len } : dir;
    const v = { x: d.x * px, y: d.y * px };
    shift(t.entityId, v.x, v.y);
    return v;
  }

  /** Everything a move does to one target it reached. */
  function hit(c: Combatant, t: Combatant, move: CombatMove, from: Point, dir: Point): void {
    if (t.hp === 0 || pos(t).data["cutscene"] === true) return;
    const eff = effectiveness(data.typeChart, move.type, t.types);
    const damage = move.effects.find((e) => e.kind === "damage");
    if (damage) {
      if (eff === 0) {
        emit({ kind: "immune", attacker: c.entityId, target: t.entityId, move: move.id, effectiveness: 0 });
        return;
      }
      let dealt = 0;
      for (let h = 0; h < move.hits && t.hp > 0; h++) {
        const { amount, crit } = damageOf(c, t, move, damage);
        const done = Math.min(amount, t.hp);
        hurt(t, amount);
        dealt += done;
        const v = push(t, from, dir, tuning.knockbackPx);
        emit({ kind: "hit", attacker: c.entityId, target: t.entityId, move: move.id, amount: done, effectiveness: eff, crit, push: v });
      }
      if (move.type === FIRE && t.major?.id === "freeze") t.major = undefined;
      for (const e of move.effects) {
        if (e.kind === "recoil" && dealt > 0) {
          const amount = Math.max(1, Math.floor(dealt * e.fraction));
          hurt(c, amount);
          emit({ kind: "hit", attacker: c.entityId, target: c.entityId, move: move.id, amount });
        } else if (e.kind === "drain" && dealt > 0) {
          const amount = Math.min(c.stats.hp - c.hp, Math.max(1, Math.floor(dealt * e.fraction)));
          c.hp += amount;
          emit({ kind: "heal", attacker: c.entityId, target: c.entityId, move: move.id, amount });
        }
      }
    }
    for (const e of move.effects) {
      if (t.hp === 0) return;
      const chance = "chance" in e ? (e.chance ?? move.defaultChance) : 100;
      if (e.kind === "status" && roll(chance) && inflict(t, e.status)) {
        emit({ kind: "status", attacker: c.entityId, target: t.entityId, move: move.id, status: e.status });
      } else if (e.kind === "stages" && e.target === "target" && roll(chance)) {
        const { stage, applied } = applyStage(t.stages[e.stat], e.delta);
        t.stages[e.stat] = stage;
        if (applied !== 0) emit({ kind: "stages", attacker: c.entityId, target: t.entityId, move: move.id, status: e.stat });
      } else if (e.kind === "flinch" && t.casting && roll(chance)) {
        t.casting = undefined;
        emit({ kind: "failed", attacker: t.entityId, target: t.entityId, move: move.id });
      } else if (e.kind === "knockback") {
        push(t, from, dir, e.px);
      } else if (e.kind === "reset-stages") {
        t.stages = zeroStages();
      }
    }
  }

  /** Effects on the user that do not need a target. */
  function selfEffects(c: Combatant, move: CombatMove): void {
    for (const e of move.effects) {
      const chance = "chance" in e ? (e.chance ?? move.defaultChance) : 100;
      if (e.kind === "stages" && e.target === "self" && roll(chance)) {
        const { stage, applied } = applyStage(e.stat === "crit" ? Math.min(c.stages.crit, 4) : c.stages[e.stat], e.delta);
        c.stages[e.stat] = e.stat === "crit" ? Math.min(Math.max(stage, 0), 4) : stage;
        if (applied !== 0) emit({ kind: "stages", attacker: c.entityId, target: c.entityId, move: move.id, status: e.stat });
      } else if (e.kind === "heal") {
        const amount = Math.min(c.stats.hp - c.hp, Math.floor(c.stats.hp * e.fraction));
        c.hp += amount;
        emit({ kind: "heal", attacker: c.entityId, target: c.entityId, move: move.id, amount });
      } else if (e.kind === "weather") {
        weather = { kind: e.weather, until: tick + move.durationTicks };
      } else if (e.kind === "reset-stages") {
        c.stages = zeroStages();
      }
    }
  }

  function spawnShot(c: Combatant, kind: Active["kind"], move: CombatMove, at: Point, dir: Point, until: number): void {
    const self = pos(c);
    const entityId = kind === "dash" ? undefined : world.add({ kind: "projectile", area: self.area, x: at.x, y: at.y, level: self.level, facing: facingOf(dir), data: { move: move.id, caster: c.entityId, field: kind === "field" } }).id;
    actives.push({ kind, caster: c, move, entityId, x: at.x, y: at.y, dir, travelled: 0, until, hits: new Map() });
    if (kind === "dash") c.dashing = true;
  }

  function execute(c: Combatant): void {
    const { slot, dir } = c.casting!;
    c.casting = undefined;
    const move = c.moves[slot]!;
    c.readyAt[slot] = tick + cooldownTicks(c, slot);
    const arc = move.behavior === "melee" && move.hitbox?.shape === "arc" ? move.hitbox : undefined;
    c.used = { count: c.used.count + 1, move: move.id, dir, arc };
    selfEffects(c, move);
    const me = pos(c);
    const at = { x: me.x + dir.x * move.rangePx, y: me.y + dir.y * move.rangePx };
    switch (move.behavior) {
      case "self-buff":
        return;
      case "projectile":
        spawnShot(c, "projectile", move, { x: me.x, y: me.y }, dir, Infinity);
        return;
      case "dash":
        spawnShot(c, "dash", move, { x: me.x, y: me.y }, dir, Infinity);
        return;
      case "field":
        spawnShot(c, "field", move, at, dir, tick + move.durationTicks);
        return;
      default: {
        // Instant shapes: from the user, or at the aimed point for target-area.
        const origin = move.behavior === "target-area" ? at : me;
        for (const t of foes(c)) if (overlaps(move.hitbox!, origin, dir, body(t))) hit(c, t, move, me, dir);
      }
    }
  }

  function begin(c: Combatant, slot: number, aim: Point | undefined, minCastTicks = 0): void {
    if (tick < c.readyAt[slot]!) return;
    const self = pos(c);
    const len = aim ? Math.hypot(aim.x, aim.y) : 0;
    let dir = len > 0.01 ? { x: aim!.x / len, y: aim!.y / len } : VECTORS[self.facing];
    // No aim (every player): the nearest foe anywhere on the map; an aim (the AI) is only corrected in reach.
    const reach = aim ? Math.max(c.moves[slot]!.rangePx, AUTO_AIM_MIN_PX) : Infinity;
    const target = AIMED.has(c.moves[slot]!.behavior) ? nearestFoe(c, reach) : undefined;
    if (target) {
      const d = Math.hypot(target.x - self.x, target.y - self.y);
      if (d > 0.01) dir = { x: (target.x - self.x) / d, y: (target.y - self.y) / d };
    }
    const confusion = c.confusion && statusDef("confusion");
    if (confusion && roll(confusion.misdirect ?? 0)) dir = rotate(dir, (rng.nextFloat() * 2 - 1) * (confusion.deviationDeg ?? 0));
    if (c.stages.accuracy < 0) dir = rotate(dir, (rng.nextFloat() * 2 - 1) * -c.stages.accuracy * tuning.accuracyDeviationDeg);
    const skip = majorDef(c)?.skipMove;
    if (skip && rng.nextInt(100) < skip) {
      c.readyAt[slot] = tick + cooldownTicks(c, slot);
      emit({ kind: "failed", attacker: c.entityId, target: c.entityId, move: c.moves[slot]!.id });
      return;
    }
    world.update({ ...self, facing: facingOf(dir) });
    const castTicks = Math.max(c.moves[slot]!.castTicks, minCastTicks);
    c.casting = { slot, dir, startTick: tick, readyTick: tick + castTicks };
    if (castTicks === 0) execute(c);
  }

  function move(c: Combatant, input: Point): void {
    const len = Math.hypot(input.x, input.y);
    if (len < 0.1) return;
    const k = movePx(c) / Math.max(1, len);
    shift(c.entityId, input.x * k, input.y * k, facingOf(input));
  }

  function stepActive(a: Active): boolean {
    const c = a.caster;
    if (a.kind === "field") {
      if (tick >= a.until) return false;
      for (const t of foes(c)) {
        if ((a.hits.get(t.entityId) ?? 0) >= a.move.hits) continue;
        if (overlaps(a.move.hitbox!, a, a.dir, body(t))) {
          a.hits.set(t.entityId, (a.hits.get(t.entityId) ?? 0) + 1);
          hit(c, t, a.move, a, a.dir);
        }
      }
      return true;
    }
    const step = Math.min(a.move.speedPx / TICKS_PER_S, a.move.rangePx - a.travelled);
    if (step <= 0 || c.hp === 0) return false;
    const radius = a.move.hitbox?.shape === "circle" ? a.move.hitbox.radiusPx : 0;
    const from = a.kind === "dash" ? { x: pos(c).x, y: pos(c).y } : { x: a.x, y: a.y };
    let to = { x: from.x + a.dir.x * step, y: from.y + a.dir.y * step };
    if (a.kind === "dash") {
      shift(c.entityId, to.x - from.x, to.y - from.y);
      to = { x: pos(c).x, y: pos(c).y };
    }
    a.x = to.x;
    a.y = to.y;
    a.travelled += step;
    const target = foes(c).find((t) => segmentHits(from, to, radius, body(t)));
    if (target) {
      hit(c, target, a.move, to, a.dir);
      return false;
    }
    if (a.entityId !== undefined) world.update({ ...world.get(a.entityId)!, x: a.x, y: a.y });
    return a.travelled < a.move.rangePx;
  }

  function sync(c: Combatant): void {
    const e = world.get(c.entityId);
    if (!e) return;
    const data: EntityData = {
      species: c.species,
      level: c.level,
      hp: c.hp,
      hpMax: c.stats.hp,
      owner: String(c.owner),
      status: c.major?.id ?? "",
      confused: c.confusion !== undefined,
      casting: c.casting ? c.casting.slot + 1 : 0,
      used: c.used.count,
      usedMove: c.used.move,
      usedDx: Math.round(c.used.dir.x * 100),
      usedDy: Math.round(c.used.dir.y * 100),
      // Melee arcs: the client draws the reach the hit used.
      ...(c.used.arc ? { usedReach: c.used.arc.radiusPx, usedArc: c.used.arc.angleDeg } : {}),
      flash: tick < c.flashUntil,
      // Shiny wild Pokémon (spec 015) keep their palette.
      ...(e.data["shiny"] === true ? { shiny: true } : {}),
      // Out of reach during its trainer's cutscene (spec 021); the session sets and clears it.
      ...(e.data["cutscene"] === true ? { cutscene: true } : {}),
    };
    c.moves.forEach((m, i) => {
      data[`move${i + 1}`] = m.id;
      data[`cd${i + 1}`] = Math.max(0, c.readyAt[i]! - tick);
    });
    for (const k of STAGE_KEYS) if (c.stages[k] !== 0) data[`stg_${k}`] = c.stages[k];
    world.update({ ...e, data });
  }

  function get(id: number): Combatant {
    const c = combatants.get(id);
    if (!c) throw new Error(`Entity ${id} is not in combat`);
    return c;
  }

  return {
    spawn(w: World, entityId: number, spec: CombatantSpec, owner: Owner): Combatant {
      world = w;
      const species = data.species(spec.species);
      if (!species) throw new Error(`Espécie ${spec.species} não existe na extração`);
      const moves = spec.moves.map((id) => {
        const m = data.move(id);
        if (!m) throw new Error(`Golpe ${id} não existe na extração`);
        return m;
      });
      const stats = computeStats(species.baseStats, spec.level, spec.stats);
      const c: Combatant = {
        entityId,
        owner,
        battle: undefined,
        species: spec.species,
        level: spec.level,
        types: [...species.types],
        moves,
        stats,
        hp: stats.hp,
        stages: zeroStages(),
        major: undefined,
        confusion: undefined,
        readyAt: moves.map(() => 0),
        casting: undefined,
        used: { count: 0, move: 0, dir: { x: 0, y: 0 } },
        dashing: false,
        evade: { dir: { x: 0, y: 0 }, left: 0, readyAt: 0 },
        flashUntil: 0,
        buttons: 0,
      };
      combatants.set(entityId, c);
      sync(c);
      return c;
    },
    remove(w: World, entityId: number): void {
      combatants.delete(entityId);
      for (const a of actives) if (a.caster.entityId === entityId && a.entityId !== undefined) w.remove(a.entityId);
      actives = actives.filter((a) => a.caster.entityId !== entityId);
    },
    get: (id: number): Combatant | undefined => combatants.get(id),
    has: (id: number) => combatants.has(id),
    /** Puts a combatant into a trainer battle, or back out with undefined. */
    setBattle(id: number, battle: number | undefined): void {
      get(id).battle = battle;
    },
    /** This tick's input; it is used by the next step and then dropped. */
    input(id: number, input: CombatInput): void {
      inputs.set(id, input);
    },
    /** Applies a status as a move would (dev arena and tests). */
    inflict: (id: number, status: StatusId, at: number): boolean => {
      tick = at;
      return inflict(get(id), status);
    },
    /** Stat stages last until the Pokémon goes back to its ball (spec 14 calls this). */
    resetStages(id: number): void {
      get(id).stages = zeroStages();
    },
    /** Pixels per tick for the combatant's current Speed. */
    movePx: (id: number) => movePx(get(id)),
    cooldownTicks: (id: number, slot: number) => cooldownTicks(get(id), slot),
    /** One tick: statuses, inputs and movement, casts, moves in flight; returns what happened. */
    step(now: number, w: World): HitEvent[] {
      world = w;
      tick = now;
      events = [];
      const all = [...combatants.values()];
      for (const c of all) {
        if (c.hp === 0) continue;
        for (const key of ["major", "confusion"] as const) {
          const state = c[key];
          if (!state) continue;
          const { damage, ended } = tickStatus(statusDef(state.id), state, tick, c.stats.hp, rng);
          if (damage > 0) {
            hurt(c, damage);
            emit({ kind: "tick", attacker: c.entityId, target: c.entityId, move: 0, amount: damage, status: state.id });
          }
          if (ended) c[key] = undefined;
        }
      }
      for (const c of all) {
        const input = inputs.get(c.entityId);
        const pressed = (input?.buttons ?? 0) & ~c.buttons;
        c.buttons = input?.buttons ?? 0;
        if (c.hp === 0 || immobile(c) || c.dashing) continue;
        if (pressed & DASH_BIT && !c.casting && c.evade.left === 0 && tick >= c.evade.readyAt) {
          const m = input?.move ?? { x: 0, y: 0 };
          const len = Math.hypot(m.x, m.y);
          const dir = len > 0.1 ? { x: m.x / len, y: m.y / len } : VECTORS[pos(c).facing];
          c.evade = { dir, left: DASH_TICKS, readyAt: tick + DASH_COOLDOWN_TICKS };
        }
        if (c.evade.left > 0) {
          c.evade.left--;
          shift(c.entityId, c.evade.dir.x * DASH_PX_PER_TICK, c.evade.dir.y * DASH_PX_PER_TICK, facingOf(c.evade.dir));
          continue;
        }
        if (!c.casting) {
          const slot = [0, 1, 2, 3].find((s) => pressed & (1 << s) && c.moves[s]);
          if (slot !== undefined) begin(c, slot, input?.aim, input?.minCastTicks);
        }
        if (input && !(c.casting && c.moves[c.casting.slot]!.rooted)) move(c, input.move);
      }
      for (const c of all) if (c.casting && tick >= c.casting.readyTick && c.hp > 0) execute(c);
      actives = actives.filter((a) => {
        const alive = stepActive(a);
        if (!alive) {
          if (a.kind === "dash") a.caster.dashing = false;
          if (a.entityId !== undefined) world.remove(a.entityId);
        }
        return alive;
      });
      for (const c of all) sync(c);
      inputs.clear();
      return events;
    },
  };
}

export type Combat = ReturnType<typeof createCombat>;
