import type { Direction } from "../maps/areas.ts";

// Anything simulated in the world (spec 010, data-model.md). New kinds (e.g. "npc") extend the union.

export const ENTITY_KINDS = ["player", "pokemon", "projectile", "wild"] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export type EntityData = Record<string, string | number | boolean>;

export interface Entity {
  id: number;
  kind: EntityKind;
  /** Area (map) id. */
  area: string;
  /** Feet position in pixels. */
  x: number;
  y: number;
  facing: Direction;
  /** Kind-specific fields. */
  data: EntityData;
}

/** The id plus only the fields that changed. */
export type EntityDelta = { id: number } & { [K in Exclude<keyof Entity, "id">]?: Entity[K] | undefined };

function sameData(a: EntityData, b: EntityData): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}

export function diffEntity(prev: Entity, next: Entity): EntityDelta | undefined {
  const delta: EntityDelta = { id: next.id };
  let changed = false;
  for (const key of ["kind", "area", "x", "y", "facing"] as const) {
    if (prev[key] !== next[key]) {
      (delta as Record<string, unknown>)[key] = next[key];
      changed = true;
    }
  }
  // shortcut: data is resent whole when any field changes; diff per field if data grows large.
  if (!sameData(prev.data, next.data)) {
    delta.data = { ...next.data };
    changed = true;
  }
  return changed ? delta : undefined;
}

export function applyDelta(entity: Entity, delta: EntityDelta): Entity {
  const next: Record<string, unknown> = { ...entity };
  for (const [key, value] of Object.entries(delta)) if (value !== undefined) next[key] = value;
  return next as unknown as Entity;
}
