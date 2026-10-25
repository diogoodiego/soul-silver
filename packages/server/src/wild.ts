import { toTicks, type Point } from "@soulsilver/shared/combat";
import type { Entity, Rng, WorldLookup } from "@soulsilver/shared/game";
import { MAP_TILE_PX } from "@soulsilver/shared/maps";
import { pickCell, rollLevel, rollShiny, rollSlot, stepAi, timeOfDay, wildMoves, zoneCells, type AiState, type Cell } from "@soulsilver/shared/wild";
import type { Combat } from "./combat";
import type { WildData } from "./wild-loader";
import type { World } from "./world";

// Wild Pokémon (spec 015): spawned per area from the map's encounter table, outside every
// player's view; shared by everyone in the session; driven by their temperament through combat.

export interface Wild {
  entityId: number;
  species: number;
  shiny: boolean;
  origin: Point;
  ai: AiState | "capturing";
  angry: boolean;
  lastHp: number;
  lastNearTick: number;
  /** First damage or ball: the start of the "turns" the Quick and Timer Balls count. */
  engagedTick: number | undefined;
  wanderDir: Point;
  wanderUntil: number;
}

interface SpawnArea {
  cells: Cell[];
  nextSpawnTick: number;
}

export interface WildOptions {
  data: WildData;
  combat: Combat;
  lookup: WorldLookup;
  world: World;
  rng: Rng;
  /** Hour of the host's clock (0–23): picks the morning, day or night table. */
  hour: () => number;
  /** battle-rules chaseLimitTiles (spec 014). */
  chaseLimitTiles: number;
  /** A wild Pokémon left the world; `fainted` is set when it was knocked out (spec 016). */
  onRemove?(entityId: number, fainted: { species: number; level: number } | undefined): void;
  log(message: string): void;
}

/** A trainer, or a Pokémon some player owns. */
const isPlayerBody = (e: Entity) => e.kind === "player" || (e.kind === "pokemon" && typeof e.data["owner"] === "string" && e.data["owner"] !== "wild");
const WANDER_TICKS = 40;

export function createWilds(options: WildOptions) {
  const { data, combat, lookup, world, rng } = options;
  const { spawn: rules } = data;
  const wilds = new Map<number, Wild>();
  const areas = new Map<string, SpawnArea | undefined>();
  const intervalTicks = toTicks(rules.spawnIntervalSeconds);
  const despawnTicks = toTicks(rules.despawnSeconds);
  const despawnPx = rules.despawnRadiusTiles * MAP_TILE_PX;

  function areaOf(id: string): SpawnArea | undefined {
    if (!areas.has(id)) {
      const map = lookup(id);
      const table = map?.encounters === undefined ? undefined : data.encounter(map.encounters)?.grass;
      const cells = map && table ? zoneCells(map) : [];
      areas.set(id, cells.length > 0 ? { cells, nextSpawnTick: 0 } : undefined);
    }
    return areas.get(id);
  }

  const capOf = (area: string) => rules.capByMap[area] ?? rules.defaultCap;
  const countIn = (area: string) => [...wilds.values()].filter((w) => world.get(w.entityId)?.area === area).length;

  function trySpawn(area: string, sa: SpawnArea, players: Entity[], tick: number): void {
    sa.nextSpawnTick = tick + intervalTicks;
    if (countIn(area) >= capOf(area)) return;
    const table = data.encounter(lookup(area)!.encounters!)!.grass![timeOfDay(options.hour(), rules.timeBands)];
    if (table.length === 0) return;
    const cell = pickCell(sa.cells, players, rules, rng);
    if (!cell) return;
    const slot = rollSlot(table, rng);
    const level = rollLevel(slot, rng);
    const shiny = rollShiny(rules.shinyOdds, rng);
    const x = cell.x * MAP_TILE_PX + MAP_TILE_PX / 2;
    const y = cell.y * MAP_TILE_PX + MAP_TILE_PX / 2;
    const e = world.add({ kind: "pokemon", area, x, y, level: 0, facing: "south", data: shiny ? { shiny: true } : {} });
    try {
      const c = combat.spawn(world, e.id, { species: slot.species, level, moves: wildMoves(data.levelUp(slot.species), level) }, "wild");
      wilds.set(e.id, { entityId: e.id, species: slot.species, shiny, origin: { x, y }, ai: "wander", angry: false, lastHp: c.hp, lastNearTick: tick, engagedTick: undefined, wanderDir: { x: 0, y: 0 }, wanderUntil: 0 });
    } catch (error) {
      world.remove(e.id);
      options.log(`Wild ${slot.species} on map ${area} not spawned: ${(error as Error).message}`);
    }
  }

  function remove(id: number): void {
    const w = wilds.get(id);
    const c = combat.get(id);
    if (w) options.onRemove?.(id, c?.hp === 0 ? { species: w.species, level: c.level } : undefined);
    combat.remove(world, id);
    world.remove(id);
    wilds.delete(id);
  }

  /** Movement and buttons for this tick's state, fed to combat for its next step. */
  function drive(w: Wild, e: Entity, nearest: Entity | undefined, tick: number): void {
    const toward = (p: Point): Point => {
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      return d < 1 ? { x: 0, y: 0 } : { x: (p.x - e.x) / d, y: (p.y - e.y) / d };
    };
    let move: Point = { x: 0, y: 0 };
    let buttons = 0;
    let aim: Point | undefined;
    if (w.ai === "wander") {
      if (tick >= w.wanderUntil) {
        // Half the time it stands still, like overworld Pokémon in the original.
        const a = rng.nextFloat() * Math.PI * 2;
        w.wanderDir = rng.nextInt(2) === 0 ? { x: 0, y: 0 } : { x: Math.cos(a), y: Math.sin(a) };
        w.wanderUntil = tick + WANDER_TICKS;
      }
      // Wandering stays close to home.
      move = Math.hypot(e.x - w.origin.x, e.y - w.origin.y) > 3 * MAP_TILE_PX ? toward(w.origin) : w.wanderDir;
    } else if (w.ai === "return") move = toward(w.origin);
    else if (nearest && w.ai === "flee") {
      const t = toward(nearest);
      move = { x: -t.x, y: -t.y };
    } else if (nearest && w.ai === "chase") {
      const c = combat.get(w.entityId)!;
      const d = Math.hypot(nearest.x - e.x, nearest.y - e.y);
      aim = toward(nearest);
      const slot = rng.nextInt(c.moves.length);
      // A move starts on the press: press every other tick when in range.
      if (d <= Math.max(c.moves[slot]!.rangePx, MAP_TILE_PX * 2) && tick % 2 === 0) buttons = 1 << slot;
      if (d > MAP_TILE_PX) move = aim;
    }
    combat.input(w.entityId, { move, buttons, ...(aim ? { aim } : {}) });
  }

  return {
    get: (id: number) => wilds.get(id),
    all: () => [...wilds.values()],
    remove,
    /** After combat: fainted ones go, then spawning, AI and despawn. */
    step(tick: number): void {
      const bodies = world.all().filter(isPlayerBody);
      const trainers = bodies.filter((b) => b.kind === "player");
      for (const area of new Set(trainers.map((t) => t.area))) {
        const sa = areaOf(area);
        if (sa && tick >= sa.nextSpawnTick) trySpawn(area, sa, trainers.filter((t) => t.area === area), tick);
      }
      for (const w of [...wilds.values()]) {
        const e = world.get(w.entityId);
        const c = combat.get(w.entityId);
        if (!e || !c || c.hp === 0) {
          remove(w.entityId);
          continue;
        }
        const here = bodies.filter((b) => b.area === e.area);
        if (trainers.some((t) => t.area === e.area && Math.hypot(t.x - e.x, t.y - e.y) <= despawnPx)) w.lastNearTick = tick;
        const hurt = c.hp < w.lastHp;
        w.lastHp = c.hp;
        if (hurt) w.engagedTick ??= tick;
        if (w.ai === "capturing") continue;
        if (tick - w.lastNearTick >= despawnTicks && w.ai !== "chase") {
          remove(w.entityId);
          continue;
        }
        let nearest: Entity | undefined;
        for (const b of here) if (!nearest || Math.hypot(b.x - e.x, b.y - e.y) < Math.hypot(nearest.x - e.x, nearest.y - e.y)) nearest = b;
        w.ai = stepAi(w.ai, {
          temperament: data.temperaments.species[String(w.species)] ?? data.temperaments.default,
          radii: data.temperaments.radii,
          leashTiles: rules.leashTiles,
          chaseLimitTiles: options.chaseLimitTiles,
          self: e,
          origin: w.origin,
          nearest,
          hurt,
          angry: w.angry,
        });
        drive(w, e, nearest, tick);
      }
    },
  };
}

export type Wilds = ReturnType<typeof createWilds>;
