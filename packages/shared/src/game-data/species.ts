import { z } from "zod";
import { fileSchema, id, int, stats, textRef } from "./common.ts";

// species.json; see specs/004-game-data-extraction/data-model.md.
// Ranges here are the raw byte limits: values outside the expected game ranges are kept as they
// are and flagged by the sanity report, never rewritten (principle I).

export const GROWTH_RATE_KEYS = ["medium-fast", "erratic", "fluctuating", "medium-slow", "fast", "slow"] as const;
export type GrowthRateKey = (typeof GROWTH_RATE_KEYS)[number];

export const EGG_GROUP_KEYS = [
  "monster", "water-1", "bug", "flying", "field", "fairy", "grass", "human-like",
  "water-3", "mineral", "amorphous", "water-2", "ditto", "dragon", "undiscovered",
] as const;
export type EggGroupKey = (typeof EGG_GROUP_KEYS)[number];

export const GENDER_KINDS = ["male-only", "female-only", "genderless", "mixed"] as const;

const byte = int(0, 255);
const oneOrTwo = <T extends z.ZodType>(value: T) => z.union([z.tuple([value]), z.tuple([value, value])]);

export const speciesRecord = z.strictObject({
  /** Personal index: 1–493 are the national numbers, 496–507 are alternate forms. */
  id: id(),
  /** National Pokédex number of the species this record belongs to. */
  species: id(),
  /** 0 for the base form. */
  form: id(),
  name: textRef("species-names"),
  baseStats: stats(0, 255),
  types: oneOrTwo(byte),
  abilities: oneOrTwo(byte),
  catchRate: byte,
  baseExperience: byte,
  evYield: stats(0, 3),
  gender: z.strictObject({ kind: z.enum(GENDER_KINDS), raw: byte }),
  growthRate: z.enum(GROWTH_RATE_KEYS),
  eggGroups: oneOrTwo(z.enum(EGG_GROUP_KEYS)),
  heldItems: z.strictObject({ common: id().nullable(), rare: id().nullable() }),
  hatchCycles: byte,
  baseFriendship: byte,
  safariFleeRate: byte,
  color: z.strictObject({ id: int(0, 127), flip: z.boolean() }),
  /** On a base species: the ids of its alternate forms. Empty otherwise. */
  forms: z.array(id()),
});

export const speciesFile = fileSchema("species", speciesRecord);
export type SpeciesRecord = z.infer<typeof speciesRecord>;
