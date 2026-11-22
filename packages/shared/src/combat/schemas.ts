import { z } from "zod";
import { BATTLE_STAT_KEYS, fileSchema, id, int } from "../game-data/common.ts";
import { createGameDataCodec } from "../game-data/parse.ts";

// Hand-written combat data in content/combat/ (spec 013, contracts/combat-data.md). Same envelope
// and error format as the extracted game data (principle III).

export const BEHAVIORS = ["melee", "projectile", "beam", "self-area", "target-area", "dash", "self-buff", "target-debuff", "field"] as const;
export type Behavior = (typeof BEHAVIORS)[number];

/** Hitbox shapes each behavior accepts; self-buff has no hitbox. */
export const BEHAVIOR_SHAPES: Record<Behavior, readonly HitboxShape[]> = {
  melee: ["arc", "circle", "capsule"],
  projectile: ["circle"],
  beam: ["capsule"],
  "self-area": ["circle"],
  "target-area": ["circle"],
  dash: ["circle"],
  "self-buff": [],
  "target-debuff": ["capsule"],
  field: ["circle"],
};

export const STATUS_IDS = ["burn", "poison", "toxic", "paralysis", "sleep", "freeze", "confusion"] as const;
export type StatusId = (typeof STATUS_IDS)[number];

export const STAGE_KEYS = [...BATTLE_STAT_KEYS, "accuracy", "evasion", "crit"] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

export const WEATHERS = ["sun", "rain", "hail"] as const;
export type Weather = (typeof WEATHERS)[number];

const px = () => z.number().min(0).max(2048);
const seconds = (max: number) => z.number().min(0).max(max);
const percent = () => int(0, 100);
const fraction = () => z.number().min(0).max(1);

export const hitbox = z.discriminatedUnion("shape", [
  z.strictObject({ shape: z.literal("circle"), radiusPx: px() }),
  z.strictObject({ shape: z.literal("capsule"), lengthPx: px(), widthPx: px() }),
  z.strictObject({ shape: z.literal("arc"), radiusPx: px(), angleDeg: z.number().min(1).max(360) }),
]);
export type Hitbox = z.infer<typeof hitbox>;
export type HitboxShape = Hitbox["shape"];

/** A chance in percent; omitted means the move's original effect chance (100 when that is 0). */
const chance = percent().optional();

export const effect = z.discriminatedUnion("kind", [
  /** Damage from the move's power; the optional fields replace it for variable or fixed-damage moves. */
  z.strictObject({
    kind: z.literal("damage"),
    power: int(1, 255).optional(),
    fixed: int(1, 999).optional(),
    /** Damage equal to the user's level (Night Shade). */
    level: z.literal(true).optional(),
    /** Fraction of the target's current HP (Super Fang). */
    targetHpFraction: fraction().optional(),
  }),
  /** Fills the target's bar of that status by `chance`; full (100), the status sets in. */
  z.strictObject({ kind: z.literal("status"), status: z.enum(STATUS_IDS), chance }),
  z.strictObject({ kind: z.literal("stages"), target: z.enum(["self", "target"]), stat: z.enum(STAGE_KEYS), delta: int(-6, 6), chance }),
  z.strictObject({ kind: z.literal("heal"), fraction: fraction() }),
  /** Fraction of the damage dealt that the user takes. */
  z.strictObject({ kind: z.literal("recoil"), fraction: fraction() }),
  /** Fraction of the damage dealt that the user recovers. */
  z.strictObject({ kind: z.literal("drain"), fraction: fraction() }),
  /** Interrupts the target's cast. */
  z.strictObject({ kind: z.literal("flinch"), chance }),
  /** Extra push on top of the normal knockback (Roar, Whirlwind). */
  z.strictObject({ kind: z.literal("knockback"), px: px() }),
  z.strictObject({ kind: z.literal("weather"), weather: z.enum(WEATHERS) }),
  /** Clears the stat stages of every combatant hit (Haze). */
  z.strictObject({ kind: z.literal("reset-stages") }),
]);
export type Effect = z.infer<typeof effect>;

const params = {
  rangePx: px().optional(),
  hitbox: hitbox.optional(),
  castS: seconds(5).optional(),
  /** Block C: replaces a special move's cooldown from its power. */
  cooldownS: seconds(60).optional(),
  /** Projectile and dash speed, per second. */
  speedPx: px().optional(),
  /** Hits per target per use. */
  hits: int(1, 10).optional(),
  /** Lifetime of a field. */
  durationS: seconds(120).optional(),
  /** Whether the user can move while casting. */
  rooted: z.boolean().optional(),
  /** Extra critical-hit stages (Slash, Razor Leaf). */
  critStage: int(0, 4).optional(),
};

export const archetypeRecord = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  behavior: z.enum(BEHAVIORS),
  defaults: z.strictObject(params),
});
export type ArchetypeRecord = z.infer<typeof archetypeRecord>;

export const moveMappingRecord = z.strictObject({
  /** The move id in the extracted moves.json. */
  id: id(),
  archetype: z.string(),
  ...params,
  effects: z.array(effect),
});
export type MoveMappingRecord = z.infer<typeof moveMappingRecord>;
export type MoveParams = Omit<MoveMappingRecord, "id" | "archetype" | "effects">;

export const statusRecord = z
  .strictObject({
    id: z.enum(STATUS_IDS),
    durationS: z.strictObject({ min: seconds(120), max: seconds(120) }),
    /** Period of tick damage and thaw checks. */
    intervalS: seconds(30).optional(),
    /** Fraction of max HP lost each interval; toxic multiplies it by the interval count. */
    tickDamage: fraction().optional(),
    toxic: z.boolean().optional(),
    attackMul: fraction().optional(),
    speedMul: fraction().optional(),
    immobile: z.boolean().optional(),
    /** Chance that a move fails to come out (paralysis). */
    skipMove: percent().optional(),
    /** Chance to thaw each interval. */
    thaw: percent().optional(),
    /** Chance that a move goes off in a wrong direction, up to deviationDeg away (confusion). */
    misdirect: percent().optional(),
    deviationDeg: z.number().min(0).max(180).optional(),
    /** Types that cannot get this status, by type id. */
    immuneTypes: z.array(int(0, 17)),
  })
  .superRefine((s, ctx) => {
    if (s.durationS.max < s.durationS.min) ctx.addIssue({ code: "custom", path: ["durationS", "max"], message: "max não pode ser menor que min" });
  });
export type StatusRecord = z.infer<typeof statusRecord>;

export const combatTuning = z.strictObject({
  /** Speed stat between low and high maps linearly to the move speed range and to the dodge and parry cooldown, slow to fast. */
  speed: z.strictObject({ low: int(1, 999), high: int(1, 999), moveMinPx: px(), moveMaxPx: px(), reflexSlowS: seconds(60), reflexFastS: seconds(60) }),
  /** 1/n chance of a critical hit for crit stages 0 to 4. */
  critChances: z.array(int(1, 64)).length(5),
  /** HP of a boss (a wild legendary, the last Pokémon of one of BOSS_TRAINERS), times its own. */
  bossHpMul: z.number().min(1).max(10),
  knockbackPx: px(),
  flashS: seconds(5),
  /** Radius of every combatant's body. */
  bodyRadiusPx: px(),
  /** Block C (docs/roadmap/combate.md): normal and special moves, combos, dodge, parry and guard. */
  action: z.strictObject({
    /** Casts of the 1st, 2nd and 3rd normal move of a chain; after the 3rd it starts over. */
    normalCastS: z.array(seconds(5)).length(3),
    /** The first of a chain waits this long when it reaches nobody. */
    normalMissCooldownS: seconds(10),
    /** No special comes out faster (charge moves keep a longer cast of their own). */
    specialCastS: seconds(5),
    /** baseS + (power − 80)·perPowerS, at most maxS; status, fixed and variable damage take baseS. */
    specialCooldown: z.strictObject({ baseS: seconds(60), perPowerS: z.number().min(0).max(1), maxS: seconds(60) }),
    /** Damage of normal moves, as a share of the formula's. */
    normalDamageMul: fraction(),
    /** Farthest a contact move leaps at its target once charged, and how fast (px per second). */
    leapMaxPx: px(),
    leapSpeedPx: int(1, 2048),
    /** Hits within windowS of the last one add stepMul damage each, up to max of them. */
    combo: z.strictObject({ windowS: seconds(10), stepMul: fraction(), max: int(0, 100) }),
    dodgeInvulnS: seconds(5),
    /** The parry's pose: standing still, white. A normal move is parried by a press while it is cast, whatever the pose's length. */
    parryPoseS: seconds(5),
    /** How long the clients mark a Pokémon as parried. */
    parryMarkS: seconds(5),
    /** A parried attacker is stunned this long, or until hit; that hit deals stunBonusMul more. */
    stunS: seconds(10),
    stunBonusMul: fraction(),
    /** How far the parried attacker is knocked back, away from the parrier. */
    parryPushPx: px(),
    /** Invulnerable after a parry, so a second attacker cannot punish it at once. */
    parryInvulnS: seconds(5),
    /**
     * Parry, guard and dodge are judged by what the player's screen showed, at most this long ago; a contact on a
     * player's Pokémon waits for presses that may still arrive. 0 judges them as they arrive.
     */
    lagMaxS: seconds(1),
    /** Share of a normal move's damage the guard takes away; specials go through. */
    guardReduction: fraction(),
  }),
});
export type CombatTuning = z.infer<typeof combatTuning>;

export const COMBAT_FORMAT_VERSION = 1;

export const combatSchemas = {
  archetypes: fileSchema("archetypes", archetypeRecord),
  moves: fileSchema("combat-moves", moveMappingRecord),
  statuses: fileSchema("statuses", statusRecord),
  tuning: z.strictObject({ kind: z.literal("combat-tuning"), formatVersion: z.literal(COMBAT_FORMAT_VERSION), value: combatTuning }),
  coverage: z.strictObject({
    kind: z.literal("combat-coverage"),
    formatVersion: z.literal(COMBAT_FORMAT_VERSION),
    source: z.string(),
    /** Move ids, increasing. */
    moves: z.array(id()),
  }),
} as const;

export type CombatFileKind = keyof typeof combatSchemas;
export type CombatFileOf<K extends CombatFileKind> = z.output<(typeof combatSchemas)[K]>;

const codec = createGameDataCodec(combatSchemas);
export const parseCombatFile = codec.parseGameDataFile;
export const parseCombatJson = codec.parseGameDataJson;
export const serializeCombatFile = codec.serializeGameDataFile;
