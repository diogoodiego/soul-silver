import { z } from "zod";
import { PLAYER_NAME_MAX } from "../game/limits.ts";

// A player's save (spec 012, contracts/save-file.md). Progress fields (flags, party, items) join
// in later features, each with a migration.

export const SAVE_SCHEMA_VERSION = 1;

export const saveSchema = z.strictObject({
  schemaVersion: z.number().int().min(1),
  name: z
    .string()
    .min(1)
    .max(PLAYER_NAME_MAX)
    .refine((s) => s.trim().length > 0, "nome vazio"),
  character: z.enum(["male", "female"]),
  area: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
  facing: z.enum(["north", "south", "east", "west"]),
  playTimeMs: z.number().int().nonnegative(),
  savedAt: z.iso.datetime(),
  rev: z.number().int().nonnegative(),
});
export type Save = z.infer<typeof saveSchema>;
