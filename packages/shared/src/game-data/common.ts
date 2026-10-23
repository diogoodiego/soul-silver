import { z } from "zod";

// Building blocks of the game data schemas; see specs/004-game-data-extraction/data-model.md.

export const GAME_DATA_FORMAT_VERSION = 1;

/** Integer in [min, max]. */
export function int(min: number, max: number) {
  return z.number().int().min(min).max(max);
}

/** Record identifier: an integer ≥ 0. */
export function id() {
  return z.number().int().min(0);
}

export const TEXT_CATALOGS = [
  "species-names",
  "move-names",
  "item-names",
  "ability-names",
  "type-names",
  "nature-names",
] as const;

/** Reference to the text catalog of feature 005 (FR-011); the text itself never lives here. */
export function textRef<C extends (typeof TEXT_CATALOGS)[number]>(catalog: C) {
  return z.strictObject({ catalog: z.literal(catalog), index: id() });
}

export const STAT_KEYS = ["hp", "attack", "defense", "speed", "specialAttack", "specialDefense"] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export const BATTLE_STAT_KEYS = ["attack", "defense", "speed", "specialAttack", "specialDefense"] as const;

/** The six stats, always in the same key order. */
export function stats(min: number, max: number) {
  const value = int(min, max);
  return z.strictObject({
    hp: value,
    attack: value,
    defense: value,
    speed: value,
    specialAttack: value,
    specialDefense: value,
  });
}

/**
 * Strict envelope with records strictly increasing by `id` (FR-015, R13). `extra` adds
 * top-level fields between `formatVersion` and `records` (only the type chart uses it).
 */
export function fileSchema<K extends string, R extends z.ZodType, E extends z.core.$ZodShape = Record<never, never>>(
  kind: K,
  record: R,
  extra?: E,
) {
  return z.strictObject({
    kind: z.literal(kind),
    formatVersion: z.literal(GAME_DATA_FORMAT_VERSION),
    ...(extra ?? ({} as E)),
    records: z.array(record).superRefine((records, ctx) => {
      let previous = -1;
      records.forEach((entry, index) => {
        const recordId = (entry as { id: number }).id;
        if (typeof recordId === "number" && recordId <= previous) {
          ctx.addIssue({
            code: "custom",
            path: [index, "id"],
            message: "registros fora de ordem ou repetidos (os ids devem crescer)",
          });
        }
        if (typeof recordId === "number") previous = Math.max(previous, recordId);
      });
    }),
  });
}
