import type { WorldLookup } from "@soulsilver/shared/game";
import { MAP_TILE_PX } from "@soulsilver/shared/maps";

/** New Bark Town; home is one tile below the door to the player's house (map 63), or its first warp's without one. */
const START_MAP = "60";
const HOUSE_MAP = "63";

export function startPosition(world: WorldLookup): { area: string; x: number; y: number } {
  const warps = world(START_MAP)?.warps;
  const door = warps?.find((w) => w.destMap === HOUSE_MAP) ?? warps?.[0];
  return { area: START_MAP, ...(door ? { x: (door.tx + 0.5) * MAP_TILE_PX, y: (door.ty + 1.5) * MAP_TILE_PX } : { x: 0, y: 0 }) };
}
