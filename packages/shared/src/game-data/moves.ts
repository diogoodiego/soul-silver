import { z } from "zod";
import { fileSchema, id, int, textRef } from "./common.ts";

// moves.json; see specs/004-game-data-extraction/data-model.md and research R4 and R11.

export const MOVE_CATEGORY_KEYS = ["physical", "special", "status"] as const;

export const MOVE_TARGET_KEYS = [
  "selected", "depends", "random", "both-foes", "all-others", "user", "user-side",
  "field", "foe-side", "ally", "user-or-ally", "foe", "unknown",
] as const;
export type MoveTargetKey = (typeof MOVE_TARGET_KEYS)[number];

const byte = int(0, 255);

export const moveRecord = z.strictObject({
  id: id(),
  name: textRef("move-names"),
  type: byte,
  category: z.enum(MOVE_CATEGORY_KEYS),
  /** Raw: 0 = no damage, 1 = variable/calculated power. */
  power: byte,
  /** Raw 0 ("never misses") becomes null. */
  accuracy: byte.nullable(),
  pp: byte,
  priority: int(-128, 127),
  target: z.enum(MOVE_TARGET_KEYS),
  targetRaw: int(0, 65535),
  flags: z.strictObject({
    contact: z.boolean(),
    protect: z.boolean(),
    magicCoat: z.boolean(),
    snatch: z.boolean(),
    mirrorMove: z.boolean(),
    kingsRock: z.boolean(),
    keepHpBar: z.boolean(),
    hideShadow: z.boolean(),
  }),
  flagsRaw: byte,
  /** The original effect id, untouched, for the real-time archetype mapping (spec 13). */
  effect: z.strictObject({ id: int(0, 65535), chance: byte }),
  contest: z.strictObject({ effect: byte, type: byte }),
});

export const movesFile = fileSchema("moves", moveRecord);
export type MoveRecord = z.infer<typeof moveRecord>;
