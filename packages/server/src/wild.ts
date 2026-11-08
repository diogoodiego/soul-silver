import type { Decision } from "@soulsilver/shared/ai";
import { toTicks, type Point } from "@soulsilver/shared/combat";
import { surfable, type Entity, type HitEvent, type Rng, type WorldLookup } from "@soulsilver/shared/game";
import { MAP_TILE_PX } from "@soulsilver/shared/maps";
import { pickCell, rollLevel, rollShiny, rollSlot, timeOfDay, wildMoves, zoneCells, type Cell } from "@soulsilver/shared/wild";
import type { EncounterSlot } from "@soulsilver/shared/events";
import { pickCatch, type Rod } from "@soulsilver/shared/field";
import { createAi } from "./ai";
import type { AiData } from "./ai-loader";
import type { Combat } from "./combat";
import type { CombatData } from "./combat-loader";
import type { WildData } from "./wild-loader";
import type { World } from "./world";

// Wild Pokémon (spec 015): spawned per area from the map's encounter table, outside every
// player's view; shared by everyone in the session; driven by the combat AI (spec 019).

export interface Wild {
  entityId: number;
  species: number;
  shiny: boolean;
  origin: Point;
  /** Out of the water (spec 025): counted against the water's cap, apart from the grass. */
  water: boolean;
  /** Spec 027: hooked with a rod (Lure Ball). */
  fished?: boolean | undefined;
  /** Inside a ball's shakes: the AI is paused. */
  capturing: boolean;
  lastHp: number;
  lastNearTick: number;
  /** First damage or ball: the start of the "turns" the Quick and Timer Balls count. */
  engagedTick: number | undefined;
  /** Knocked out at this tick: it stays where it fell, catchable, for faintedSeconds. */
  faintedTick: number | undefined;
}

/** AI states that keep a wild Pokémon from despawning: it is fighting someone. */
const ENGAGED = new Set(["approach", "combat", "reposition"]);

interface SpawnArea {
  cells: Cell[];
  nextSpawnTick: number;
}

export interface WildOptions {
  data: WildData;
  ai: AiData;
  /** Spec 027: wild Pokémon below this level keep away from this body (a Repel); none when omitted. */
  repel?: ((body: Entity) => number) | undefined;
  combat: Combat;
  combatData: CombatData;
  lookup: WorldLookup;
  world: World;
  rng: Rng;
  /** Hour of the host's clock (0–23): picks the morning, day or night table. */
  hour: () => number;
  /** Spec 026: the cap with the radio of the players in the area; the map's own cap when omitted. */
  cap?: ((area: string, base: number) => number) | undefined;
  /** Every AI decision (spec 019, FR-034). */
  onDecision?: ((d: Decision) => void) | undefined;
  /** Knocked out: experience goes to whoever fought it (spec 016). */
  onFaint?(entityId: number, species: number, level: number): void;
  /** A wild Pokémon left the world. */
  onRemove?(entityId: number): void;
  log(message: string): void;
}

export function createWilds(options: WildOptions) {
  const { data, combat, lookup, world, rng } = options;
  const { spawn: rules } = data;
  const ai = createAi({ data: options.ai, combat, combatData: options.combatData, world, lookup, rng, onDecision: options.onDecision, repel: options.repel });
  const wilds = new Map<number, Wild>();
  /** By `${kind}:${map}`: the grass (or cave floor), and the water while someone surfs (spec 025). */
  const areas = new Map<string, SpawnArea | undefined>();
  const despawnTicks = toTicks(rules.despawnSeconds);
  const faintedTicks = toTicks(rules.faintedSeconds);
  const despawnPx = rules.despawnRadiusTiles * MAP_TILE_PX;

  function waterCells(id: string): Cell[] {
    const grid = lookup(id)?.levels[0];
    const cells: Cell[] = [];
    grid?.tiles.forEach((t, i) => {
      if (surfable(t)) cells.push({ x: i % grid.width, y: Math.floor(i / grid.width) });
    });
    return cells;
  }

  /** The kind's table now, if the map has one. */
  function tableOf(id: string, kind: "grass" | "water"): readonly EncounterSlot[] | undefined {
    const map = lookup(id);
    const encounter = map?.encounters === undefined ? undefined : data.encounter(map.encounters);
    // shortcut: swarm.surf is never used, there are no outbreaks yet; swap it in when a spec adds them.
    if (kind === "water") return encounter?.rates.surfing ? encounter.surf : undefined;
    return encounter?.grass?.[timeOfDay(options.hour(), rules.timeBands)];
  }

  /** The rod's table when the map has one and fishes at all. */
  function fishTable(id: string, rod: Rod) {
    const map = lookup(id);
    const encounter = map?.encounters === undefined ? undefined : data.encounter(map.encounters);
    const slots = encounter?.[`${rod}Rod`];
    // shortcut: swarm.fish is never used, there are no outbreaks yet; swap it in when a spec adds them.
    return encounter?.rates[`${rod}Rod`] && slots ? { slots, nightFish: encounter.nightFish } : undefined;
  }

  function areaOf(id: string, kind: "grass" | "water"): SpawnArea | undefined {
    const key = `${kind}:${id}`;
    if (!areas.has(key)) {
      const map = lookup(id);
      const cells = map && tableOf(id, kind) ? (kind === "grass" ? zoneCells(map) : waterCells(id)) : [];
      areas.set(key, cells.length > 0 ? { cells, nextSpawnTick: 0 } : undefined);
    }
    return areas.get(key);
  }

  const capOf = (area: string) => {
    const base = rules.capByMap[area] ?? rules.defaultCap;
    return options.cap ? options.cap(area, base) : base;
  };
  const countIn = (area: string, water: boolean) => [...wilds.values()].filter((w) => w.water === water && world.get(w.entityId)?.area === area).length;

  function trySpawn(area: string, kind: "grass" | "water", sa: SpawnArea, players: Entity[], tick: number): void {
    const count = countIn(area, kind === "water");
    // An empty map fills fast; the wait grows to spawnIntervalSeconds as it nears the cap.
    const fill = capOf(area) === 0 ? 1 : Math.min(1, count / capOf(area));
    sa.nextSpawnTick = tick + toTicks(rules.spawnIntervalMinSeconds + (rules.spawnIntervalSeconds - rules.spawnIntervalMinSeconds) * fill);
    if (count >= capOf(area)) return;
    const table = tableOf(area, kind) ?? [];
    if (table.length === 0) return;
    // A pond smaller than the screen has no tile out of view: the water may then spawn in view, a few tiles off.
    const near = { viewHalfTiles: { x: rules.waterInViewTiles, y: rules.waterInViewTiles }, viewMarginTiles: 0, maxTries: rules.maxTries };
    const cell = pickCell(sa.cells, players, rules, rng) ?? (kind === "water" ? pickCell(sa.cells, players, near, rng) : undefined);
    if (!cell) return;
    const slot = rollSlot(table, rng);
    const level = rollLevel(slot, rng);
    const shiny = rollShiny(rules.shinyOdds, rng);
    const x = cell.x * MAP_TILE_PX + MAP_TILE_PX / 2;
    const y = cell.y * MAP_TILE_PX + MAP_TILE_PX / 2;
    try {
      add(area, x, y, { species: slot.species, level, moves: wildMoves(data.levelUp(slot.species), level) }, shiny, tick, kind === "water");
    } catch (error) {
      options.log(`Wild ${slot.species} on map ${area} not spawned: ${(error as Error).message}`);
    }
  }

  /** A wild Pokémon with its AI at (x, y); nothing is left in the world when the combatant cannot spawn. */
  function add(area: string, x: number, y: number, spec: { species: number; level: number; moves: number[] }, shiny: boolean, tick: number, water = false, fished = false): number {
    const e = world.add({ kind: "pokemon", area, x, y, level: 0, facing: "south", data: shiny ? { shiny: true } : {} });
    try {
      const c = combat.spawn(world, e.id, spec, "wild");
      wilds.set(e.id, { entityId: e.id, species: spec.species, shiny, origin: { x, y }, water, ...(fished ? { fished } : {}), capturing: false, lastHp: c.hp, lastNearTick: tick, engagedTick: undefined, faintedTick: undefined });
      const temperament = data.temperaments.species[String(spec.species)] ?? data.temperaments.default;
      ai.add(e.id, { home: { x, y }, level: spec.level, temperament, leashPx: rules.leashTiles * MAP_TILE_PX });
    } catch (error) {
      world.remove(e.id);
      throw error;
    }
    return e.id;
  }

  function remove(id: number): void {
    if (wilds.has(id)) options.onRemove?.(id);
    combat.remove(world, id);
    world.remove(id);
    wilds.delete(id);
    ai.remove(id);
  }

  return {
    get: (id: number) => wilds.get(id),
    all: () => [...wilds.values()],
    remove,
    /** The dev arena: a wild Pokémon of the tester's choosing, with the AI, as a spawn would be; throws on a bad spec. */
    place: (area: string, x: number, y: number, spec: { species: number; level: number; moves: number[] }, tick: number) => add(area, x, y, spec, false, tick),
    /** Whether the map has fish for this rod (spec 025); without, nothing ever bites. */
    canFish: (area: string, rod: Rod) => fishTable(area, rod) !== undefined,
    /** The hooked one (FR-012): from the rod's table, out of the water at (x, y), with its AI; counted with the water's. */
    hook(area: string, rod: Rod, x: number, y: number, tick: number): number | undefined {
      const table = fishTable(area, rod);
      if (!table) return undefined;
      const night = timeOfDay(options.hour(), rules.timeBands) === "night";
      const slot = pickCatch(table.slots, rng, night ? table.nightFish : undefined, rod);
      const level = rollLevel(slot, rng);
      try {
        return add(area, x, y, { species: slot.species, level, moves: wildMoves(data.levelUp(slot.species), level) }, rollShiny(rules.shinyOdds, rng), tick, true, true);
      } catch (error) {
        options.log(`Wild ${slot.species} hooked on map ${area} not spawned: ${(error as Error).message}`);
        return undefined;
      }
    },
    /** The AI runner, for the debug overlay and the decision log. */
    ai,
    /** A ball escape (spec 015): back to the world, maybe enraged. */
    release(id: number, angry: boolean): void {
      const w = wilds.get(id);
      if (!w) return;
      w.capturing = false;
      if (angry) ai.enrage(id);
    },
    /** After combat: knocked-out ones, then spawning, AI and despawn. */
    step(tick: number, hits: HitEvent[] = []): void {
      const trainers = world.all().filter((b) => b.kind === "player");
      for (const area of new Set(trainers.map((t) => t.area))) {
        const here = trainers.filter((t) => t.area === area);
        const sa = areaOf(area, "grass");
        if (sa && tick >= sa.nextSpawnTick) trySpawn(area, "grass", sa, here, tick);
        // The water comes alive only around someone surfing it.
        const water = here.some((t) => t.data["mode"] === "surf") ? areaOf(area, "water") : undefined;
        if (water && tick >= water.nextSpawnTick) trySpawn(area, "water", water, here, tick);
      }
      ai.prepare(tick, hits);
      // By id, so every run draws from the generator in the same order (FR-004).
      for (const w of [...wilds.values()].sort((a, b) => a.entityId - b.entityId)) {
        const e = world.get(w.entityId);
        const c = combat.get(w.entityId);
        if (!e || !c) {
          remove(w.entityId);
          continue;
        }
        if (c.hp === 0) {
          if (w.faintedTick === undefined) {
            w.faintedTick = tick;
            options.onFaint?.(w.entityId, w.species, c.level);
            const data = { ...e.data };
            delete data["alert"];
            world.update({ ...e, data });
          }
          if (!w.capturing && tick - w.faintedTick >= faintedTicks) remove(w.entityId);
          continue;
        }
        if (trainers.some((t) => t.area === e.area && Math.hypot(t.x - e.x, t.y - e.y) <= despawnPx)) w.lastNearTick = tick;
        const hurt = c.hp < w.lastHp;
        w.lastHp = c.hp;
        if (hurt) w.engagedTick ??= tick;
        if (w.capturing) continue;
        if (tick - w.lastNearTick >= despawnTicks && !ENGAGED.has(ai.get(w.entityId)?.state ?? "")) {
          remove(w.entityId);
          continue;
        }
        const alert = ai.drive(w.entityId)?.alert === true;
        // The "!" bubble; the client plays the cry when this turns on (spec 018, research R8).
        if (alert !== (e.data["alert"] === true)) {
          const data = { ...e.data };
          if (alert) data["alert"] = true;
          else delete data["alert"];
          world.update({ ...e, data });
        }
      }
    },
  };
}

export type Wilds = ReturnType<typeof createWilds>;
