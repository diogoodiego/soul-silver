import type { Entity } from "@soulsilver/shared/game";
import { MAP_TILE_PX } from "@soulsilver/shared/maps";

// Tall grass is hidden in a circle around the Pokémon in a fight, so the fight stays readable.

/** Circles the map shader takes at once. */
export const MAX_CLEARINGS = 8;
export const CLEARING_RADIUS_PX = 24;
/** A wild Pokémon this close to a player's Pokémon in combat is in that fight (battle-rules disengageTiles). */
const ENGAGED_PX = 8 * MAP_TILE_PX;

/** A player's Pokémon out in combat: only those carry combat data (a following companion does not). */
const fighting = (e: Entity) => e.kind === "pokemon" && typeof e.data["owner"] === "string" && e.data["owner"] !== "wild" && Number(e.data["hpMax"] ?? 0) > 0;

/** Centers of the grass clearings, in the current map's pixels. */
export function clearings(entities: readonly Entity[]): { x: number; y: number }[] {
  const players = entities.filter(fighting);
  const wild = entities.filter((e) => e.kind === "pokemon" && e.data["owner"] === "wild" && players.some((p) => Math.hypot(p.x - e.x, p.y - e.y) <= ENGAGED_PX));
  return [...players, ...wild].slice(0, MAX_CLEARINGS).map((e) => ({ x: e.x, y: e.y }));
}
