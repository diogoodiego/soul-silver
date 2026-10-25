import type { EncounterRecord } from "@soulsilver/shared/events";
import type { EvolutionRecord, LearnsetRecord, SpeciesRecord } from "@soulsilver/shared/game-data";
import { parseWildFile, type Balls, type SpawnRules, type Temperaments, type WildFileKind } from "@soulsilver/shared/wild";
import ballsJson from "../../../content/wild/balls.json" with { type: "json" };
import spawnJson from "../../../content/wild/spawn.json" with { type: "json" };
import temperamentsJson from "../../../content/wild/temperaments.json" with { type: "json" };

// Wild Pokémon data (spec 015, contracts/wild-data.md): the hand-written content/wild files plus
// the parts of the extraction they need. Any problem stops the load with file, field and reason.

export type WildContent = Record<WildFileKind, unknown>;

/** The parts of the extraction the wild Pokémon read. */
export interface ExtractedForWild {
  encounters: EncounterRecord[];
  learnsets: Pick<LearnsetRecord, "id" | "levelUp">[];
  species: Pick<SpeciesRecord, "id" | "catchRate" | "growthRate" | "baseFriendship">[];
  evolutions: Pick<EvolutionRecord, "id" | "evolutions">[];
}

export interface WildData {
  spawn: SpawnRules;
  temperaments: Temperaments;
  balls: Balls;
  encounter(id: number): EncounterRecord | undefined;
  levelUp(species: number): LearnsetRecord["levelUp"];
  catchRate(species: number): number | undefined;
  /** Growth curve and starting friendship of a new catch (spec 016). */
  species(id: number): Pick<SpeciesRecord, "growthRate" | "baseFriendship"> | undefined;
  /** Species that evolve with a Moon Stone, for the Moon Ball. */
  moonEvolvers: Set<number>;
}

const MOON_STONE = 81;

function parse<K extends WildFileKind>(kind: K, value: unknown) {
  const result = parseWildFile(kind, value, `${kind}.json`);
  if (!result.ok) throw new Error(`content/wild/${result.error.file}: ${result.error.path}: ${result.error.problem}`);
  return result.data.value;
}

export function buildWildData(content: WildContent, extracted: ExtractedForWild): WildData {
  const encounters = new Map(extracted.encounters.map((e) => [e.id, e]));
  const learnsets = new Map(extracted.learnsets.map((l) => [l.id, l.levelUp]));
  const catchRates = new Map(extracted.species.map((s) => [s.id, s.catchRate]));
  const species = new Map(extracted.species.map((s) => [s.id, s]));
  const moonEvolvers = new Set(extracted.evolutions.filter((r) => r.evolutions.some((e) => e.condition.kind === "item" && e.condition.item === MOON_STONE)).map((r) => r.id));
  return {
    spawn: parse("spawn", content.spawn) as SpawnRules,
    temperaments: parse("temperaments", content.temperaments) as Temperaments,
    balls: parse("balls", content.balls) as Balls,
    encounter: (id) => encounters.get(id),
    levelUp: (species) => learnsets.get(species) ?? [],
    catchRate: (id) => catchRates.get(id),
    species: (id) => species.get(id),
    moonEvolvers,
  };
}

/** content/wild as bundled with the app. */
export const BUNDLED_WILD_CONTENT: WildContent = { spawn: spawnJson, temperaments: temperamentsJson, balls: ballsJson };
