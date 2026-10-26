import { z } from "zod";
import { int } from "../game-data/common.ts";
import { createGameDataCodec } from "../game-data/parse.ts";

// Hand-written wild Pokémon data in content/wild/ (spec 015, contracts/wild-data.md). Same
// envelope and error format as the companion data (principle III).

export const TEMPERAMENTS = ["passive", "skittish", "aggressive", "territorial"] as const;
export type Temperament = (typeof TEMPERAMENTS)[number];
export const BALL_CONDITIONS = ["night-or-cave", "first-turn", "timer", "types", "nest", "repeat", "level", "fast", "moon"] as const;
export type BallCondition = (typeof BALL_CONDITIONS)[number];

const tiles = () => z.number().min(0).max(64);
const seconds = () => z.number().min(0).max(600);
const hour = () => int(0, 23);
const speciesKey = z.string().regex(/^\d+$/).refine((k) => Number(k) >= 1 && Number(k) <= 493, "espécie fora de 1–493");

export const spawnRules = z.strictObject({
  defaultCap: int(0, 64),
  /** Map header id → cap, overriding defaultCap. */
  capByMap: z.record(z.string().regex(/^\d+$/), int(0, 64)),
  /** Between spawn attempts on an empty map. */
  spawnIntervalMinSeconds: seconds(),
  /** Between spawn attempts once the map is at its cap; in between it grows with the count. */
  spawnIntervalSeconds: seconds(),
  /** Half the screen, in tiles: a cell inside it (plus the margin) of any player is never used. */
  viewHalfTiles: z.strictObject({ x: tiles(), y: tiles() }),
  viewMarginTiles: tiles(),
  maxTries: int(1, 256),
  despawnRadiusTiles: tiles(),
  despawnSeconds: seconds(),
  /** A knocked-out one stays this long where it fell, catchable, then goes. */
  faintedSeconds: seconds(),
  /** Farther than this from its spawn point, a wild Pokémon walks back. */
  leashTiles: tiles(),
  /** One in this many spawns is shiny. */
  shinyOdds: int(1, 65536),
  /** First hour of each band. */
  timeBands: z.strictObject({ morning: hour(), day: hour(), night: hour() }),
  /** One battle "turn" for the Quick and Timer Balls. */
  turnSeconds: seconds(),
  angryOnEscapeChance: z.number().min(0).max(1),
  storageMax: int(0, 999),
  throwRangeTiles: tiles(),
  ballSpeedTilesPerSecond: z.number().positive().max(64),
  /** Time between shakes, and before the result. */
  shakeSeconds: seconds(),
});
export type SpawnRules = z.infer<typeof spawnRules>;

export const temperaments = z.strictObject({
  default: z.enum(TEMPERAMENTS),
  species: z.record(speciesKey, z.enum(TEMPERAMENTS)),
});
export type Temperaments = z.infer<typeof temperaments>;

const ball = z
  .strictObject({
    mult: z.number().min(0).max(255).optional(),
    /** Master Ball (and Park Ball): caught without a roll. */
    always: z.literal(true).optional(),
    when: z.enum(BALL_CONDITIONS).optional(),
    /** Type ids for when: "types". */
    types: z.array(int(0, 17)).optional(),
  })
  .superRefine((b, ctx) => {
    if (b.when === "types" && !b.types?.length) ctx.addIssue({ code: "custom", path: ["types"], message: "types é obrigatório com when: types" });
    if (b.mult === undefined && !b.always) ctx.addIssue({ code: "custom", path: ["mult"], message: "mult ou always é obrigatório" });
  });
export type Ball = z.infer<typeof ball>;

export const balls = z.strictObject({
  /** Item id (pocket "balls") → modifier. */
  balls: z.record(z.string().regex(/^\d+$/), ball),
});
export type Balls = z.infer<typeof balls>;

export const WILD_FORMAT_VERSION = 1;

const envelope = <K extends string, T extends z.ZodType>(kind: K, value: T) =>
  z.strictObject({ kind: z.literal(kind), formatVersion: z.literal(WILD_FORMAT_VERSION), value });

export const wildSchemas = {
  spawn: envelope("wild-spawn", spawnRules),
  temperaments: envelope("wild-temperaments", temperaments),
  balls: envelope("wild-balls", balls),
} as const;

export type WildFileKind = keyof typeof wildSchemas;

const codec = createGameDataCodec(wildSchemas);
export const parseWildFile = codec.parseGameDataFile;

