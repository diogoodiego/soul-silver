import type { WorldLookup } from "@soulsilver/shared/game";
import { MAP_TILE_PX } from "@soulsilver/shared/maps";

/** New Bark Town; a new game starts one tile below the door of its first warp. */
const START_MAP = "60";

export function startPosition(world: WorldLookup): { area: string; x: number; y: number } {
  const door = world(START_MAP)?.warps[0];
  return { area: START_MAP, ...(door ? { x: (door.tx + 0.5) * MAP_TILE_PX, y: (door.ty + 1.5) * MAP_TILE_PX } : { x: 0, y: 0 }) };
}
