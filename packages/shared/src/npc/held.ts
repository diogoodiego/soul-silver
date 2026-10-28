import type { Entity } from "../game/entity.ts";
import type { Occupied } from "../game/movement.ts";
import { MAP_TILE_PX } from "../maps/index.ts";

const AHEAD = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] } as const;

/**
 * The tiles NPCs hold in `area`, as players must see them (spec 021): where each stands plus, while it
 * walks (`data.moving`), the tile ahead. The server and the client's prediction both build it from the
 * NPC entities this player is sent, so they agree.
 */
export function npcOccupied(entities: Iterable<Entity>, area: string): Occupied {
  const held = new Set<string>();
  for (const e of entities) {
    if (e.kind !== "npc" || e.area !== area) continue;
    const tx = Math.floor(e.x / MAP_TILE_PX);
    const ty = Math.floor(e.y / MAP_TILE_PX);
    held.add(`${tx},${ty}`);
    if (e.data["moving"] === 1) held.add(`${tx + AHEAD[e.facing][0]},${ty + AHEAD[e.facing][1]}`);
  }
  return (tx, ty) => held.has(`${tx},${ty}`);
}
