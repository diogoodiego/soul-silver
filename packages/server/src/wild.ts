import type { Decision } from "@soulsilver/shared/ai";
import { toTicks, type Point } from "@soulsilver/shared/combat";
import type { Entity, HitEvent, Rng, WorldLookup } from "@soulsilver/shared/game";
import { MAP_TILE_PX } from "@soulsilver/shared/maps";
import { pickCell, rollLevel, rollShiny, rollSlot, timeOfDay, wildMoves, zoneCells, type Cell } from "@soulsilver/shared/wild";
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
  combat: Combat;
  combatData: CombatData;
  lookup: WorldLookup;
  world: World;
  rng: Rng;
  /** Hour of the host's clock (0–23): picks the morning, day or night table. */
  hour: () => number;
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
  const ai = createAi({ data: options.ai, combat, combatData: options.combatData, world, lookup, rng, onDecision: options.onDecision });
  const wilds = new Map<number, Wild>();
  const areas = new Map<string, SpawnArea | undefined>();
  const despawnTicks = toTicks(rules.despawnSeconds);
  const faintedTicks = toTicks(rules.faintedSeconds);
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
    const count = countIn(area);
    // An empty map fills fast; the wait grows to spawnIntervalSeconds as it nears the cap.
    const fill = capOf(area) === 0 ? 1 : Math.min(1, count / capOf(area));
    sa.nextSpawnTick = tick + toTicks(rules.spawnIntervalMinSeconds + (rules.spawnIntervalSeconds - rules.spawnIntervalMinSeconds) * fill);
    if (count >= capOf(area)) return;
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
      wilds.set(e.id, { entityId: e.id, species: slot.species, shiny, origin: { x, y }, capturing: false, lastHp: c.hp, lastNearTick: tick, engagedTick: undefined, faintedTick: undefined });
      const temperament = data.temperaments.species[String(slot.species)] ?? data.temperaments.default;
      ai.add(e.id, { home: { x, y }, level, temperament, leashPx: rules.leashTiles * MAP_TILE_PX });
    } catch (error) {
      world.remove(e.id);
      options.log(`Wild ${slot.species} on map ${area} not spawned: ${(error as Error).message}`);
    }
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
        const sa = areaOf(area);
        if (sa && tick >= sa.nextSpawnTick) trySpawn(area, sa, trainers.filter((t) => t.area === area), tick);
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
