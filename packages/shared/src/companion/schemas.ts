import { z } from "zod";
import { id, int } from "../game-data/common.ts";
import { createGameDataCodec } from "../game-data/parse.ts";

// Hand-written companion data in content/companion/ (spec 014, contracts/companion-data.md). Same
// envelope and error format as the combat data (principle III).

export const PLACES = ["town", "route", "cave", "indoor"] as const;
export type Place = (typeof PLACES)[number];
export const TIMES = ["morning", "day", "night"] as const;
export type TimeOfDay = (typeof TIMES)[number];
export const EMOTIONS = ["exclaim", "question", "note", "heart", "sweat", "angry", "sleep"] as const;
export type Emotion = (typeof EMOTIONS)[number];

const tiles = () => z.number().min(0).max(64);
const seconds = () => z.number().min(0).max(60);
const friendship = () => int(0, 255);

export const followRules = z.strictObject({
  /** Trail distance between trainer and companion. */
  distanceTiles: tiles(),
  /** Farther than this from the trainer, the companion reappears behind them. */
  respawnTiles: tiles(),
  /** An overworld frame wider or taller than this marks a large Pokémon. */
  largeFramePx: int(1, 256),
  /** Species treated as large whatever their sprite (the extracted Onix frame is 32 px). */
  largeSpecies: z.array(id()),
  /** Map header ids no companion follows into. */
  restrictedMaps: z.array(id()),
});
export type FollowRules = z.infer<typeof followRules>;

const reaction = z.strictObject({ emotion: z.enum(EMOTIONS), text: id() });

export const reactionRules = z.strictObject({
  /** Text bank of the follower lines (feature 005); `text` fields index into it. */
  bank: id(),
  /** Map sections (mapsec) that count as towns; other outdoor maps are routes. */
  towns: z.array(id()),
  rules: z.array(
    reaction.extend({
      when: z.strictObject({
        place: z.enum(PLACES).optional(),
        time: z.enum(TIMES).optional(),
        friendshipMin: friendship().optional(),
        friendshipMax: friendship().optional(),
      }),
    }),
  ),
  /** Used when no rule matches. */
  fallback: reaction,
});
export type ReactionRules = z.infer<typeof reactionRules>;

export const battleRules = z.strictObject({
  combatRadiusTiles: tiles(),
  stepForwardTiles: tiles(),
  swapAnimSeconds: seconds(),
  swapCooldownSeconds: seconds(),
  /** Wild Pokémon give up a chase past this distance (read by the wild AI, spec 15). */
  chaseLimitTiles: tiles(),
  /** The trainer touching a wild Pokémon this close starts the fight, like the combat button. */
  contactTiles: tiles(),
  /** Combat ends when no foe is this close for disengageSeconds. */
  disengageTiles: tiles(),
  disengageSeconds: seconds(),
  /** Gen 4 blackout: highest party level times this base, indexed by badges (0 to 8+). */
  moneyLossBase: z.array(int(0, 9999)).length(9),
  /** Map header ids of Pokémon Centers: entering one makes it the blackout respawn point. */
  pokemonCenters: z.array(id()),
});
export type BattleRules = z.infer<typeof battleRules>;

export const COMPANION_FORMAT_VERSION = 1;

const envelope = <K extends string, T extends z.ZodType>(kind: K, value: T) =>
  z.strictObject({ kind: z.literal(kind), formatVersion: z.literal(COMPANION_FORMAT_VERSION), value });

export const companionSchemas = {
  follow: envelope("companion-follow", followRules),
  reactions: envelope("companion-reactions", reactionRules),
  "battle-rules": envelope("companion-battle-rules", battleRules),
} as const;

export type CompanionFileKind = keyof typeof companionSchemas;

const codec = createGameDataCodec(companionSchemas);
export const parseCompanionFile = codec.parseGameDataFile;
