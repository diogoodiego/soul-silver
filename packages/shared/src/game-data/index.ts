import type { z } from "zod";
import { createGameDataCodec } from "./parse.ts";
import { evolutionsFile } from "./evolutions.ts";
import { itemsFile } from "./items.ts";
import { learnsetsFile, machinesFile, tutorsFile } from "./learnsets.ts";
import { movesFile } from "./moves.ts";
import { speciesFile } from "./species.ts";
import { abilitiesFile, growthRatesFile, naturesFile, typeChartFile, typesFile } from "./tables.ts";

// Public API of @soulsilver/shared/game-data; see
// specs/004-game-data-extraction/contracts/game-data-api.md.

export {
  BATTLE_STAT_KEYS,
  GAME_DATA_FORMAT_VERSION,
  STAT_KEYS,
  TEXT_CATALOGS,
  fileSchema,
  id,
  int,
  stats,
  textRef,
  type StatKey,
} from "./common.ts";
export { createGameDataCodec, type GameDataError, type GameDataParseResult } from "./parse.ts";
export * from "./evolutions.ts";
export * from "./items.ts";
export * from "./learnsets.ts";
export * from "./moves.ts";
export * from "./species.ts";
export * from "./tables.ts";

/** One strict file schema per kind of data. */
export const gameDataSchemas = {
  species: speciesFile,
  moves: movesFile,
  types: typesFile,
  "type-chart": typeChartFile,
  natures: naturesFile,
  abilities: abilitiesFile,
  learnsets: learnsetsFile,
  machines: machinesFile,
  tutors: tutorsFile,
  evolutions: evolutionsFile,
  items: itemsFile,
  "growth-rates": growthRatesFile,
} as const;

export type GameDataKind = keyof typeof gameDataSchemas;

/** Where each kind is written: the stage that makes it and its file name inside that stage's `json` output. */
export const GAME_DATA_FILES: Record<GameDataKind, { stage: string; file: string }> = {
  species: { stage: "data-species", file: "species.json" },
  moves: { stage: "data-moves", file: "moves.json" },
  types: { stage: "data-tables", file: "types.json" },
  "type-chart": { stage: "data-tables", file: "type-chart.json" },
  natures: { stage: "data-tables", file: "natures.json" },
  abilities: { stage: "data-tables", file: "abilities.json" },
  learnsets: { stage: "data-learnsets", file: "learnsets.json" },
  machines: { stage: "data-learnsets", file: "machines.json" },
  tutors: { stage: "data-learnsets", file: "tutors.json" },
  evolutions: { stage: "data-evolutions", file: "evolutions.json" },
  items: { stage: "data-items", file: "items.json" },
  "growth-rates": { stage: "data-tables", file: "growth-rates.json" },
};

export type GameDataFileOf<K extends GameDataKind> = z.output<(typeof gameDataSchemas)[K]>;

const codec = createGameDataCodec(gameDataSchemas);
export const parseGameDataFile = codec.parseGameDataFile;
export const parseGameDataJson = codec.parseGameDataJson;
export const serializeGameDataFile = codec.serializeGameDataFile;
