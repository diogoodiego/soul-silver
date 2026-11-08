import {
  blocksSight,
  createController,
  enrage,
  lineOfSight,
  newThreat,
  profileFor,
  reachPx,
  stepController,
  type AiEnv,
  type AiHooks,
  type AiTick,
  type SkillProfile,
  type Controller,
  type Decision,
  type MoveView,
  type NoiseEvent,
  type OpponentView,
  type SelfView,
  type StepResult,
} from "@soulsilver/shared/ai";
import { effectiveness, toTicks, type Point } from "@soulsilver/shared/combat";
import { insideMap, MOVE_SPEED_PX, tileAt, type AiDebugRow, type Entity, type HitEvent, type Rng, type WorldLookup } from "@soulsilver/shared/game";
import { MAP_TILE_PX } from "@soulsilver/shared/maps";
import type { Temperament } from "@soulsilver/shared/wild";
import type { AiData } from "./ai-loader";
import type { Combat, Combatant } from "./combat";
import type { CombatData, CombatMove } from "./combat-loader";
import type { World } from "./world";

// Runs the combat AI controllers (spec 019) against the live combat: builds what each one may know,
// staggers and sleeps them, and hands their input to combat like a player's.

export interface AiOptions {
  data: AiData;
  combat: Combat;
  combatData: CombatData;
  world: World;
  lookup: WorldLookup;
  rng: Rng;
  /** Every decision, for the session log (FR-034). */
  onDecision?: ((d: Decision) => void) | undefined;
  /** Spec 027: wild Pokémon below this level keep away from this body (a Repel); 0 or omitted for none. */
  repel?: ((body: Entity) => number) | undefined;
}

/** Bodies an AI may fight: those of its own trainer battle with another owner, or, outside one, anyone outside one (spec 022). */
function fights(me: Combatant, body: Entity, combat: Combat, repel = 0): boolean {
  // Spec 027: a Repel keeps wild Pokémon of a lower level than the player's companion away.
  if (me.owner === "wild" && me.level < repel) return false;
  const other = combat.get(body.id);
  if (me.battle === undefined) return other?.battle === undefined;
  return other !== undefined && other.battle === me.battle && other.owner !== me.owner;
}

const WALKABLE = new Set(["free", "tallGrass"]);
const NOISE_EPS = 0.5;

/** A trainer, or a Pokémon some player owns; never one in a cutscene (spec 021): the AI forgets its threat. */
const isOpponentBody = (e: Entity) => e.data["cutscene"] !== true && (e.kind === "player" || (e.kind === "pokemon" && typeof e.data["owner"] === "string" && e.data["owner"] !== "wild"));

export function createAi(options: AiOptions) {
  const { data, combat, combatData, world, lookup, rng } = options;
  const { tuning } = data;
  const controllers = new Map<number, Controller>();
  const lastPos = new Map<number, Point>();
  const minCastTicks = toTicks(tuning.cast.aiMinCastS);
  const dormantPx = tuning.performance.dormantTiles * MAP_TILE_PX;
  const log: Decision[] = [];
  let tick = 0;
  let frame: { bodies: Entity[]; noises: Map<string, NoiseEvent[]>; hits: HitEvent[] } = { bodies: [], noises: new Map(), hits: [] };

  function moveView(c: Combatant, m: CombatMove): MoveView {
    const has = (kind: string) => m.effects.some((e) => e.kind === kind);
    return {
      id: m.id,
      behavior: m.behavior,
      type: m.type,
      category: m.category,
      power: m.power,
      rangePx: m.rangePx,
      hitbox: m.hitbox,
      speedPx: m.speedPx,
      ready: c.gauge >= 1,
      damages: has("damage"),
      status: has("status"),
      buff: m.effects.some((e) => e.kind === "stages" && e.target === "self" && e.delta > 0),
      debuff: m.effects.some((e) => e.kind === "stages" && e.target === "target" && e.delta < 0),
      heals: has("heal"),
    };
  }

  function opponentView(e: Entity): OpponentView {
    const c = combat.get(e.id);
    if (!c) return { id: e.id, kind: "trainer", x: e.x, y: e.y, types: [], defense: 1, specialDefense: 1, hp: 1, hpMax: 1, hasStatus: false, casting: undefined };
    const cast = c.casting && { dir: c.casting.dir, reachPx: reachPx(moveView(c, c.moves[c.casting.slot]!)), elapsedTicks: tick - c.casting.startTick };
    return { id: e.id, kind: "pokemon", x: e.x, y: e.y, types: c.types, defense: c.stats.defense, specialDefense: c.stats.specialDefense, hp: c.hp, hpMax: c.stats.hp, hasStatus: c.major !== undefined, casting: cast };
  }

  function envFor(e: Entity): AiEnv {
    const map = lookup(e.area);
    return {
      rng,
      sees: (a, b) => lineOfSight((x, y) => blocksSight(tileAt(lookup, e.area, e.level, x, y)), a, b),
      walkable: (p) => map !== undefined && insideMap(map, p.x, p.y) && WALKABLE.has(tileAt(lookup, e.area, e.level, p.x, p.y)?.category ?? ""),
      effectiveness: (type, types) => effectiveness(combatData.typeChart, type, types),
    };
  }

  return {
    get: (id: number) => controllers.get(id),
    decisions: () => log,
    /** `profile` and `hooks` are a trainer's (spec 022); a wild Pokémon's profile comes from its level. */
    add(entityId: number, o: { home: Point; level: number; temperament: Temperament; leashPx: number; facing?: Point; profile?: SkillProfile; hooks?: AiHooks }): Controller {
      const c = createController({
        id: entityId,
        home: o.home,
        leashPx: o.leashPx,
        hooks: o.hooks,
        profile: o.profile ?? profileFor(o.level, data.wildLevels, data.profiles),
        temperament: data.temperaments[o.temperament],
        angry: data.temperaments.aggressive,
        tuning,
        look: o.facing,
      });
      controllers.set(entityId, c);
      return c;
    },
    remove(id: number): void {
      controllers.delete(id);
    },
    /** A ball escape (spec 015): aggressive for angryAfterEscapeS. */
    enrage(id: number): void {
      const c = controllers.get(id);
      if (c) enrage(c, tick + toTicks(tuning.states.angryAfterEscapeS));
    },
    /** Once per tick, after combat: who is around, what they sound like, who got hurt. */
    prepare(now: number, hits: HitEvent[]): void {
      tick = now;
      const bodies = world.all().filter(isOpponentBody);
      const noises = new Map<string, NoiseEvent[]>();
      for (const b of bodies) {
        const prev = lastPos.get(b.id);
        const moved = prev ? Math.hypot(b.x - prev.x, b.y - prev.y) : 0;
        const tiles = combat.get(b.id)?.casting ? tuning.noise.moveTiles : moved > MOVE_SPEED_PX + NOISE_EPS ? tuning.noise.runTiles : moved > NOISE_EPS ? tuning.noise.walkTiles : 0;
        if (tiles > 0) noises.set(b.area, [...(noises.get(b.area) ?? []), { sourceId: b.id, x: b.x, y: b.y, radiusPx: tiles * MAP_TILE_PX }]);
        lastPos.set(b.id, { x: b.x, y: b.y });
      }
      for (const id of lastPos.keys()) if (!bodies.some((b) => b.id === id)) lastPos.delete(id);
      frame = { bodies, noises, hits };
    },
    /** Steps one AI and feeds its input to combat; undefined while dormant. */
    drive(id: number): StepResult | undefined {
      const c = controllers.get(id);
      const e = world.get(id);
      const me = combat.get(id);
      if (!c || !e || !me) return undefined;
      const here = frame.bodies.filter((b) => b.area === e.area);
      // Far from every trainer: no perception, no decision, no movement (FR-031).
      if (!here.some((b) => b.kind === "player" && Math.hypot(b.x - e.x, b.y - e.y) <= dormantPx)) {
        combat.input(id, { move: { x: 0, y: 0 }, buttons: 0 });
        // Nobody to fight (gone, or in a cutscene, spec 021): it lets go and wanders when it wakes.
        if (c.threat.current !== undefined || c.threat.values.size > 0) c.threat = newThreat();
        return undefined;
      }
      const major = me.major ? combatData.statuses.get(me.major.id) : undefined;
      const self: SelfView = {
        id,
        x: e.x,
        y: e.y,
        types: me.types,
        level: me.level,
        attack: me.stats.attack,
        specialAttack: me.stats.specialAttack,
        hp: me.hp,
        hpMax: me.stats.hp,
        immobile: major?.immobile === true,
        stunned: frame.hits.some((h) => h.kind === "failed" && h.attacker === id && h.target === id),
        casting: me.casting !== undefined,
        moves: me.moves.map((m) => moveView(me, m)),
      };
      const hurtBy = new Map<number, number>();
      for (const h of frame.hits) if (h.kind === "hit" && h.target === id && h.attacker !== id) hurtBy.set(h.attacker, (hurtBy.get(h.attacker) ?? 0) + h.amount);
      const t: AiTick = {
        tick,
        self,
        // A Repel does not stop a fight already under way (spec 027, edge case): only wild Pokémon not yet fighting.
        opponents: here.filter((b) => fights(me, b, combat, c.fightStart !== undefined ? 0 : options.repel?.(b))).map(opponentView),
        noises: frame.noises.get(e.area) ?? [],
        hurtBy: [...hurtBy].map(([attacker, amount]) => ({ id: attacker, amount })),
      };
      const out = stepController(c, t, envFor(e));
      combat.input(id, { ...out.input, minCastTicks });
      for (const d of out.decisions) {
        log.push(d);
        options.onDecision?.(d);
      }
      return out;
    },
    /** The debug overlay rows for AIs within `radiusPx` of a point (FR-033). */
    debug(area: string, at: Point, radiusPx: number): AiDebugRow[] {
      const rows: AiDebugRow[] = [];
      for (const [id, c] of controllers) {
        const e = world.get(id);
        if (!e || e.area !== area || Math.hypot(e.x - at.x, e.y - at.y) > radiusPx) continue;
        const target = c.threat.current;
        const seen = target === undefined ? undefined : c.senses.memory.get(target);
        rows.push({
          entityId: id,
          state: c.state,
          target: target ?? null,
          sight: { rangePx: c.profile.sightTiles * MAP_TILE_PX, angleDeg: c.profile.sightAngleDeg, facing: c.senses.look },
          lastSeen: seen ? { x: seen.x, y: seen.y } : null,
          zone: { x: c.home.x, y: c.home.y, radiusPx: c.leashPx },
          scores: c.lastDecision?.scores ?? [],
          chosenSlot: c.lastDecision?.chosenSlot ?? null,
        });
      }
      return rows;
    },
  };
}

export type Ai = ReturnType<typeof createAi>;
