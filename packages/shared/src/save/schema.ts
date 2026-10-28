import { z } from "zod";
import { stats } from "../game-data/common.ts";
import { PLAYER_NAME_MAX } from "../game/limits.ts";

// A player's save (spec 012, contracts/save-file.md). Progress fields (flags, party, items) join
// in later features, each with a migration.

export const SAVE_SCHEMA_VERSION = 7;

/** PC boxes and slots per box, as in HGSS (spec 023). */
export const BOX_COUNT = 18;
export const BOX_SLOTS = 30;
export const BOX_NAME_MAX = 8;
/** Distinct items the PC item storage holds (HGSS). */
export const PC_ITEMS_MAX = 50;

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

/** Bag and Pokédex (spec 015): what a v2 save gets and a new game starts with. */
export const newCollection = () => ({ bag: [] as { item: number; count: number }[], pokedex: { seen: [] as number[], caught: [] as number[] } });

/** Empty PC boxes with the default names (spec 023). */
export const newBoxes = () => Array.from({ length: BOX_COUNT }, (_, i) => ({ name: `BOX ${i + 1}`, slots: Array<PartyMember | null>(BOX_SLOTS).fill(null) }));

const itemList = (max: number) =>
  z
    .array(z.strictObject({ item: z.number().int().min(1).max(0xffff), count: z.number().int().min(1).max(999) }))
    .max(max)
    .refine((list) => unique(list.map((b) => b.item)), "item repetido");

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
  bag: itemList(0xffff),
  pokedex: z.strictObject({
    seen: z.array(species()).refine(unique, "espécie repetida"),
    caught: z.array(species()).refine(unique, "espécie repetida"),
  }),
  /** PC boxes (spec 023); null is an empty slot. */
  boxes: z
    .array(z.strictObject({ name: z.string().min(1).max(BOX_NAME_MAX).refine((s) => s.trim().length > 0, "nome vazio"), slots: z.array(partyMember.nullable()).length(BOX_SLOTS) }))
    .length(BOX_COUNT),
  /** PC item storage (spec 023). */
  pcItems: itemList(PC_ITEMS_MAX),
  pending: z.array(progressionItem),
  /** Story flags that are set (spec 020); ids as the original game numbers them. */
  flags: z.array(z.number().int().min(1).max(0xffff)).refine(unique, "flag repetida"),
  /** Story variables by id (spec 020); an absent variable holds 0. */
  vars: z.record(z.string().regex(/^\d+$/, "id de variável não numérico"), z.number().int().min(0).max(0xffff)),
  /** Where events left NPCs for this player (spec 021): area id, then person id; tile coordinates. */
  npcPlacement: z.record(
    z.string().min(1),
    z.record(z.string().regex(/^\d+$/, "id de pessoa não numérico"), z.strictObject({ x: z.number().int().min(0), z: z.number().int().min(0), facing: z.enum(["north", "south", "east", "west"]) })),
  ),
});
export type Save = z.infer<typeof saveSchema>;
