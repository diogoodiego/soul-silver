// Where the sprite graphics live in the accepted ROM. The ROM is locked by hash, so the paths
// are fixed. See specs/007-sprite-atlas/research.md R0.

export const SPRITE_ARCHIVES = {
  /** Battle graphics: 6 members per species (see battle.ts). */
  pokemonBattle: "a/0/0/4",
} as const;

/** Members per species in the battle archive. */
export const BATTLE_MEMBERS_PER_SPECIES = 6;

/** Archive of the alternative-form battle graphics (research.md R0). */
export const FORMS_ARCHIVE = "a/1/1/4";

/** Number of graphics before the first palette in the forms archive: 79 forms x (back, front). */
export const FORM_GRAPHICS = 158;

/** Overworld archive: textures (BTX0) of characters, objects and following Pokémon. */
export const OVERWORLD_ARCHIVE = "a/0/8/1";

/** The two player characters (hero, heroine): 32 frames, walking then running. */
export const OVERWORLD_PLAYERS = [69, 70] as const;

/** Characters (16 frames) live before this member; objects and 3D models follow. */
export const OVERWORLD_NPC_END = 266;

/** Field overlay table of map-event sprite id -> overworld member (spec 021): 6-byte entries ended by id 0xffff. */
export const OVERWORLD_GFX_TABLE = { overlay: 1, offset: 0x21ba8 } as const;

/** First member of the following-Pokémon block (8 frames, normal and shiny palette). */
export const OVERWORLD_POKEMON_FIRST = 297;

/**
 * Offset of the species table in the decompressed ARM9: one u16 per species (1..493). Species s
 * starts at member `OVERWORLD_POKEMON_FIRST + table[s - 1]` and owns as many entries as the
 * distance to the next value (gender and form variants).
 */
export const OVERWORLD_POKEMON_TABLE = 0xff08a;

/**
 * Species whose two entries are male then female; any other species with two or more entries
 * has forms, in form order.
 */
export const OVERWORLD_GENDER_SPLIT: ReadonlySet<number> = new Set([3, 25, 154, 202, 208, 214, 415, 443, 444, 445, 449, 450]);

/** Frame duration in ms; the files hold no timing, so these are provisional (research R0). */
export const OVERWORLD_FRAME_MS = { walk: 125, pokemon: 250 } as const;

/**
 * Forms in archive order. Each form owns a pair of graphics (back, front); `pal` is the first
 * palette pair of the group, and `shared` says that every form of the group uses that pair.
 * Verified on the ROM: the palette pairs run in this order without gaps (49 pairs), and the
 * first pair of each group equals the palette of the base species in the main archive.
 */
export const FORM_GROUPS: readonly { species: number; forms: number; pal: number; shared?: true }[] = [
  { species: 386, forms: 4, pal: 0, shared: true }, // Deoxys
  { species: 201, forms: 28, pal: 1, shared: true }, // Unown
  { species: 351, forms: 4, pal: 2 }, // Castform
  { species: 412, forms: 3, pal: 6 }, // Burmy
  { species: 413, forms: 3, pal: 9 }, // Wormadam
  { species: 422, forms: 2, pal: 12 }, // Shellos
  { species: 423, forms: 2, pal: 14 }, // Gastrodon
  { species: 421, forms: 2, pal: 16 }, // Cherrim
  { species: 493, forms: 18, pal: 18 }, // Arceus
  { species: 0, forms: 1, pal: 36 }, // Egg: no species, not extracted
  { species: 492, forms: 2, pal: 37 }, // Shaymin
  { species: 479, forms: 6, pal: 39 }, // Rotom
  { species: 487, forms: 2, pal: 45 }, // Giratina
  { species: 172, forms: 2, pal: 47 }, // Pichu (the second form is the spiky-eared one)
];

/** Pokémon icons: palette 0, then animation sets, then one graphic per icon from member 7. */
export const ICON_ARCHIVE = "a/0/2/0";
export const ICON_FIRST_MEMBER = 7;
/** u8 palette bank (0 to 2) of each icon, in the decompressed ARM9; index 0 is the "?" icon. */
export const ICON_PALETTE_TABLE = 0xffb8f;
/** Icon indices of the forms that have their own icon (form 1 and up; form 0 is the species icon). */
export const ICON_FORMS: readonly { species: number; first: number; count: number }[] = [
  { species: 386, first: 496, count: 3 }, // Deoxys: Attack, Defense, Speed
  { species: 201, first: 500, count: 27 }, // Unown: B to Z, !, ? (499 repeats the A icon)
];

/** Item icons: graphic and palette members come from the item map in the ARM9 (see the data stage). */
export const ITEM_ICON_ARCHIVE = "a/0/1/8";

/** Trainer sprites: groups of 5 members, the palette at +1 and the encrypted graphic at +4. */
export const TRAINER_ARCHIVE = "a/0/5/8";
export const TRAINER_GROUP = 5;
export const TRAINER_COUNT = 129;

/** Field effects (3D textures and models); member 25 is the tall grass rustle (kusaeff.1 to .4). */
export const FIELD_EFFECT_ARCHIVE = "a/1/0/3";
export const GRASS_EFFECT_MEMBER = 25;

/** Move animation scripts, one per move id (research: battle effects, spec 013 refinement). */
export const MOVE_SCRIPT_ARCHIVE = "a/0/1/0";

/** Particle files (SPA), referenced by the scripts. */
export const PARTICLE_ARCHIVE = "a/0/2/9";
