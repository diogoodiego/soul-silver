import { z } from "zod";
import { stats } from "../game-data/common.ts";
import { PLAYER_NAME_MAX } from "../game/limits.ts";

// A player's save (spec 012, contracts/save-file.md). Progress fields (flags, party, items) join
// in later features, each with a migration.

export const SAVE_SCHEMA_VERSION = 18;

/** Seals of one kind the Seal Case holds (the Moomoo farm's "Seal Case is full" at 99). */
export const SEAL_MAX = 99;
/** Seal kinds, ids 1 to 80. */
export const SEAL_KINDS = 80;

/** Photos Cameron's album holds (PhotoAlbumIsFull). */
export const PHOTO_ALBUM_MAX = 36;

/** The story revision new saves get (spec 024); a lower one marks a save whose story state predates it. */
export const STORY_REV = 1;

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
  /** Spec 024: absent shows the species' name; 10 characters, as the original's POKEMON_NAME_LENGTH. */
  nickname: z.string().min(1).max(10).optional(),
  /** Absent means not shiny (spec 015). */
  shiny: z.boolean().optional(),
  /** Total experience; the level follows it on the species' growth curve. */
  experience: z.number().int().nonnegative(),
  ivs: stats(0, 31),
  evs: stats(0, 255).refine((evs) => Object.values(evs).reduce((a, b) => a + b, 0) <= 510, "mais de 510 EVs"),
  /** Gen 4 nature id: 0 Hardy … 24 Quirky. */
  nature: z.number().int().min(0).max(24),
  /** Spec 027: the item it holds; absent holds nothing. */
  held: z.number().int().min(1).max(0xffff).optional(),
  /** Spec 027: PP Ups used on each move slot (0 to 3); absent is none. */
  ppUps: z.array(z.number().int().min(0).max(3)).max(4).optional(),
  /** Spec 029: absent for a genderless species, and on members from before v13 until the server rolls one on join. */
  gender: z.enum(["male", "female"]).optional(),
  /** Spec 029: an egg, with the egg cycles left before it hatches; it never fights. */
  egg: z.strictObject({ cycles: z.number().int().min(0).max(255) }).optional(),
  /** Spec 030.2: ribbon ids (0 to 79) the member holds (MonHasRibbon, GiveRibbon); absent is none. */
  ribbons: z.array(z.number().int().min(0).max(79)).refine((l) => new Set(l).size === l.length, "fita repetida").optional(),
  /** Item 030.10: the in-game trade (npc-trades.json id) it came from; absent for the player's own. */
  trade: z.number().int().min(0).max(255).optional(),
  /** Item 030.10: it holds the mail the trainer of this in-game trade wrote (Kenya's Spearow); absent for no such mail. */
  mail: z.number().int().min(0).max(255).optional(),
});
export type PartyMember = z.infer<typeof partyMember>;

/** Spec 029.2: a member that can be sent out: not an egg, and with HP left. */
export const canFight = (m: PartyMember): boolean => !m.egg && m.hp > 0;

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
export const newProgress = () => ({ party: [] as PartyMember[], money: 3000, badgeSet: 0, flyPoints: [] as string[], respawn: null, phone: newPhone(), daycare: [] as DaycareSave, daycareEgg: false, eggWalk: 0, photos: [] as Photo[], ...newItemState() });

/** Spec 027: an empty Apricorn Box, no tree picked, empty Berry Pots, nothing with Kurt, no Repel. */
export const newItemState = (): ItemState => ({ apricorns: [0, 0, 0, 0, 0, 0, 0], apricornTrees: { day: "", trees: [] }, berryPots: [null, null, null, null], kurt: null, repel: null });

const dayKey = () => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dia fora do formato AAAA-MM-DD");
export const itemState = z.strictObject({
  /** Apricorn Box (item 468): how many of each colour, 0 red … 6 black. */
  apricorns: z.array(z.number().int().min(0).max(99)).length(7),
  /** Apricorn trees picked on `day` (AnimApricornTree); a new day empties the list. */
  apricornTrees: z.strictObject({ day: z.union([dayKey(), z.literal("")]), trees: z.array(z.number().int().min(0).max(63)).refine(unique, "árvore repetida") }),
  /** Berry Pots (item 470): four pots, each empty or growing a berry since `plantedAt`. */
  berryPots: z.array(z.strictObject({ berry: z.number().int().min(149).max(212), plantedAt: z.iso.datetime() }).nullable()).length(4),
  /** Apricorns Kurt took to make into balls, and the day he took them. */
  kurt: z.strictObject({ apricorn: z.number().int().min(0).max(6), count: z.number().int().min(1).max(99), given: dayKey() }).nullable(),
  /** The Repel (or Black Flute) in effect, until `endsAt` on the session clock. */
  repel: z.strictObject({ item: z.number().int().min(1).max(0xffff), endsAt: z.iso.datetime() }).nullable(),
});
export type ItemState = z.infer<typeof itemState>;

/** The Pokégear phone (spec 026): no number registered, no rematch sought, no call waiting. */
export const newPhone = (): PhoneSave => ({ contacts: [], seeking: [], called: [], pending: [], log: [] });

const contactId = () => z.number().int().min(0).max(74);
const phoneSave = z
  .strictObject({
    /** Registered numbers, in the order they were registered. */
    contacts: z.array(contactId()).refine(unique, "contato repetido"),
    /** Contacts that asked for a rematch (PhoneRematch.seeking): the next battle with them is the rematch team. */
    seeking: z.array(contactId()).refine(unique, "contato repetido"),
    /** Who already made a random call this round; the round ends when all of a tier have (save_misc.c). */
    called: z.array(contactId()).refine(unique, "contato repetido"),
    /** Story calls still to be delivered (SetPhoneCall); random calls are never saved. */
    pending: z.array(z.strictObject({ caller: contactId(), call: z.number().int().min(0).max(0xffff) })).max(8),
    /** The last calls, oldest first, for the phone screen. */
    log: z.array(z.strictObject({ contact: contactId(), direction: z.enum(["in", "out"]), at: z.iso.datetime() })).max(20),
  })
  .refine((p) => p.seeking.every((id) => p.contacts.includes(id)), { path: ["seeking"], message: "revanche de número não registrado" });
export type PhoneSave = z.infer<typeof phoneSave>;

/** Spec 029: the Pokémon left at the Route 34 Day Care and the steps each walked since (DaycareMon). */
/** A photo Cameron took (CameronPhoto): where (map and the script's photo spot), the party's species, and when. */
const photo = z.strictObject({ map: z.number().int().nonnegative(), spot: z.number().int().min(0).max(0xffff), species: z.array(species()).max(6), takenAt: z.iso.datetime() });
const daycare = z.array(z.strictObject({ mon: partyMember, steps: z.number().int().nonnegative() })).max(2);
export type DaycareSave = z.infer<typeof daycare>;

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
  /** Badges earned (spec 025): bit i is badge i, in the original numbering (0 Zephyr … 15 Earth). */
  badgeSet: z.number().int().min(0).max(0xffff),
  /** Fly points visited (spec 025): area ids, no repeats. */
  flyPoints: z.array(z.string().min(1)).refine((l) => new Set(l).size === l.length, "ponto de voo repetido"),
  /** Last Pokémon Center entered: the blackout respawn point; null means home. */
  respawn: z.strictObject({ area: z.string().min(1), x: z.number().finite(), y: z.number().finite() }).nullable(),
  /** The way out of a cave (spec 025): the last spot outdoors, where Dig and the Escape Rope lead; absent in older v9 saves. */
  escape: z
    .strictObject({ area: z.string().min(1), x: z.number().finite(), y: z.number().finite(), facing: z.enum(["north", "south", "east", "west"]) })
    .nullable()
    .optional(),
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
  /** The rival's name (spec 024); empty until the story asks for it (NameRival). */
  rivalName: z.string().max(PLAYER_NAME_MAX),
  /** Below STORY_REV the save's story state predates the original new-game state (spec 024). */
  storyRev: z.number().int().nonnegative(),
  /** The Pokégear phone (spec 026). */
  phone: phoneSave,
  ...itemState.shape,
  /** The Day Care (spec 029). */
  daycare,
  /** Spec 029: the Day Care man holds an egg for the player (Save_Daycare_HasEgg). */
  daycareEgg: z.boolean(),
  /** Spec 029.4: px walked in the current egg cycle (a cycle is 255 steps of 16 px). */
  eggWalk: z.number().min(0).lt(255 * 16),
  /** Spec 030.2: Cameron's photo album (CameronPhoto), oldest first. */
  photos: z.array(photo).max(PHOTO_ALBUM_MAX),
  /**
   * Item 031.2: Raikou (0) and Entei (1) roaming for this player (CreateRoamer): the route each is on, and the HP and
   * major status the last encounter left (absent HP is full). Caught or knocked out, it is gone. Absent is none.
   */
  roamers: z
    .array(
      z.strictObject({
        id: z.number().int().min(0).max(3),
        area: z.string().min(1),
        hp: z.number().int().min(1).optional(),
        status: z.enum(["burn", "poison", "toxic", "paralysis", "sleep", "freeze"]).optional(),
      }),
    )
    .max(4)
    .refine((l) => unique(l.map((r) => r.id)), "errante repetido")
    .optional(),
  /** Item 031.7: the Seal Case, how many of each seal (id 1 to 80, the seal-names bank) it holds. Absent is empty. */
  seals: z.record(z.string().regex(/^([1-9]|[1-7]\d|80)$/), z.number().int().min(1).max(SEAL_MAX)).optional(),
});
export type Save = z.infer<typeof saveSchema>;
export type Photo = z.infer<typeof photo>;
