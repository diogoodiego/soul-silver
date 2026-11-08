import { z } from "zod";
import { int } from "../game-data/common.ts";
import { createGameDataCodec } from "../game-data/parse.ts";

// Hand-written field data (spec 025, data-model.md): the field-move rules, the fishing rules and the
// locomotion class of every species. Same envelope and error format as the wild data (principle III).

export const FIELD_OBSTACLES = ["tree", "rock", "boulder", "whirlpool", "waterfall", "climbWall", "darkCave", "water", "headbuttTree", "none"] as const;
export type FieldObstacle = (typeof FIELD_OBSTACLES)[number];
export const LOCOMOTION_CLASSES = ["terrestrial", "aquatic", "flying", "levitating"] as const;
export type LocomotionClass = (typeof LOCOMOTION_CLASSES)[number];
/** What the player is doing on the field; the server validates every transition. */
export const PLAYER_MODES = ["walk", "run", "bike", "surf", "fish"] as const;
export type PlayerMode = (typeof PLAYER_MODES)[number];
export const RODS = ["old", "good", "super"] as const;
export type Rod = (typeof RODS)[number];

const unit = () => z.number().min(0).max(1);
const seconds = () => z.number().positive().max(60);

const fieldMove = z.strictObject({
  /** The key scripts and the protocol use ("cut", "rockSmash"…). */
  name: z.string().regex(/^[a-z][A-Za-z]*$/),
  /** Combat move id the party member must know. */
  move: int(1, 0xffff),
  obstacle: z.enum(FIELD_OBSTACLES),
  /** Badge index the original requires (field_move.c); absent when it requires none. */
  badge: int(0, 15).optional(),
});

export const fieldMovesRules = z.strictObject({
  moves: z.array(fieldMove).min(1),
  /** Faster than RUN_SPEED_PX. */
  bikeSpeedPx: z.number().positive().max(32),
  /** Item that leaves a cave. */
  escapeRope: int(1, 0xffff),
  bicycle: int(1, 0xffff),
  /** Map header weathers of a cave Flash lights (WEATHER_FLASH and the one after it, research R1). */
  darkWeather: z.array(int(0, 255)).min(1),
  /** Rock Smash items (rock_smash_item.c, SoulSilver's lists): eight items per list and the percent each place is drawn. */
  rockSmashItems: z.strictObject({
    weights: z.array(int(1, 100)).length(8),
    default: z.array(int(1, 0xffff)).length(8),
    ruinsOfAlph: z.array(int(1, 0xffff)).length(8),
    cliffCave: z.array(int(1, 0xffff)).length(8),
  }),
});
export type FieldMovesRules = z.infer<typeof fieldMovesRules>;
export type FieldMoveRule = z.infer<typeof fieldMove>;

const rod = z.strictObject({
  /** The rod's item id in the bag. */
  item: int(1, 0xffff),
  /** Wait before a bite, in seconds. */
  waitS: z
    .tuple([seconds(), seconds()])
    .refine(([min, max]) => min <= max, "espera mínima maior que a máxima"),
  /** Time to react after the bite. */
  windowS: seconds(),
  baseBite: unit(),
});

export const fishingRules = z.strictObject({
  rods: z.strictObject({ old: rod, good: rod, super: rod }),
  /** Added to the bite chance at friendship 255, scaled down linearly. */
  friendshipBite: unit(),
});
export type FishingRules = z.infer<typeof fishingRules>;

export const locomotionTable = z.strictObject({
  species: z
    .record(z.string().regex(/^\d+$/), z.enum(LOCOMOTION_CLASSES))
    .superRefine((table, ctx) => {
      for (let id = 1; id <= 493; id++) if (!(String(id) in table)) ctx.addIssue({ code: "custom", message: `espécie ${id} sem classe` });
      for (const key of Object.keys(table)) if (Number(key) < 1 || Number(key) > 493) ctx.addIssue({ code: "custom", path: [key], message: "espécie fora de 1–493" });
    }),
});
export type LocomotionTable = z.infer<typeof locomotionTable>;

export const FIELD_FORMAT_VERSION = 1;

const envelope = <K extends string, T extends z.ZodType>(kind: K, value: T) =>
  z.strictObject({ kind: z.literal(kind), formatVersion: z.literal(FIELD_FORMAT_VERSION), value });

export const fieldSchemas = {
  moves: envelope("field-moves", fieldMovesRules),
  fishing: envelope("field-fishing", fishingRules),
  locomotion: envelope("field-locomotion", locomotionTable),
} as const;

export type FieldFileKind = keyof typeof fieldSchemas;

const codec = createGameDataCodec(fieldSchemas);
export const parseFieldFile = codec.parseGameDataFile;
