// Breeding at the Day Care (spec 029, items 029.2 and 029.3), as pret/pokeheartgold src/get_egg.c and
// include/constants/daycare.h: compatibility, the egg chance every 256 steps and the egg with what it inherits.
import type { EggGroupKey } from "../game-data/species.ts";
import type { Rng } from "../game/rng.ts";
import type { PartyMember } from "../save/schema.ts";

export type Gender = "male" | "female";

export interface Parent {
  species: number;
  /** Undefined for a genderless species. */
  gender: Gender | undefined;
  eggGroups: readonly EggGroupKey[];
  /** The item it holds, for the incense check. */
  held?: number | undefined;
}

const NIDORAN_F = 29;
const NIDORAN_M = 32;
const VOLBEAT = 313;
const ILLUMISE = 314;
const PHIONE = 489;
const MANAPHY = 490;
/** sIncenseMons: babies that hatch only when a parent holds their incense; else their evolution. */
const INCENSE_BABIES: Record<number, { incense: number; parent: number }> = {
  360: { incense: 255, parent: 202 }, // Wynaut, Lax Incense, Wobbuffet
  298: { incense: 254, parent: 183 }, // Azurill, Sea Incense, Marill
  439: { incense: 314, parent: 122 }, // Mime Jr., Odd Incense, Mr. Mime
  438: { incense: 315, parent: 185 }, // Bonsly, Rock Incense, Sudowoodo
  446: { incense: 316, parent: 143 }, // Munchlax, Full Incense, Snorlax
  458: { incense: 317, parent: 226 }, // Mantyke, Wave Incense, Mantine
  406: { incense: 318, parent: 315 }, // Budew, Rose Incense, Roselia
  440: { incense: 319, parent: 113 }, // Happiny, Luck Incense, Chansey
  433: { incense: 320, parent: 358 }, // Chingling, Pure Incense, Chimecho
};
const EVERSTONE = 229;
const LIGHT_BALL = 236;
const PICHU = 172;
const VOLT_TACKLE = 344;
/** SetStatIdToPowerItemStat: Power Bracer, Belt, Lens, Band, Anklet, Weight. */
const POWER_ITEMS: Record<number, (typeof STAT_KEYS)[number]> = { 289: "attack", 290: "defense", 291: "specialAttack", 292: "specialDefense", 293: "speed", 294: "hp" };

/** The gender byte of species data (MON_RATIO_*): 0 always male, 254 always female, 255 genderless. */
export function rollGender(ratio: number, rng: Rng): Gender | undefined {
  if (ratio === 255) return undefined;
  if (ratio === 0) return "male";
  if (ratio === 254) return "female";
  // GetGenderBySpeciesAndPersonality: female when the personality's low byte is below the ratio.
  return rng.nextInt(256) < ratio ? "female" : "male";
}

/** PARENTS_INCOMPATIBLE, PARENTS_LOW_COMPATIBILITY, PARENTS_MED_COMPATIBILITY, PARENTS_MAX_COMPATIBILITY. */
export const COMPATIBILITY = { incompatible: 0, low: 20, med: 50, max: 70 } as const;

const isDitto = (p: Parent) => p.eggGroups[0] === "ditto";

/**
 * ComputeCompatibilityBetweenBoxMons. The original lowers it when both have the same trainer ID; the save keeps
 * no original trainer, so every pair counts as the player's own.
 * shortcut: same trainer always; tell trainers apart when traded Pokémon keep their OT.
 */
export function compatibility(a: Parent, b: Parent): number {
  if (a.eggGroups[0] === "undiscovered" || b.eggGroups[0] === "undiscovered") return COMPATIBILITY.incompatible;
  if (isDitto(a) && isDitto(b)) return COMPATIBILITY.incompatible;
  if (isDitto(a) || isDitto(b)) return COMPATIBILITY.low;
  if (a.gender === b.gender) return COMPATIBILITY.incompatible;
  if (a.gender === undefined || b.gender === undefined) return COMPATIBILITY.incompatible;
  if (!a.eggGroups.some((g) => b.eggGroups.includes(g))) return COMPATIBILITY.incompatible;
  return a.species === b.species ? COMPATIBILITY.med : COMPATIBILITY.low;
}

/** Save_Daycare_CalcCompatibility: what GetDaycareCompatibility tells the script, 0 best to 3 incompatible. */
export function compatibilityScore(c: number): number {
  return c === COMPATIBILITY.max ? 0 : c === COMPATIBILITY.med ? 1 : c === COMPATIBILITY.low ? 2 : c === COMPATIBILITY.incompatible ? 3 : 0;
}

/** HandleDaycareStep: with two Pokémon and no egg waiting, when the second one's u8 step count is 255. */
export const eggCheckDue = (d: readonly { steps: number }[], eggWaiting: boolean): boolean => !eggWaiting && d.length === 2 && d[1]!.steps % 256 === 255;

/** An egg when the compatibility is above LCRandom() × 100 / 0xFFFF (integer division). */
export const eggRoll = (compat: number, random16: number): boolean => compat > Math.floor((random16 * 100) / 0xffff);

/** Whether `a` is the mother: the side that is not Ditto, else the female one. */
export const motherIsFirst = (a: Parent, b: Parent): boolean => (isDitto(a) ? false : isDitto(b) ? true : a.gender === "female");

/** Daycare_GetEggSpecies: the base form of the mother (the side that is not Ditto), with the original's special cases. */
export function eggSpecies(a: Parent, b: Parent, preEvolution: (species: number) => number | undefined, rng: Rng): number {
  const mother = motherIsFirst(a, b) ? a : b;
  let species = mother.species;
  for (let pre = preEvolution(species); pre !== undefined; pre = preEvolution(species)) species = pre;
  // The egg's personality decides these; its male bit is a coin flip.
  if (species === NIDORAN_F && rng.nextInt(2) === 1) species = NIDORAN_M;
  else if (species === ILLUMISE && rng.nextInt(2) === 1) species = VOLBEAT;
  else if (species === MANAPHY) species = PHIONE;
  // Daycare_BreedingIncenseCheck.
  const baby = INCENSE_BABIES[species];
  return baby && a.held !== baby.incense && b.held !== baby.incense ? baby.parent : species;
}

export interface BreedingData {
  levelUp(species: number): readonly { level: number; move: number }[];
  eggMoves(species: number): readonly number[];
  /** The moves the species can learn from a TM or HM. */
  machineMoves(species: number): readonly number[];
  hatchCycles(species: number): number;
  genderRatio(species: number): number;
  hpMax(m: PartyMember): number;
}

const STAT_KEYS = ["hp", "attack", "defense", "speed", "specialAttack", "specialDefense"] as const;
const INHERITED_IVS = 3;
/** Friendship an egg's Pokémon has once hatched (Gen 4). */
const HATCHED_FRIENDSHIP = 120;

/** A random one of the parents holding a matching item (both: a coin flip), or undefined. */
function holder(parents: readonly PartyMember[], holds: (item: number) => boolean, rng: Rng): PartyMember | undefined {
  const all = parents.filter((p) => p.held !== undefined && holds(p.held));
  return all.length === 2 ? all[rng.nextInt(2)] : all[0];
}

/**
 * GiveEggToPlayer: a level 1 egg of `species`. Moves (InheritMoves): its level 1 moves, then the father's moves
 * that are egg moves, that it learns by machine, and the level-up moves both parents know, dropping the first when
 * full; a Pichu learns Volt Tackle when a parent holds a Light Ball. InheritIVs: three distinct IVs come from a
 * random parent each, the first forced by a held Power item; the rest are rolled. Daycare_EverstoneCheck: a parent
 * holding an Everstone (any, Ditto too) passes its nature when LCRandom() < 0x7FFF.
 * shortcut: no Masuda method, as members keep no shininess or trainer region; add it with shiny Pokémon.
 */
export function makeEgg(mother: PartyMember, father: PartyMember, species: number, data: BreedingData, rng: Rng): PartyMember {
  const moves: number[] = [];
  const add = (move: number) => {
    if (moves.includes(move)) return;
    if (moves.length === 4) moves.shift();
    moves.push(move);
  };
  const learnset = data.levelUp(species);
  for (const l of learnset) if (l.level <= 1) add(l.move);
  const eggMoves = data.eggMoves(species);
  const machines = data.machineMoves(species);
  for (const m of father.moves) if (eggMoves.includes(m)) add(m);
  for (const m of father.moves) if (machines.includes(m)) add(m);
  for (const m of father.moves) if (mother.moves.includes(m) && learnset.some((l) => l.move === m)) add(m);
  if (species === PICHU && (mother.held === LIGHT_BALL || father.held === LIGHT_BALL)) add(VOLT_TACKLE);

  const ivs = Object.fromEntries(STAT_KEYS.map((k) => [k, rng.nextInt(32)])) as PartyMember["ivs"];
  const left = [...STAT_KEYS];
  const power = holder([mother, father], (item) => item in POWER_ITEMS, rng);
  if (power) {
    const stat = POWER_ITEMS[power.held!]!;
    ivs[stat] = power.ivs[stat];
    left.splice(left.indexOf(stat), 1);
  }
  for (let i = power ? 1 : 0; i < INHERITED_IVS; i++) {
    const [stat] = left.splice(rng.nextInt(left.length), 1);
    ivs[stat!] = (rng.nextInt(2) === 0 ? mother : father).ivs[stat!];
  }
  const everstone = holder([mother, father], (item) => item === EVERSTONE, rng);
  const nature = everstone && rng.nextInt(0x10000) < 0x7fff ? everstone.nature : rng.nextInt(25);
  return eggOf(species, moves, ivs, nature, data, rng);
}

/** The egg itself (SetEggStats): level 1, its hatch cycles, a rolled gender, full HP. */
function eggOf(species: number, moves: number[], ivs: PartyMember["ivs"], nature: number, data: GiftEggData, rng: Rng): PartyMember {
  const gender = rollGender(data.genderRatio(species), rng);
  const egg: PartyMember = {
    species,
    level: 1,
    moves: moves.length > 0 ? moves : [33],
    hp: 0,
    friendship: HATCHED_FRIENDSHIP,
    experience: 0,
    ivs,
    evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 },
    nature,
    ...(gender ? { gender } : {}),
    egg: { cycles: data.hatchCycles(species) },
  };
  egg.hp = data.hpMax(egg);
  return egg;
}

export type GiftEggData = Pick<BreedingData, "levelUp" | "hatchCycles" | "genderRatio" | "hpMax">;

/**
 * Spec 029.5, ScrCmd_GiveEgg and ScrCmd_GiveTogepiEgg: SetEggStats makes a level 1 egg of `species` with its level 1
 * moves (the last four) and rolled IVs and nature; GiveTogepiEgg then puts `move` (Extrasensory) in the first empty
 * slot, or over the last when four are known.
 */
export function makeGiftEgg(species: number, data: GiftEggData, rng: Rng, move?: number): PartyMember {
  const moves = data.levelUp(species).filter((l) => l.level <= 1).map((l) => l.move).filter((m, i, all) => all.indexOf(m) === i).slice(-4);
  if (move !== undefined) moves.splice(Math.min(moves.length, 3), 1, move);
  const ivs = Object.fromEntries(STAT_KEYS.map((k) => [k, rng.nextInt(32)])) as PartyMember["ivs"];
  return eggOf(species, moves, ivs, rng.nextInt(25), data, rng);
}
