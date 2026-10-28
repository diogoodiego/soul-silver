import { z } from "zod";
import { createGameDataCodec } from "../game-data/parse.ts";

// Hand-written trainer battle data in content/trainer/ (spec 022, contracts/content-trainer.md):
// how the original AI flags and trainer classes turn into a combat profile, plus the battle tuning.

const fraction = () => z.number().min(0).max(1);
const profileId = () => z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

const switchRules = z.strictObject({
  enabled: z.boolean(),
  /** Switch out when the foe's best move type hits the active Pokémon at least this hard. */
  typeThreshold: z.union([z.literal(1), z.literal(2), z.literal(4)]),
  hpThreshold: fraction(),
  cooldownS: z.number().min(0).max(600),
});
const itemRules = z.strictObject({ enabled: z.boolean(), hpThreshold: fraction() });

const trainerProfileSchema = z.strictObject({ combat: profileId(), switch: switchRules, item: itemRules });
export type TrainerProfile = z.infer<typeof trainerProfileSchema>;

/** Changes one class or one flag bit makes to the profile; missing fields keep what was there. */
const profilePatch = z.strictObject({ combat: profileId().optional(), switch: switchRules.partial().optional(), item: itemRules.partial().optional() });
export type ProfilePatch = z.infer<typeof profilePatch>;

export const aiFlagsTable = z.strictObject({
  /** By bit index (0 to 31) of TrainerRecord.aiFlags. */
  bits: z.record(z.string().regex(/^([0-9]|[12][0-9]|3[01])$/), profilePatch.extend({ name: z.string().min(1) })),
});
export type AiFlagsTable = z.infer<typeof aiFlagsTable>;

export const classProfiles = z.strictObject({
  default: trainerProfileSchema,
  /** By trainer class id. */
  classes: z.record(z.string().regex(/^\d+$/), profilePatch),
});
export type ClassProfiles = z.infer<typeof classProfiles>;

export const trainerTuning = z.strictObject({
  arenaRadiusTiles: z.number().min(2).max(32),
  /** How often idle trainers look for players. */
  sightHz: z.number().min(1).max(20),
  /** Trainers farther than this from every player do not look. */
  activationTiles: z.number().min(1).max(64),
  /** Defeated trainer t is flag trainerFlagBase + t. */
  trainerFlagBase: z.number().int().min(1).max(0xffff),
  /** The "!" before the trainer walks. */
  alertS: z.number().min(0).max(5),
  /** Walking time per tile of the approach. */
  approachSPerTile: z.number().min(0).max(2),
  /** The battle waits for the player to close the challenge line, at most this long. */
  challengeTimeoutS: z.number().min(0).max(600),
  /** The trainer's Pokémon stands still this long while an item is used on it. */
  itemUseS: z.number().min(0).max(10),
  /** The next Pokémon comes out this long after one faints, or after a switch is decided. */
  sendOutS: z.number().min(0).max(10),
  /** The original's lines when a ball is thrown in a trainer battle, as "bank:line" text ids. */
  ballRefusal: z.array(z.string().regex(/^\d{4}:\d+$/)).min(1),
});
export type TrainerTuning = z.infer<typeof trainerTuning>;

export const TRAINER_FORMAT_VERSION = 1;

const envelope = <K extends string, T extends z.ZodType>(kind: K, value: T) =>
  z.strictObject({ kind: z.literal(kind), formatVersion: z.literal(TRAINER_FORMAT_VERSION), value });

export const trainerSchemas = {
  aiFlags: envelope("trainer-ai-flags", aiFlagsTable),
  classProfiles: envelope("trainer-class-profiles", classProfiles),
  tuning: envelope("trainer-tuning", trainerTuning),
} as const;

export type TrainerFileKind = keyof typeof trainerSchemas;

const codec = createGameDataCodec(trainerSchemas);
export const parseTrainerFile = codec.parseGameDataFile;
