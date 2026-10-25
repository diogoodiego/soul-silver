import { z } from "zod";
import { stats } from "../game-data/common.ts";
import { PLAYER_NAME_MAX } from "../game/limits.ts";

// A player's save (spec 012, contracts/save-file.md). Progress fields (flags, party, items) join
// in later features, each with a migration.

export const SAVE_SCHEMA_VERSION = 4;

/** Temporary storage size for catches with a full party, until the PC exists (spec 021). */
export const STORAGE_MAX = 30;

/** A party Pokémon (spec 014, data-model.md); experience, IVs, EVs and nature from spec 016. */
export const partyMember = z.strictObject({
  species: z.number().int().min(1).max(493),
  level: z.number().int().min(1).max(100),
  moves: z.array(z.number().int().nonnegative()).min(1).max(4),
  /** 0 means fainted. */
  hp: z.number().int().nonnegative(),
  friendship: z.number().int().min(0).max(255),
  /** Absent means not shiny (spec 015). */
  shiny: z.boolean().optional(),
  /** Total experience; the level follows it on the species' growth curve. */
  experience: z.number().int().nonnegative(),
  ivs: stats(0, 31),
  evs: stats(0, 255).refine((evs) => Object.values(evs).reduce((a, b) => a + b, 0) <= 510, "mais de 510 EVs"),
  /** Gen 4 nature id: 0 Hardy … 24 Quirky. */
  nature: z.number().int().min(0).max(24),
});
export type PartyMember = z.infer<typeof partyMember>;

const memberIndex = () => z.number().int().min(0).max(5);

/** Waiting for the end of combat (spec 016, data-model.md); `member` is a party index. */
export const progressionItem = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("level-up"), member: memberIndex(), level: z.number().int().min(2).max(100) }),
  z.strictObject({ kind: z.literal("learn"), member: memberIndex(), move: z.number().int().min(1) }),
  z.strictObject({ kind: z.literal("evolve"), member: memberIndex(), into: z.number().int().min(1).max(493) }),
]);
export type ProgressionItem = z.infer<typeof progressionItem>;

const species = () => z.number().int().min(1).max(493);
const unique = (list: number[]) => new Set(list).size === list.length;

/** What a v1 save gets on migration and a new game starts with (3000 is the HGSS starting money). */
export const newProgress = () => ({ party: [] as PartyMember[], money: 3000, badges: 0, respawn: null });

/** Bag, Pokédex and temporary storage (spec 015): what a v2 save gets and a new game starts with. */
export const newCollection = () => ({ bag: [] as { item: number; count: number }[], pokedex: { seen: [] as number[], caught: [] as number[] }, storage: [] as PartyMember[] });

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
  party: z.array(partyMember).max(6),
  money: z.number().int().min(0).max(999999),
  badges: z.number().int().min(0).max(16),
  /** Last Pokémon Center entered: the blackout respawn point; null means home. */
  respawn: z.strictObject({ area: z.string().min(1), x: z.number().finite(), y: z.number().finite() }).nullable(),
  bag: z
    .array(z.strictObject({ item: z.number().int().min(1).max(0xffff), count: z.number().int().min(1).max(999) }))
    .refine((bag) => unique(bag.map((b) => b.item)), "item repetido na bolsa"),
  pokedex: z.strictObject({
    seen: z.array(species()).refine(unique, "espécie repetida"),
    caught: z.array(species()).refine(unique, "espécie repetida"),
  }),
  storage: z.array(partyMember).max(STORAGE_MAX),
  pending: z.array(progressionItem),
});
export type Save = z.infer<typeof saveSchema>;
