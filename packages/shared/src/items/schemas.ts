import { z } from "zod";
import { int } from "../game-data/common.ts";
import { createGameDataCodec } from "../game-data/parse.ts";
import { PLACES } from "../companion/schemas.ts";
import { STATUS_IDS } from "../combat/schemas.ts";

// Hand-written item data (spec 027, data-model.md): the use and hold effects the extracted bytes do not
// say on their own, and the real-time tuning of item use. Same envelope and error format as the field data.

/** What using an item does. Medicine, berries, balls and machines get theirs from the extracted record (effects.ts). */
export const USE_ARCHETYPES = ["heal", "revive", "cure", "pp-ether", "pp-up", "rare-candy", "evolve", "battle-stat", "ball", "teach", "repel", "escape-rope", "none"] as const;
export type UseArchetype = (typeof USE_ARCHETYPES)[number];
/** Why an item has no use of its own: sold, used by a script or the field, or out of scope (mail, accessories). */
export const PASSIVE_REASONS = ["sell", "key", "evolution", "outside-combat", "mail", "out-of-scope"] as const;
/** When a held item acts. */
export const HELD_TRIGGERS = ["hp-threshold", "cure", "regen", "type-boost", "damage-mul", "speed-mul", "survive", "crit", "quick", "cooldown-restore", "none"] as const;
export type HeldTrigger = (typeof HELD_TRIGGERS)[number];
/** Status ids of content/combat/statuses.json. */
const STATUS = z.enum(STATUS_IDS);
const itemId = () => z.string().regex(/^\d+$/, "id de item não numérico");
const fraction = () => z.number().positive().max(1);
const seconds = () => z.number().nonnegative().max(600);

const useEffect = z.discriminatedUnion("archetype", [
  /** Black Flute has no level filter: it only thins the spawns. */
  z.strictObject({ archetype: z.literal("repel"), levelFilter: z.boolean() }),
  z.strictObject({ archetype: z.literal("escape-rope") }),
  z.strictObject({ archetype: z.literal("none"), reason: z.enum(PASSIVE_REASONS) }),
]);
export type ExplicitUseEffect = z.infer<typeof useEffect>;

const heldEffect = z.discriminatedUnion("trigger", [
  /** `amount`: the item's parameter as HP, as a percent of max HP, or as 1/parameter of max HP. */
  z.strictObject({ trigger: z.literal("hp-threshold"), below: fraction(), amount: z.enum(["flat", "percent", "fraction"]) }),
  z.strictObject({ trigger: z.literal("cure"), statuses: z.array(STATUS).min(1) }),
  z.strictObject({ trigger: z.literal("regen"), fraction: fraction() }),
  /** Moves of `type` deal 1 + parameter/100 times the damage. */
  z.strictObject({ trigger: z.literal("type-boost"), type: int(0, 17) }),
  z.strictObject({
    trigger: z.literal("damage-mul"),
    mul: z.number().positive().max(4),
    category: z.enum(["physical", "special"]).optional(),
    superEffectiveOnly: z.boolean().optional(),
    /** Life Orb: this fraction of max HP is lost on every hit dealt. */
    recoil: fraction().optional(),
  }),
  z.strictObject({ trigger: z.literal("speed-mul"), mul: z.number().positive().max(4) }),
  /** Focus Sash survives at full HP and is used up; Focus Band survives with the item's parameter as percent chance. */
  z.strictObject({ trigger: z.literal("survive"), fullHpOnly: z.boolean(), consumed: z.boolean() }),
  z.strictObject({ trigger: z.literal("crit"), stages: int(1, 4) }),
  /** Quick Claw: the item's parameter is the percent chance a move's cooldown is halved. */
  z.strictObject({ trigger: z.literal("quick") }),
  /** Leppa Berry: when every move is cooling down, each gets `seconds` off, once. */
  z.strictObject({ trigger: z.literal("cooldown-restore"), seconds: seconds() }),
  z.strictObject({ trigger: z.literal("none"), reason: z.enum(PASSIVE_REASONS) }),
]);
export type HeldEffect = z.infer<typeof heldEffect>;

export const itemEffects = z.strictObject({
  /** Item id → use effect, for items whose extracted record does not say it; overrides the derived one. */
  use: z.record(itemId(), useEffect),
  /** Hold-effect id (the extracted `holdEffect.id`) → what it does in real time. */
  held: z.record(z.string().regex(/^\d+$/), heldEffect),
});
export type ItemEffects = z.infer<typeof itemEffects>;

const timing = z.strictObject({ useS: seconds(), cooldownS: seconds() });

export const itemTuning = z.strictObject({
  /** Combat use: how long the trainer takes, and the wait before the next item (research R3). */
  combat: z.strictObject({ heal: timing, revive: timing, cure: timing, "pp-ether": timing, "battle-stat": timing }),
  /** Whether the Pokémon stands still while its trainer uses an item. */
  lockMovement: z.boolean(),
  /** PP Up (block C): a special's cooldown shrinks by perLevel per use. */
  ppUp: z.strictObject({ perLevel: z.number().positive().max(1), max: int(1, 3) }),
  /** Repel item id → its duration in steps, and the time of one step on foot (research R9). */
  repel: z.strictObject({ steps: z.record(itemId(), int(1, 1000)), stepS: z.number().positive().max(2), density: fraction() }),
  dowsing: z.strictObject({ radiusTiles: int(1, 64), everyMs: int(50, 5000) }),
  /** Berry Pots: what a ripe plant yields (the original's yield depends on watering, not modeled). */
  berryYield: z
    .tuple([int(1, 20), int(1, 20)])
    .refine(([min, max]) => min <= max, "produção mínima maior que a máxima"),
  /** Days Kurt takes to make the balls. */
  kurtDays: int(0, 7),
  /** Apricorn colour (0 red … 6 black) → the ball Kurt makes from it. */
  apricornBalls: z.array(int(1, 0xffff)).length(7),
  /** Seconds between two Leftovers-style heals. */
  regenS: z.number().positive().max(10),
});
export type ItemTuning = z.infer<typeof itemTuning>;

/** What the companion finds (spec 027, US6): per place, every `everyS` seconds, one of the items by weight. */
export const companionFinds = z.strictObject({
  everyS: z.number().positive().max(3600),
  /** Percent chance a find happens when the time comes. */
  chance: int(1, 100),
  places: z.partialRecord(z.enum(PLACES), z.array(z.strictObject({ item: int(1, 0xffff), weight: int(1, 100) })).min(1)),
});
export type CompanionFinds = z.infer<typeof companionFinds>;

export const ITEMS_FORMAT_VERSION = 1;

const envelope = <K extends string, T extends z.ZodType>(kind: K, value: T) =>
  z.strictObject({ kind: z.literal(kind), formatVersion: z.literal(ITEMS_FORMAT_VERSION), value });

export const itemSchemas = {
  effects: envelope("item-effects", itemEffects),
  tuning: envelope("item-tuning", itemTuning),
  finds: envelope("companion-finds", companionFinds),
} as const;

export type ItemFileKind = keyof typeof itemSchemas;

const codec = createGameDataCodec(itemSchemas);
export const parseItemFile = codec.parseGameDataFile;
