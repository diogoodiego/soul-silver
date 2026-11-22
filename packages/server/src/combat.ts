import {
  AIMED,
  applyStage,
  BUILDUP_FULL,
  canApply,
  castData,
  castKit,
  computeDamage,
  computeStats,
  CONTACT,
  DODGE_PX,
  DODGE_TICKS,
  effectiveness,
  hitChance,
  overlaps,
  packKit,
  rollCrit,
  rollRandom,
  segmentHits,
  slotIndices,
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
import { BUTTON, tileAt, type EntityData, type HitEvent, type Rng, type WorldLookup } from "@soulsilver/shared/game";
import type { Direction } from "@soulsilver/shared/maps";
import { LEGENDARIES } from "@soulsilver/shared/wild";
import { damageMul, thresholdHeal, type HeldItem } from "@soulsilver/shared/items";
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
  /** Spec 027: the item it holds, resolved from the item data. */
  held?: HeldItem | undefined;
  /** Spec 027: each move's cooldown multiplier (PP Ups), in the order of `moves`; 1 when omitted. Block C: only specials have a cooldown. */
  cooldownMul?: number[] | undefined;
  /** Trainer sprite (a trainer class) shown calling out its moves; none for wild Pokémon. */
  trainerPic?: number | undefined;
  /** The last Pokémon of a Gym Leader, Elite Four or Champion (BOSS_TRAINERS): bossHpMul times the HP and a bar of its own on screen. A wild legendary always is one. */
  boss?: boolean | undefined;
}

/** Trainer classes 0 and 1 are the player characters, Ethan and Lyra. */
export const playerPic = (character: unknown): number => (character === "female" ? 1 : 0);

export interface CombatInput {
  move: Point;
  /** Bits 0–3 are move slots 1–4. */
  buttons: number;
  aim?: Point | undefined;
  /** Block C: the tick on the player's screen when the buttons were pressed; this one when omitted. */
  seen?: number | undefined;
}

/**
 * Block C: a contact move, normal or special, charges aimed at its foe, then leaps `px` at it and goes off as it lands. A confused one gone `astray` keeps the wrong way it began with.
 */
interface Lunge {
  astray: boolean;
  px: number;
  /** How long the leap takes, and once in the air what is left of it, in ticks. */
  ticks: number;
  left?: number;
}

interface Casting {
  slot: number;
  dir: Point;
  startTick: number;
  readyTick: number;
  /** Block C: the first normal of a chain. */
  opener: boolean;
  /** Block C: who pressed the parry while it was cast; it only counts if the move then touches them. */
  parriedBy: Set<number>;
  lunge?: Lunge | undefined;
}

/** The tick a move being cast goes off: with a leap still to come, as it lands. */
export const goesOffAt = ({ readyTick, lunge }: Casting): number => readyTick + (lunge && lunge.left === undefined ? Math.max(0, lunge.ticks - 1) : 0);

export interface Combatant {
  entityId: number;
  owner: Owner;
  /** The trainer battle it fights in (spec 022); moves only reach combatants with the same value. */
  battle: number | undefined;
  species: number;
  level: number;
  types: number[];
  /** Block C: slots 0–1 hold normal moves, 2–3 special ones; a slot with no move of its class is empty. */
  moves: (CombatMove | undefined)[];
  stats: Stats;
  hp: number;
  stages: Record<StageKey, number>;
  statuses: Map<StatusId, StatusState>;
  /** How full each status's bar is, up to BUILDUP_FULL. */
  buildup: Map<StatusId, number>;
  /** Block C: the tick each slot can be used again (a normal waits only after missing the first of a chain), and how long its last cooldown was. */
  readyAt: number[];
  cooldownLen: number[];
  /** Block C: the next normal of the chain (0–2) and the tick the last one began. */
  chain: { step: number; at: number };
  /** Block C: normal hits in a row (each one within the window of the last) and the tick of the last. */
  combo: { count: number; at: number };
  /** Block C: tick of the last parry press, the one the player saw, the end of its pose, whether the guard button is still held, and its cooldown. */
  guard: { at: number; from: number; until: number; held: boolean; readyAt: number };
  /** Block C: a dodge or a parry makes it untouchable, from the tick the player saw until this one. */
  invulnFrom: number;
  invulnUntil: number;
  /** Block C: dodging (the afterimages) until this tick. */
  dodgeUntil: number;
  /** Block C: parried: it does nothing until this tick, or until it is hit. */
  stunUntil: number;
  /** Block C: tick it was last parried, for the clients' mark. */
  parriedAt: number;
  casting: Casting | undefined;
  /** Last move used (executed), so clients can play its animation even when it hits nothing. `bonus` is the combo multiplier it left with, `parriedBy` who parries it on contact. */
  used: { count: number; move: number; dir: Point; arc?: { radiusPx: number; angleDeg: number } | undefined; bonus: number; parriedBy: Set<number> };
  dashing: boolean;
  /** Space dodge: direction, ticks left and the tick it can be used again. */
  evade: { dir: Point; left: number; readyAt: number };
  flashUntil: number;
  /** Buttons held on the previous tick: a move starts on the press. */
  buttons: number;
  /** Spec 027: the held item, until a consumable one acts. */
  held: HeldItem | undefined;
  /** Each slot's cooldown multiplier (PP Ups). */
  cooldownMul: number[];
  trainerPic: number | undefined;
  boss: boolean;
  /** Tick of the next Leftovers heal. */
  regenAt: number;
}

/**
 * Block C: one use of a move: the combo multiplier it left with, the slot of a chain's first normal and, for the combo,
 * whether it landed, once nothing of it is `open`.
 */
interface Use {
  c: Combatant;
  move: CombatMove;
  opener: number | undefined;
  bonus: number;
  landed: boolean;
  open: number;
}

/** Block C: a contact on a player's Pokémon, kept until the presses its player made before it can have arrived. */
interface Contact {
  use: Use;
  t: Combatant;
  from: Point;
  dir: Point;
  parriedBy: Set<number>;
  at: number;
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
  use: Use;
  /** Block C: who parries it on contact. */
  parriedBy: Set<number>;
}

export interface CombatOptions {
  data: CombatData;
  rng: Rng;
  lookup: WorldLookup;
  /** Aquatic, flying and levitating species cross water (spec 025, FR-007); nobody when omitted. */
  crossesWater?(species: number): boolean;
  /** Spec 027: seconds between two Leftovers heals (content/items/tuning.json); 1 when omitted. */
  regenS?: number | undefined;
}

const SOLID = new Set(["blocked", "water", "ledge"]);
const TICKS_PER_S = 20;
const FIRE = 10;
const WATER = 11;
const AUTO_AIM_MIN_PX = 64;
const DASH_BIT = BUTTON.dash;
/** Block C: tap to parry, hold to guard. */
const GUARD_BIT = BUTTON.guard;
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
  let contacts: Contact[] = [];
  /** Normal moves that left lately: a press may still arrive that parries them. */
  let launched: { c: Combatant; start: number; at: number; parriedBy: Set<number> }[] = [];
  let weather: { kind: Weather; until: number } | undefined;
  let world: World;
  let tick = 0;
  let events: HitEvent[] = [];

  const statusDef = (id: StatusId) => data.statuses.get(id)!;
  const activeDefs = (c: Combatant) => [...c.statuses.keys()].map(statusDef);
  const immobile = (c: Combatant) => activeDefs(c).some((d) => d.immobile);
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
    const held = c.held?.effect.trigger === "speed-mul" ? c.held.effect.mul : 1;
    return Math.floor(c.stats.speed * stageMultiplier(c.stages.speed) * activeDefs(c).reduce((mul, d) => mul * (d.speedMul ?? 1), 1) * held);
  }
  const movePx = (c: Combatant) => speedScale(tuning.speed, speedOf(c)).movePx / TICKS_PER_S;
  const action = tuning.action;
  /** Block C: how far back a press is judged, in ticks. */
  const lagTicks = toTicks(action.lagMaxS);
  /** Block C: ticks of the dodge and parry cooldowns at the combatant's current Speed. */
  const reflexTicks = (c: Combatant) => toTicks(speedScale(tuning.speed, speedOf(c)).reflexS);
  /** In the parry's pose, or guarding past it: standing still. */
  const parrying = (c: Combatant) => tick < c.guard.until;
  const guarding = (c: Combatant) => c.guard.held && !parrying(c);
  const stunned = (c: Combatant) => tick < c.stunUntil;
  const invulnerable = (c: Combatant) => tick < c.invulnUntil;
  /** Combo bonus of the next move: its hits in a row, while the last one is recent. */
  const comboNow = (c: Combatant) => (tick - c.combo.at <= toTicks(action.combo.windowS) ? c.combo.count : 0);
  const comboMul = (c: Combatant) => 1 + comboNow(c) * action.combo.stepMul;
  const regenTicks = toTicks(options.regenS ?? 1);

  /** A held item acted: shown on screen; a consumable one is gone. */
  function useHeld(c: Combatant, amount = 0): void {
    const item = c.held!.item;
    if (c.held!.consumable) c.held = undefined;
    emit({ kind: "held", attacker: c.entityId, target: c.entityId, move: 0, amount, item });
  }
  function restoreHp(c: Combatant, amount: number): number {
    const done = Math.max(0, Math.min(c.stats.hp - c.hp, amount));
    c.hp += done;
    return done;
  }

  function emit(e: Omit<HitEvent, "effectiveness" | "crit" | "push" | "amount"> & Partial<HitEvent>): void {
    events.push({ amount: 0, effectiveness: 1, crit: false, push: { x: 0, y: 0 }, ...e });
  }

  /** Moves the entity by (dx, dy), axis by axis, stopping at solid tiles. */
  function shift(entityId: number, dx: number, dy: number, facing?: Direction): void {
    const e = world.get(entityId)!;
    const c = combatants.get(entityId);
    const wet = c !== undefined && (options.crossesWater?.(c.species) ?? false);
    const solid = (category = "") => SOLID.has(category) && !(wet && category === "water");
    let { x, y } = e;
    if (!solid(tileAt(lookup, e.area, e.level, x + dx, y)?.category)) x += dx;
    if (!solid(tileAt(lookup, e.area, e.level, x, y + dy)?.category)) y += dy;
    world.update({ ...e, x, y, facing: facing ?? e.facing });
  }

  function hurt(t: Combatant, amount: number): void {
    const e = t.held?.effect;
    // Focus Sash at full HP, Focus Band by its chance: a blow that would faint leaves 1 HP.
    if (e?.trigger === "survive" && amount >= t.hp && t.hp > 0 && (e.fullHpOnly ? t.hp === t.stats.hp : roll(t.held!.parameter))) {
      amount = t.hp - 1;
      useHeld(t);
    }
    t.hp = Math.max(0, t.hp - amount);
    t.flashUntil = tick + toTicks(tuning.flashS);
    if (t.hp === 0) t.casting = undefined;
    const heal = t.held ? thresholdHeal(t.held, t.hp, t.stats.hp) : 0;
    if (heal > 0) useHeld(t, restoreHp(t, heal));
  }

  function inflict(t: Combatant, id: StatusId): boolean {
    const def = statusDef(id);
    if (!canApply(def, t.types, t.statuses.has(id))) return false;
    t.statuses.set(id, startStatus(def, tick, rng));
    t.buildup.delete(id);
    if (def.immobile) t.casting = undefined;
    const e = t.held?.effect;
    if (e?.trigger === "cure" && e.statuses.includes(id)) {
      t.statuses.delete(id);
      useHeld(t);
    }
    return true;
  }

  /** A hit fills the bar of a status; true when it got full and the status set in. While active, or on an immune type, the bar does not fill. */
  function buildUp(t: Combatant, id: StatusId, amount: number): boolean {
    if (!canApply(statusDef(id), t.types, t.statuses.has(id))) return false;
    const filled = (t.buildup.get(id) ?? 0) + amount;
    if (filled >= BUILDUP_FULL) return inflict(t, id);
    t.buildup.set(id, filled);
    return false;
  }

  function weatherMul(type: number): number {
    if (!weather || tick >= weather.until) return 1;
    if (weather.kind === "sun") return type === FIRE ? 1.5 : type === WATER ? 0.5 : 1;
    if (weather.kind === "rain") return type === WATER ? 1.5 : type === FIRE ? 0.5 : 1;
    return 1;
  }

  function damageOf(c: Combatant, t: Combatant, move: CombatMove, e: Extract<Effect, { kind: "damage" }>, eff = 1): { amount: number; crit: boolean } {
    if (e.fixed) return { amount: e.fixed, crit: false };
    if (e.level) return { amount: c.level, crit: false };
    if (e.targetHpFraction) return { amount: Math.max(1, Math.floor(t.hp * e.targetHpFraction)), crit: false };
    const physical = move.category === "physical";
    const row = data.typeChart.find((r) => r.id === move.type);
    const critHeld = c.held?.effect.trigger === "crit" ? c.held.effect.stages : 0;
    const crit = rollCrit(rng, move.critStage + c.stages.crit + critHeld, tuning.critChances);
    const amount = computeDamage({
      level: c.level,
      power: move.power,
      attack: physical ? c.stats.attack : c.stats.specialAttack,
      defense: physical ? t.stats.defense : t.stats.specialDefense,
      attackStage: physical ? c.stages.attack : c.stages.specialAttack,
      defenseStage: physical ? t.stages.defense : t.stages.specialDefense,
      stab: c.types.includes(move.type),
      typeMultipliers: [...new Set(t.types)].map((type) => (row?.against[type] ?? 10) / 10),
      burned: physical && activeDefs(c).some((d) => d.attackMul !== undefined),
      weather: weatherMul(move.type),
      crit,
      random: rollRandom(rng),
    });
    const mul = damageMul(c.held, move.type, move.category, eff);
    return { amount: mul === 1 ? amount : Math.max(1, Math.floor(amount * mul)), crit };
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

  function untouchable(c: Combatant, from: number, until: number): void {
    c.invulnFrom = invulnerable(c) ? Math.min(c.invulnFrom, from) : from;
    c.invulnUntil = Math.max(c.invulnUntil, until);
  }

  /** Block C: `t` parried a normal move of `c`: nothing lands, `c` is stunned, knocked back from `t`, and `t` untouchable for a moment. */
  function parried(c: Combatant, t: Combatant, move: CombatMove, dir: Point, at: number): void {
    c.stunUntil = tick + toTicks(action.stunS);
    c.parriedAt = tick;
    c.casting = undefined;
    c.combo.count = 0;
    untouchable(t, at, tick + toTicks(action.parryInvulnS));
    const v = push(c, pos(t), { x: -dir.x, y: -dir.y }, action.parryPushPx);
    emit({ kind: "parried", attacker: c.entityId, target: t.entityId, move: move.id, push: v });
  }

  /**
   * Everything a move does to one target it reached; true when it landed (not evaded, parried, missed or
   * immune). Block C: `bonus` is the combo multiplier the move left with, `parriedBy` who parried it while it was cast,
   * `at` the tick it touched.
   */
  function hit(c: Combatant, t: Combatant, move: CombatMove, from: Point, dir: Point, bonus: number, parriedBy: Set<number>, at: number): boolean {
    if (t.hp === 0 || pos(t).data["cutscene"] === true) return false;
    if (at >= t.invulnFrom && at < t.invulnUntil) {
      emit({ kind: "evaded", attacker: c.entityId, target: t.entityId, move: move.id });
      return false;
    }
    // One contact: a lingering field does not parry itself again.
    if (parriedBy.delete(t.entityId)) {
      parried(c, t, move, dir, at);
      return false;
    }
    if (move.accuracy !== null && rng.nextInt(100) >= hitChance(move.accuracy, c.stages.accuracy - t.stages.evasion)) {
      emit({ kind: "missed", attacker: c.entityId, target: t.entityId, move: move.id });
      return false;
    }
    const eff = effectiveness(data.typeChart, move.type, t.types);
    const damage = move.effects.find((e) => e.kind === "damage");
    if (damage && eff === 0) {
      emit({ kind: "immune", attacker: c.entityId, target: t.entityId, move: move.id, effectiveness: 0 });
      return false;
    }
    // A blow ends the stun of a parried Pokémon, and that blow lands harder.
    const wasStunned = stunned(t);
    t.stunUntil = 0;
    if (damage) {
      const scale = bonus * (move.special ? 1 : action.normalDamageMul) * (wasStunned ? 1 + action.stunBonusMul : 1) * (!move.special && t.guard.held && t.guard.from <= at ? 1 - action.guardReduction : 1);
      let dealt = 0;
      for (let h = 0; h < move.hits && t.hp > 0; h++) {
        const raw = damageOf(c, t, move, damage, eff);
        const { crit } = raw;
        const amount = scale === 1 ? raw.amount : Math.max(1, Math.floor(raw.amount * scale));
        const done = Math.min(amount, t.hp);
        hurt(t, amount);
        dealt += done;
        const v = push(t, from, dir, tuning.knockbackPx);
        emit({ kind: "hit", attacker: c.entityId, target: t.entityId, move: move.id, amount: done, effectiveness: eff, crit, push: v });
      }
      // Being hurt ends its own combo.
      if (dealt > 0) t.combo.count = 0;
      if (move.type === FIRE && t.statuses.has("freeze")) t.statuses.delete("freeze");
      // Life Orb: a share of max HP for every hit that dealt damage.
      const orb = c.held?.effect;
      if (orb?.trigger === "damage-mul" && orb.recoil && dealt > 0) hurt(c, Math.max(1, Math.floor(c.stats.hp * orb.recoil)));
      for (const e of move.effects) {
        if (e.kind === "recoil" && dealt > 0) {
          const amount = Math.max(1, Math.floor(dealt * e.fraction));
          hurt(c, amount);
          emit({ kind: "hit", attacker: c.entityId, target: c.entityId, move: move.id, amount });
        } else if (e.kind === "drain" && dealt > 0 && c.hp > 0) {
          const amount = Math.min(c.stats.hp - c.hp, Math.max(1, Math.floor(dealt * e.fraction)));
          c.hp += amount;
          emit({ kind: "heal", attacker: c.entityId, target: c.entityId, move: move.id, amount });
        }
      }
    }
    for (const e of move.effects) {
      if (t.hp === 0) return true;
      const chance = "chance" in e ? (e.chance ?? move.defaultChance) : 100;
      if (e.kind === "status" && buildUp(t, e.status, e.chance ?? move.defaultChance)) {
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
    return true;
  }

  /** Block C: a move reached `t`: it lands, at once or, on a player's Pokémon, when no press made before it can still arrive. */
  function touch(use: Use, t: Combatant, from: Point, dir: Point, parriedBy: Set<number>): void {
    if (lagTicks > 1 && typeof t.owner === "number") {
      use.open++;
      contacts.push({ use, t, from: { x: from.x, y: from.y }, dir, parriedBy, at: tick });
    } else if (hit(use.c, t, use.move, from, dir, use.bonus, parriedBy, tick)) use.landed = true;
  }
  function landContacts(): void {
    const due = contacts.filter((k) => tick >= k.at + lagTicks - 1);
    contacts = contacts.filter((k) => tick < k.at + lagTicks - 1);
    for (const { use, t, from, dir, parriedBy, at } of due) {
      if (use.c.battle === t.battle && hit(use.c, t, use.move, from, dir, use.bonus, parriedBy, at)) use.landed = true;
      close(use);
    }
  }
  /** One part of a use is over; with the last, the combo counts it. */
  function close(use: Use): void {
    if (--use.open === 0) settle(use);
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

  function spawnShot(use: Use, kind: Active["kind"], at: Point, dir: Point, until: number): void {
    const { c, move } = use;
    const self = pos(c);
    const entityId = kind === "dash" ? undefined : world.add({ kind: "projectile", area: self.area, x: at.x, y: at.y, level: self.level, facing: facingOf(dir), data: { move: move.id, caster: c.entityId, field: kind === "field" } }).id;
    actives.push({ kind, caster: c, move, entityId, x: at.x, y: at.y, dir, travelled: 0, until, hits: new Map(), use, parriedBy: c.used.parriedBy });
    if (kind === "dash") c.dashing = true;
  }

  /**
   * Block C: the combo after a normal move: one more when it reached someone, none when it reached nobody. Missing the
   * first of a chain ends the chain, and that move waits.
   */
  function settle({ c, move, opener, landed }: Use): void {
    if (move.special) return;
    c.combo = { count: landed ? Math.min(action.combo.max, comboNow(c) + 1) : 0, at: tick };
    if (landed || opener === undefined) return;
    c.cooldownLen[opener] = toTicks(action.normalMissCooldownS);
    c.readyAt[opener] = tick + c.cooldownLen[opener];
    c.chain.step = 0;
  }

  /** Block C: a special's cooldown, shortened by PP Ups and, once, by a Leppa Berry. */
  const msOf = (ticks: number) => (ticks * 1000) / TICKS_PER_S;

  function startCooldown(c: Combatant, slot: number, move: CombatMove): void {
    let ticks = Math.round(move.cooldownTicks * (c.cooldownMul[slot] ?? 1));
    const leppa = c.held?.effect;
    if (leppa?.trigger === "cooldown-restore") {
      ticks = Math.max(0, ticks - toTicks(leppa.seconds));
      useHeld(c);
    }
    c.readyAt[slot] = tick + ticks;
    c.cooldownLen[slot] = ticks;
  }

  /**
   * Block C: what the clients show over a CPU Pokémon: the class of the move it casts (none on self-buffs; a normal
   * one can be parried all along), and for a moment that it was parried.
   */
  function castMark(c: Combatant): EntityData {
    if (typeof c.owner !== "string") return {};
    const move = c.casting && c.moves[c.casting.slot]!;
    if (move && move.behavior !== "self-buff") return { castMark: move.special ? "special" : "normal" };
    return tick - c.parriedAt < toTicks(action.parryMarkS) ? { castMark: "parried" } : {};
  }

  /**
   * Block C: each normal move being cast, or that left lately, remembers who pressed the parry: from its first tick
   * until it leaves, either when the press arrives or on the screen of whoever pressed it.
   */
  function recordParries(all: Combatant[]): void {
    launched = launched.filter((l) => tick - l.at <= lagTicks);
    const pressed = all.filter((t) => t.guard.at === tick);
    if (pressed.length === 0) return;
    const record = (c: Combatant, start: number, until: number, parriedBy: Set<number>) => {
      const mine = foes(c);
      for (const t of pressed) if ((tick < until || (t.guard.from >= start && t.guard.from < until)) && mine.includes(t)) parriedBy.add(t.entityId);
    };
    for (const c of all) if (c.casting && !c.moves[c.casting.slot]!.special) record(c, c.casting.startTick, c.casting.readyTick, c.casting.parriedBy);
    for (const l of launched) record(l.c, l.start, l.at, l.parriedBy);
  }

  function execute(c: Combatant): void {
    const { slot, dir, parriedBy, startTick, opener } = c.casting!;
    c.casting = undefined;
    const move = c.moves[slot]!;
    if (!move.special && lagTicks > 0) launched.push({ c, start: startTick, at: tick, parriedBy });
    // The combo bonus goes with the move; a special spends it.
    const bonus = comboMul(c);
    if (move.special) {
      startCooldown(c, slot, move);
      c.combo.count = 0;
    }
    const arc = move.behavior === "melee" && move.hitbox?.shape === "arc" ? move.hitbox : undefined;
    c.used = { count: c.used.count + 1, move: move.id, dir, arc, bonus, parriedBy };
    const use: Use = { c, move, bonus, opener: opener ? slot : undefined, landed: false, open: 1 };
    selfEffects(c, move);
    const me = pos(c);
    const at = { x: me.x + dir.x * move.rangePx, y: me.y + dir.y * move.rangePx };
    switch (move.behavior) {
      case "self-buff":
        return;
      case "projectile":
        spawnShot(use, "projectile", { x: me.x, y: me.y }, dir, Infinity);
        return;
      case "dash":
        spawnShot(use, "dash", { x: me.x, y: me.y }, dir, Infinity);
        return;
      case "field":
        spawnShot(use, "field", at, dir, tick + move.durationTicks);
        return;
      default: {
        // Instant shapes: from the user, or at the aimed point for target-area.
        const origin = move.behavior === "target-area" ? at : me;
        for (const t of foes(c)) if (overlaps(move.hitbox!, origin, dir, body(t))) touch(use, t, me, dir, parriedBy);
        close(use);
      }
    }
  }

  /** The next normal's place in its chain. */
  const chainStep = (c: Combatant) => (c.chain.step >= action.normalCastS.length || tick - c.chain.at > toTicks(action.combo.windowS) ? 0 : c.chain.step);

  /** Block C: cast ticks of a normal move: the chain's step (0.4, 0.2, 0.2 s), from the start again after the third or a pause. */
  function normalCast(c: Combatant): number {
    c.chain.step = chainStep(c);
    // Quick Claw, by its chance: the first of a chain comes out as fast as the next ones.
    const quick = c.chain.step === 0 && c.held?.effect.trigger === "quick" && roll(c.held.parameter);
    const s = action.normalCastS[quick ? 1 : c.chain.step]!;
    c.chain = { step: c.chain.step + 1, at: tick };
    return toTicks(s);
  }

  function begin(c: Combatant, slot: number, aim: Point | undefined): void {
    const m = c.moves[slot]!;
    if (tick < (c.readyAt[slot] ?? 0)) return;
    const self = pos(c);
    const len = aim ? Math.hypot(aim.x, aim.y) : 0;
    let dir = len > 0.01 ? { x: aim!.x / len, y: aim!.y / len } : VECTORS[self.facing];
    // No aim (every player) or a leap: the nearest foe anywhere on the map; an aim (the AI) is only corrected in reach.
    const contact = CONTACT.has(m.behavior);
    const reach = aim && !contact ? Math.max(m.rangePx, AUTO_AIM_MIN_PX) : Infinity;
    const target = AIMED.has(m.behavior) ? nearestFoe(c, reach) : undefined;
    if (target) {
      const d = Math.hypot(target.x - self.x, target.y - self.y);
      if (d > 0.01) dir = { x: (target.x - self.x) / d, y: (target.y - self.y) / d };
    }
    const confusion = c.statuses.has("confusion") ? statusDef("confusion") : undefined;
    const astray = confusion !== undefined && roll(confusion.misdirect ?? 0);
    if (astray) dir = rotate(dir, (rng.nextFloat() * 2 - 1) * (confusion.deviationDeg ?? 0));
    const skip = Math.max(0, ...activeDefs(c).map((d) => d.skipMove ?? 0));
    if (skip && rng.nextInt(100) < skip) {
      if (m.special) startCooldown(c, slot, m);
      emit({ kind: "failed", attacker: c.entityId, target: c.entityId, move: m.id });
      return;
    }
    world.update({ ...self, facing: facingOf(dir) });
    const castTicks = m.special ? m.castTicks : normalCast(c);
    c.casting = { slot, dir, startTick: tick, readyTick: tick + castTicks, opener: !m.special && c.chain.step === 1, parriedBy: new Set(), lunge: contact ? { astray, px: 0, ticks: 0 } : undefined };
    if (castTicks === 0 && !contact) execute(c);
  }

  /** Block C: the guard button pressed: a player's cast is a feint (dropped, no cooldown), unless it already leapt; then the parry's pose, which recordParries takes to the moves being cast. */
  function guard(c: Combatant, seen: number): void {
    if (c.casting) {
      if (typeof c.owner !== "number" || c.casting.lunge?.left !== undefined) return;
      c.casting = undefined;
    }
    if (tick < c.guard.readyAt || c.evade.left > 0) return;
    c.guard = { at: tick, from: seen, until: tick + toTicks(action.parryPoseS), held: true, readyAt: c.guard.readyAt };
  }

  /** One tick of a contact move: the aim while it charges, then the leap, up to touching the foe (with none, the way it aims). */
  function lungeStep(c: Combatant): void {
    const k = c.casting!;
    const l = k.lunge!;
    if (l.left === undefined) {
      const me = pos(c);
      const foe = nearestFoe(c, Infinity);
      const gap = foe ? Math.hypot(foe.x - me.x, foe.y - me.y) : Infinity;
      if (foe && gap > 0.01 && !l.astray) {
        k.dir = { x: (foe.x - me.x) / gap, y: (foe.y - me.y) / gap };
        world.update({ ...me, facing: facingOf(k.dir) });
      }
      l.px = Math.max(0, Math.min(action.leapMaxPx, gap - 2 * tuning.bodyRadiusPx));
      l.ticks = Math.ceil((l.px * TICKS_PER_S) / action.leapSpeedPx);
      if (tick < k.readyTick) return;
      // It goes off the tick it lands; until then it can be parried.
      k.readyTick = goesOffAt(k);
      l.left = l.ticks;
    }
    if (l.left === 0) return;
    l.left--;
    const px = l.px / l.ticks;
    shift(c.entityId, k.dir.x * px, k.dir.y * px);
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
          touch(a.use, t, a, a.dir, a.parriedBy);
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
    // Block C: it goes through a dodging Pokémon.
    const target = foes(c).find((t) => !invulnerable(t) && segmentHits(from, to, radius, body(t)));
    if (target) {
      touch(a.use, target, to, a.dir, a.parriedBy);
      return false;
    }
    if (a.entityId !== undefined) world.update({ ...world.get(a.entityId)!, x: a.x, y: a.y });
    return a.travelled < a.move.rangePx;
  }

  function sync(c: Combatant): void {
    const e = world.get(c.entityId);
    if (!e) return;
    const lunge = c.casting?.lunge;
    const leaping = lunge?.left !== undefined;
    const data: EntityData = {
      species: c.species,
      level: c.level,
      hp: c.hp,
      hpMax: c.stats.hp,
      owner: String(c.owner),
      status: [...c.statuses.keys()].join(","),
      casting: c.casting ? c.casting.slot + 1 : 0,
      used: c.used.count,
      usedMove: c.used.move,
      usedDx: Math.round(c.used.dir.x * 100),
      usedDy: Math.round(c.used.dir.y * 100),
      // Melee arcs: the client draws the reach the hit used.
      ...(c.used.arc ? { usedReach: c.used.arc.radiusPx, usedArc: c.used.arc.angleDeg } : {}),
      flash: tick < c.flashUntil,
      // Block C: what the clients draw (afterimages, the white glow, the stun) and the HUD's cooldowns, in ms.
      ...(tick < c.dodgeUntil ? { dodge: true } : {}),
      ...(parrying(c) ? { parry: true } : guarding(c) ? { guard: true } : {}),
      ...(stunned(c) ? { stun: true } : {}),
      ...castMark(c),
      // In the air: the share of the leap done.
      ...(lunge?.left !== undefined ? { leap: Math.round((1 - lunge.left / lunge.ticks) * 100) / 100 } : {}),
      // For the prediction of whoever drives it: the rest of a leap, or the ticks until it starts, and the rest of a dodge.
      ...(lunge?.left !== undefined ? { leapLeft: lunge.left, leapDx: (c.casting!.dir.x * lunge.px) / lunge.ticks, leapDy: (c.casting!.dir.y * lunge.px) / lunge.ticks } : lunge ? { lungeIn: c.casting!.readyTick - tick } : {}),
      ...(c.evade.left > 0 ? { evade: c.evade.left, evDx: Math.round(c.evade.dir.x * 100), evDy: Math.round(c.evade.dir.y * 100) } : {}),
      ...(comboNow(c) > 0 ? { combo: comboNow(c) } : {}),
      reflexMs: msOf(reflexTicks(c)),
      cdDodge: msOf(Math.max(0, c.evade.readyAt - tick)),
      cdGuard: msOf(c.guard.held ? 0 : Math.max(0, c.guard.readyAt - tick)),
      ...(c.boss ? { boss: true } : {}),
      ...(c.trainerPic !== undefined ? { trainerPic: c.trainerPic } : {}),
      // Shiny wild Pokémon (spec 015) keep their palette.
      ...(e.data["shiny"] === true ? { shiny: true } : {}),
      // Out of reach during its trainer's cutscene (spec 021); the session sets and clears it.
      ...(e.data["cutscene"] === true ? { cutscene: true } : {}),
    };
    c.moves.forEach((m, i) => {
      if (!m) return;
      data[`move${i + 1}`] = m.id;
      if (typeof c.owner === "number") data[`kit${i + 1}`] = packKit(castKit(m, msOf(m.special ? m.castTicks : toTicks(action.normalCastS[chainStep(c)]!))));
      if (m.special || c.readyAt[i]! > tick) Object.assign(data, { [`cd${i + 1}`]: msOf(Math.max(0, (c.readyAt[i] ?? 0) - tick)), [`cdFull${i + 1}`]: msOf(c.cooldownLen[i] ?? m.cooldownTicks) });
    });
    if (c.casting && !leaping) {
      // Block H: the area the cast will cover, its length and its type's colour, for the clients' charge (a contact move's, from where it would land).
      const move = c.moves[c.casting.slot]!;
      Object.assign(data, castData(castKit(move, msOf(c.casting.readyTick - c.casting.startTick)), c.casting.dir, lunge?.px ?? 0));
    }
    for (const [id, filled] of c.buildup) data[`bld_${id}`] = filled;
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
      const known = spec.moves.map((id) => {
        const m = data.move(id);
        if (!m) throw new Error(`Golpe ${id} não existe na extração`);
        return m;
      });
      // Block C: normals in slots 0–1, specials in 2–3; PP Ups follow their move.
      const { slots } = slotIndices(known, (m) => m.special);
      const moves = slots.map((i) => (i === undefined ? undefined : known[i]));
      const cooldownMul = slots.map((i) => (i === undefined ? 1 : (spec.cooldownMul?.[i] ?? 1)));
      const stats = computeStats(species.baseStats, spec.level, spec.stats);
      const boss = spec.boss ?? (owner === "wild" && LEGENDARIES.has(spec.species));
      if (boss) stats.hp = Math.floor(stats.hp * tuning.bossHpMul);
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
        statuses: new Map(),
        buildup: new Map(),
        readyAt: [0, 0, 0, 0],
        cooldownLen: [0, 0, 0, 0],
        chain: { step: 0, at: 0 },
        combo: { count: 0, at: 0 },
        guard: { at: -1, from: -1, until: 0, held: false, readyAt: 0 },
        invulnFrom: 0,
        invulnUntil: 0,
        dodgeUntil: 0,
        stunUntil: 0,
        parriedAt: -Infinity,
        casting: undefined,
        used: { count: 0, move: 0, dir: { x: 0, y: 0 }, bonus: 1, parriedBy: new Set() },
        dashing: false,
        evade: { dir: { x: 0, y: 0 }, left: 0, readyAt: 0 },
        flashUntil: 0,
        buttons: 0,
        held: spec.held,
        cooldownMul,
        trainerPic: spec.trainerPic,
        boss,
        regenAt: 0,
      };
      combatants.set(entityId, c);
      sync(c);
      return c;
    },
    remove(w: World, entityId: number): void {
      combatants.delete(entityId);
      for (const a of actives) if (a.caster.entityId === entityId && a.entityId !== undefined) w.remove(a.entityId);
      actives = actives.filter((a) => a.caster.entityId !== entityId);
      launched = launched.filter((l) => l.c.entityId !== entityId);
      const gone = contacts.filter((k) => k.t.entityId === entityId);
      contacts = contacts.filter((k) => k.t.entityId !== entityId && k.use.c.entityId !== entityId);
      for (const k of gone) close(k.use);
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
    /** Spec 027, a trainer's item: HP given back (never past the maximum), as a heal event; the amount healed. */
    heal(id: number, amount: number): number {
      const c = get(id);
      if (c.hp === 0) return 0;
      const done = restoreHp(c, amount);
      if (done > 0) emit({ kind: "heal", attacker: c.entityId, target: c.entityId, move: 0, amount: done });
      return done;
    },
    /** Cures these statuses; false when it had none of them. */
    cure(id: number, statuses: readonly StatusId[]): boolean {
      const c = get(id);
      return statuses.filter((s) => c.statuses.delete(s)).length > 0;
    },
    hasStatus(id: number, statuses: readonly StatusId[]): boolean {
      const c = get(id);
      return statuses.some((s) => c.statuses.has(s));
    },
    /** Block C: an Ether ends the cooldown of one special (the longest wait), an Elixir of both; false when none was waiting. */
    restore(id: number, all: boolean): boolean {
      const c = get(id);
      const waiting = [2, 3].filter((s) => c.readyAt[s]! > tick).sort((a, b) => c.readyAt[b]! - c.readyAt[a]!);
      if (waiting.length === 0) return false;
      for (const s of all ? waiting : waiting.slice(0, 1)) c.readyAt[s] = tick;
      return true;
    },
    /** X items and Dire Hit: stat stages up, as a self-buff would; false when none moved. */
    raise(id: number, stages: Partial<Record<StageKey, number>>): boolean {
      const c = get(id);
      let moved = false;
      for (const [k, delta] of Object.entries(stages) as [StageKey, number][]) {
        const { stage, applied } = applyStage(c.stages[k], delta);
        c.stages[k] = k === "crit" ? Math.min(Math.max(stage, 0), 4) : stage;
        if (applied !== 0) {
          moved = true;
          emit({ kind: "stages", attacker: c.entityId, target: c.entityId, move: 0, status: k });
        }
      }
      return moved;
    },
    /** Pixels per tick for the combatant's current Speed. */
    movePx: (id: number) => movePx(get(id)),
    /** Block C: ticks of the dodge and parry cooldowns at its current Speed. */
    reflexTicks: (id: number) => reflexTicks(get(id)),
    /** One tick: statuses, inputs and movement, casts, moves in flight; returns what happened. */
    step(now: number, w: World): HitEvent[] {
      world = w;
      tick = now;
      events = [];
      const all = [...combatants.values()];
      for (const c of all) {
        if (c.hp === 0) continue;
        for (const state of [...c.statuses.values()]) {
          if (c.hp === 0) break;
          const { damage, ended } = tickStatus(statusDef(state.id), state, tick, c.stats.hp, rng);
          if (damage > 0) {
            hurt(c, damage);
            emit({ kind: "tick", attacker: c.entityId, target: c.entityId, move: 0, amount: damage, status: state.id });
          }
          if (ended) c.statuses.delete(state.id);
        }
        if (c.held?.effect.trigger === "regen" && c.hp > 0 && tick >= c.regenAt) {
          if (c.regenAt > 0 && c.hp < c.stats.hp) useHeld(c, restoreHp(c, Math.max(1, Math.floor(c.stats.hp * c.held.effect.fraction))));
          c.regenAt = tick + regenTicks;
        }
      }
      for (const c of all) {
        const input = inputs.get(c.entityId);
        const held = input?.buttons ?? 0;
        const pressed = held & ~c.buttons;
        const seen = Math.max(tick - lagTicks, Math.min(tick, input?.seen ?? tick));
        c.buttons = held;
        // Block C: letting go of the guard starts its cooldown, once the parry's pose is over.
        if (c.guard.held && !(held & GUARD_BIT)) {
          c.guard.held = false;
          c.guard.readyAt = Math.max(tick, c.guard.until) + reflexTicks(c);
        }
        if (c.hp === 0 || immobile(c) || c.dashing) continue;
        // Parried: nothing at all until the stun ends or a blow lands.
        if (stunned(c)) {
          c.casting = undefined;
          continue;
        }
        if (pressed & GUARD_BIT) guard(c, seen);
        // Parrying or guarding, it stands still and does nothing else.
        if (parrying(c) || guarding(c)) continue;
        if (pressed & DASH_BIT && !c.casting && c.evade.left === 0 && tick >= c.evade.readyAt) {
          const m = input?.move ?? { x: 0, y: 0 };
          const len = Math.hypot(m.x, m.y);
          const dir = len > 0.1 ? { x: m.x / len, y: m.y / len } : VECTORS[pos(c).facing];
          const invuln = toTicks(action.dodgeInvulnS);
          c.evade = { dir, left: DODGE_TICKS, readyAt: tick + invuln + reflexTicks(c) };
          untouchable(c, seen, tick + invuln);
          c.dodgeUntil = tick + invuln;
        }
        if (c.evade.left > 0) {
          c.evade.left--;
          shift(c.entityId, c.evade.dir.x * DODGE_PX, c.evade.dir.y * DODGE_PX, facingOf(c.evade.dir));
          continue;
        }
        if (!c.casting) {
          const slot = [0, 1, 2, 3].find((s) => pressed & (1 << s) && c.moves[s]);
          if (slot !== undefined) begin(c, slot, input?.aim);
        }
        // Block H: no move roots its user while it charges; the area keeps the aim it began with, but a contact one's (block C).
        if (c.casting?.lunge) lungeStep(c);
        if (input && c.casting?.lunge?.left === undefined) move(c, input.move);
      }
      recordParries(all);
      landContacts();
      for (const c of all) if (c.casting && tick >= c.casting.readyTick && c.hp > 0) execute(c);
      actives = actives.filter((a) => {
        const alive = stepActive(a);
        if (!alive) {
          if (a.kind === "dash") a.caster.dashing = false;
          close(a.use);
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
