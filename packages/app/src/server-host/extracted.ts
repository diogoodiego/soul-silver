import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEventsJson } from "@soulsilver/shared/events";
import { GAME_DATA_FILES, parseGameDataJson, type GameDataFileOf } from "@soulsilver/shared/game-data";
import type { NewGameStart } from "@soulsilver/shared/save";

/** Where a new game starts (spec 024); undefined, with the reason logged, when the extraction lacks it. */
export function readNewGameStart(dir: string, log: (message: string) => void): NewGameStart | undefined {
  const path = join(dir, "events", "events", "new-game.json");
  if (!existsSync(path)) {
    log(`${path} ausente`);
    return undefined;
  }
  const parsed = parseEventsJson("new-game", readFileSync(path, "utf8"), path);
  if (!parsed.ok) {
    log(`${parsed.error.file}: ${parsed.error.path}: ${parsed.error.problem}`);
    return undefined;
  }
  const { map, tx, ty, facing } = parsed.data;
  return { map, tx, ty, facing };
}

/** Records of one game-data file of the extraction; throws with file, field and reason when it is missing or invalid. */
export function readExtracted<K extends "moves" | "species" | "type-chart" | "learnsets" | "evolutions" | "items" | "machines" | "tutors">(dir: string, kind: K): GameDataFileOf<K>["records"] {
  const { stage, file } = GAME_DATA_FILES[kind];
  const path = join(dir, stage, "json", file);
  const parsed = parseGameDataJson(kind, readFileSync(path, "utf8"), path);
  if (!parsed.ok) throw new Error(`${parsed.error.file}: ${parsed.error.path}: ${parsed.error.problem}`);
  return parsed.data.records;
}
