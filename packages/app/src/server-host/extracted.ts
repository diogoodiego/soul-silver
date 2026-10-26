import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GAME_DATA_FILES, parseGameDataJson, type GameDataFileOf } from "@soulsilver/shared/game-data";

/** Records of one game-data file of the extraction; throws with file, field and reason when it is missing or invalid. */
export function readExtracted<K extends "moves" | "species" | "type-chart" | "learnsets" | "evolutions" | "items">(dir: string, kind: K): GameDataFileOf<K>["records"] {
  const { stage, file } = GAME_DATA_FILES[kind];
  const path = join(dir, stage, "json", file);
  const parsed = parseGameDataJson(kind, readFileSync(path, "utf8"), path);
  if (!parsed.ok) throw new Error(`${parsed.error.file}: ${parsed.error.path}: ${parsed.error.problem}`);
  return parsed.data.records;
}
