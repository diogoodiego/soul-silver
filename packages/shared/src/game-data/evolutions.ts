import { z } from "zod";
import { fileSchema, id, int } from "./common.ts";

// evolutions.json; see data-model.md and research R6.

/** Original method id (1–26) → key. Unknown ids are stored as "unknown" with the id kept. */
export const EVOLUTION_METHODS = {
  1: "friendship",
  2: "friendship-day",
  3: "friendship-night",
  4: "level",
  5: "trade",
  6: "trade-item",
  7: "use-item",
  8: "level-atk-gt-def",
  9: "level-atk-eq-def",
  10: "level-atk-lt-def",
  11: "level-pid-low",
  12: "level-pid-high",
  13: "level-ninjask",
  14: "level-shedinja",
  15: "beauty",
  16: "use-item-male",
  17: "use-item-female",
  18: "hold-item-day",
  19: "hold-item-night",
  20: "knows-move",
  21: "party-species",
  22: "level-male",
  23: "level-female",
  24: "level-magnetic-field",
  25: "level-moss-rock",
  26: "level-ice-rock",
} as const;

export type EvolutionMethodKey = (typeof EVOLUTION_METHODS)[keyof typeof EVOLUTION_METHODS] | "unknown";

const METHOD_KEYS = [...Object.values(EVOLUTION_METHODS), "unknown"] as const;
const u16 = int(0, 65535);

export const evolutionCondition = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("none") }),
  z.strictObject({ kind: z.literal("level"), level: u16 }),
  z.strictObject({ kind: z.literal("item"), item: id() }),
  z.strictObject({ kind: z.literal("move"), move: id() }),
  z.strictObject({ kind: z.literal("species"), species: id() }),
  z.strictObject({ kind: z.literal("beauty"), minimum: u16 }),
  z.strictObject({ kind: z.literal("raw"), value: u16 }),
]);
export type EvolutionCondition = z.infer<typeof evolutionCondition>;

export const evolutionRecord = z.strictObject({
  /** Id of the species or form that evolves. */
  id: id(),
  evolutions: z.array(
    z.strictObject({
      method: z.enum(METHOD_KEYS),
      /** The original method id (FR-006). */
      methodId: u16,
      /** The original parameter, untouched. */
      parameter: u16,
      /** The parameter read according to the method. */
      condition: evolutionCondition,
      /** National number of the target species. */
      into: id(),
    }),
  ),
});
export const evolutionsFile = fileSchema("evolutions", evolutionRecord);
export type EvolutionRecord = z.infer<typeof evolutionRecord>;
