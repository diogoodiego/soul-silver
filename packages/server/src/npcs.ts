import type { Entity, WorldLookup } from "@soulsilver/shared/game";
import { tileAt } from "@soulsilver/shared/game";
import { MAP_TILE_PX } from "@soulsilver/shared/maps";
import { createNpc, npcTile, patternFor, stepNpc, type NpcState } from "@soulsilver/shared/npc";
import type { World } from "./world";

// NPC movement patterns (spec 021, US1). The positions are shared and cosmetic: no progress depends on them.

export interface NpcsOptions {
  world: World;
  lookup: WorldLookup;
  seed: number;
  log(message: string): void;
}

export interface NpcSpawn {
  person: number;
  movement: number;
  xRange: number;
  yRange: number;
  /** Tile in the area. */
  tx: number;
  ty: number;
}

/** Half side of a player's footprint, as in movement.ts. */
const HALF_BOX = 6;

export function createNpcs(options: NpcsOptions) {
  const { world, lookup } = options;
  const states = new Map<number, NpcState>();
  const warned = new Set<number>();

  const key = (tx: number, ty: number) => `${tx},${ty}`;

  /** Tiles held by NPCs per area, rebuilt each tick: where each stands, plus the tile it is walking to. */
  function holdMap(): Map<string, Map<string, number>> {
    const held = new Map<string, Map<string, number>>();
    for (const [id, s] of states) {
      const e = world.get(id);
      if (!e) continue;
      const area = held.get(e.area) ?? new Map<string, number>();
      held.set(e.area, area);
      area.set(key(Math.floor(s.x / MAP_TILE_PX), Math.floor(s.y / MAP_TILE_PX)), id);
      if (s.moving) {
        const t = npcTile(s);
        area.set(key(t.tx, t.ty), id);
      }
    }
    return held;
  }

  return {
    add(entityId: number, spawn: NpcSpawn): void {
      const e = world.get(entityId);
      if (!e) return;
      const pattern = patternFor(spawn.movement, spawn.xRange, spawn.yRange, (m) => {
        if (!warned.has(m)) options.log(`NPC movement ${m} is not known; the object stays still`);
        warned.add(m);
      });
      states.set(entityId, createNpc({ person: spawn.person, pattern, tx: spawn.tx, ty: spawn.ty, facing: e.facing, seed: options.seed ^ (entityId * 0x9e3779b1) }));
    },

    /** One 20 Hz tick for every NPC with a pattern. */
    step(): void {
      if (states.size === 0) return;
      const held = holdMap();
      const players = world.all().filter((e) => e.kind === "player");
      for (const [id, s] of states) {
        if (s.pattern.kind === "still") continue;
        const e = world.get(id);
        if (!e) continue;
        const area = held.get(e.area);
        const free = (tx: number, ty: number): boolean => {
          const cell = tileAt(lookup, e.area, e.level, tx * MAP_TILE_PX, ty * MAP_TILE_PX);
          if (!cell || cell.category === "blocked" || cell.category === "water" || cell.category === "ledge") return false;
          const other = area?.get(key(tx, ty));
          if (other !== undefined && other !== id) return false;
          return !players.some((p) => overlaps(p, e.area, tx, ty));
        };
        const before = { x: s.x, y: s.y, facing: s.facing, moving: s.moving !== undefined };
        stepNpc(s, free);
        // Keep the reservation visible to NPCs moving later in this same tick.
        if (s.moving && area) {
          const t = npcTile(s);
          area.set(key(t.tx, t.ty), id);
        }
        const moving = s.moving !== undefined;
        if (before.x === s.x && before.y === s.y && before.facing === s.facing && before.moving === moving) continue;
        const data = { ...e.data };
        if (moving) data["moving"] = 1;
        else delete data["moving"];
        world.update({ ...e, x: s.x, y: s.y, facing: s.facing, data });
      }
    },

    /** Tiles ("tx,ty") the NPCs of an area hold, including the tile each walking one is heading to. */
    heldTiles(area: string): Set<string> {
      return new Set(holdMap().get(area)?.keys());
    },
  };
}

export type Npcs = ReturnType<typeof createNpcs>;

function overlaps(p: Entity, area: string, tx: number, ty: number): boolean {
  if (p.area !== area) return false;
  const x0 = Math.floor((p.x - HALF_BOX) / MAP_TILE_PX);
  const x1 = Math.ceil((p.x + HALF_BOX) / MAP_TILE_PX) - 1;
  const y0 = Math.floor((p.y - HALF_BOX) / MAP_TILE_PX);
  const y1 = Math.ceil((p.y + HALF_BOX) / MAP_TILE_PX) - 1;
  return tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1;
}
