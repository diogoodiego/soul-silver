import type { Entity } from "@soulsilver/shared/game";

/**
 * Whether `entity` is sent to the player controlling `viewer`. The single filter point:
 * per-player flags (principle VII) are added here in later specs.
 */
export function isRelevant(viewer: Entity, entity: Entity): boolean {
  return entity.area === viewer.area;
}
