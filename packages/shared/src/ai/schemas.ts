import { z } from "zod";
import { int } from "../game-data/common.ts";
import { createGameDataCodec } from "../game-data/parse.ts";
import { TEMPERAMENTS } from "../wild/schemas.ts";

// Hand-written combat AI data in content/ai/ (spec 019, contracts/ai-data.md). Same envelope and
// error format as the other content files (principle III). Seconds and tiles; code converts.

const fraction = () => z.number().min(0).max(1);
const seconds = () => z.number().min(0).max(600);
const tiles = () => z.number().min(0).max(64);
const positive = () => z.number().positive().max(1000);

export const skillProfile = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  reactionS: seconds(),
  aimErrorDeg: z.number().min(0).max(180),
  leadFactor: fraction(),
  typeKnowledge: fraction(),
  /** Block C: chance that a trainer's Pokémon dodges or parries a move it sees coming (wild ones use action.wildReactChance). */
  reactChance: fraction(),
  decisionIntervalS: z.number().min(0.1).max(10),
  temperature: positive(),
  sightTiles: tiles(),
  sightAngleDeg: z.number().min(1).max(360),
  hearingTiles: tiles(),
  memoryS: seconds(),
  fleeHpFraction: fraction(),
  targetSwitchMargin: z.number().min(0).max(10),
  /** Who uses it; no effect on behavior. */
  source: z.enum(["wild", "trainer"]).optional(),
  /** Reserved for the original trainer AI flags (trainers spec); ignored here. */
  aiFlags: z.array(z.string()).optional(),
});
export type SkillProfile = z.infer<typeof skillProfile>;

export const profiles = z.strictObject({ profiles: z.array(skillProfile).min(1) }).superRefine((p, ctx) => {
  const seen = new Set<string>();
  p.profiles.forEach((r, i) => {
    if (seen.has(r.id)) ctx.addIssue({ code: "custom", path: ["profiles", i, "id"], message: "id repetido" });
    seen.add(r.id);
  });
});
export type Profiles = z.infer<typeof profiles>;

export const temperamentRules = z.strictObject({
  onSeePlayer: z.enum(["ignore", "alert-approach", "alert-flee", "alert-watch", "alert-by-zone"]),
  onHurt: z.enum(["flee", "fight", "weighted"]),
  /** Chance to fight back when hurt, for onHurt "weighted". */
  fightWeight: fraction().optional(),
  fightWhenCornered: z.boolean(),
  /** Radius around the home zone that a territorial one defends. */
  toleranceTiles: tiles().optional(),
  /** Replaces the profile's flee threshold. */
  fleeHpFraction: fraction().optional(),
  /** Gives up a chase when the target is farther than this. */
  chaseLimitTiles: tiles(),
});
export type TemperamentRules = z.infer<typeof temperamentRules>;

export const temperamentTable = z.strictObject(Object.fromEntries(TEMPERAMENTS.map((t) => [t, temperamentRules])) as Record<(typeof TEMPERAMENTS)[number], typeof temperamentRules>);
export type TemperamentTable = z.infer<typeof temperamentTable>;

export const wildLevels = z
  .strictObject({ bands: z.array(z.strictObject({ minLevel: int(1, 100), maxLevel: int(1, 100), profile: z.string() })).min(1) })
  .superRefine((t, ctx) => {
    let next = 1;
    t.bands.forEach((b, i) => {
      if (b.minLevel !== next) ctx.addIssue({ code: "custom", path: ["bands", i, "minLevel"], message: `esperado ${next} (faixas contíguas a partir de 1)` });
      if (b.maxLevel < b.minLevel) ctx.addIssue({ code: "custom", path: ["bands", i, "maxLevel"], message: "menor que minLevel" });
      next = b.maxLevel + 1;
    });
    if (next !== 101) ctx.addIssue({ code: "custom", path: ["bands"], message: "as faixas devem cobrir 1–100" });
  });
export type WildLevels = z.infer<typeof wildLevels>;

export const aiTuning = z.strictObject({
  threat: z.strictObject({ wDamage: z.number().min(0), wProximity: z.number().min(0), wFirst: z.number().min(0), decayPerS: fraction() }),
  score: z.strictObject({
    immuneScore: z.number().positive(),
    statusUsefulness: z.number().min(0),
    buffUsefulness: z.number().min(0),
    healUsefulness: z.number().min(0),
    healHpFraction: fraction(),
    buffEarlyS: seconds(),
    buffSafeTiles: tiles(),
    /** Multiplier for a move the target is out of range of. */
    outOfRange: fraction(),
    /** Hit chance lost per pixel per tick of target speed. */
    speedPenalty: fraction(),
    hitChance: z.strictObject({ arc: fraction(), circle: fraction(), capsule: fraction(), none: fraction() }),
  }),
  noise: z.strictObject({ walkTiles: tiles(), runTiles: tiles(), moveTiles: tiles(), bearingErrorDeg: z.number().min(0).max(180) }),
  perception: z.strictObject({ everyTicks: int(1, 20) }),
  performance: z.strictObject({ dormantTiles: tiles(), budgetMsPerTick: positive() }),
  /** repositionS: block C, how long a trainer's Pokémon backs off after its chain. */
  states: z.strictObject({ idleWanderTiles: tiles(), idlePauseS: seconds(), alertS: seconds(), returnIgnoreS: seconds(), repositionS: seconds(), angryAfterEscapeS: seconds() }),
  /**
   * Block C (docs/roadmap/combate.md): wild Pokémon react to a move they can dodge or parry this often, use a ready
   * special this often, and chain 1 to wildChainMax normals; trainers chain trainerChain, then back off. Dodges go
   * off reactLeadS before the move leaves, parries at any moment of its cast.
   */
  action: z.strictObject({ wildReactChance: fraction(), wildSpecialChance: fraction(), wildChainMax: int(1, 10), trainerChain: int(1, 10), reactLeadS: seconds() }),
  debug: z.strictObject({ hz: z.number().min(1).max(20), radiusTiles: tiles() }),
});
export type AiTuning = z.infer<typeof aiTuning>;

export const AI_FORMAT_VERSION = 1;

const envelope = <K extends string, T extends z.ZodType>(kind: K, value: T) =>
  z.strictObject({ kind: z.literal(kind), formatVersion: z.literal(AI_FORMAT_VERSION), value });

export const aiSchemas = {
  profiles: envelope("ai-profiles", profiles),
  temperaments: envelope("ai-temperaments", temperamentTable),
  wildLevels: envelope("ai-wild-levels", wildLevels),
  tuning: envelope("ai-tuning", aiTuning),
} as const;

export type AiFileKind = keyof typeof aiSchemas;

const codec = createGameDataCodec(aiSchemas);
export const parseAiFile = codec.parseGameDataFile;
