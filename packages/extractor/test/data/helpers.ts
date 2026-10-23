import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { GAME_DATA_FILES, type GameDataFileOf, type GameDataKind, parseGameDataJson } from "@soulsilver/shared/game-data";
import type { ExpectedCounts } from "../../src/data/report.ts";
import { createDataStages } from "../../src/data/stages.ts";
import { createRegistry } from "../../src/pipeline/registry.ts";
import { runPipeline, type RunArgs, type RunResult } from "../../src/pipeline/run.ts";
import type { Stage } from "../../src/pipeline/stage.ts";
import { type SyntheticInputs, syntheticInputs, syntheticInputStages } from "../fixtures/game-data/builders.ts";
import { memoryLogger, type Sandbox } from "../pipeline/helpers.ts";

/** Stages that stand in for rom-unpack/code-decompress plus the real data stages. */
export function syntheticStages(inputs: SyntheticInputs, data: readonly Stage[] = createDataStages(inputs.layout)): Stage[] {
  return [...syntheticInputStages(inputs), ...data];
}

/** Runs the synthetic world through the real pipeline in `box`. */
export async function extractSynthetic(
  box: Sandbox,
  options: { inputs?: SyntheticInputs; stages?: Stage[]; run?: Partial<RunArgs> } = {},
): Promise<{ result: RunResult; inputs: SyntheticInputs; stages: Stage[] }> {
  const inputs = options.inputs ?? syntheticInputs();
  const stages = options.stages ?? syntheticStages(inputs);
  const result = await runPipeline({
    workspaceDir: box.workspaceDir,
    romPath: box.romPath,
    registry: createRegistry(stages),
    log: memoryLogger(),
    references: [box.romSha1],
    ...options.run,
  });
  if (result.status !== "completed") throw new Error(`pipeline did not complete: ${JSON.stringify(result)}`);
  return { result, inputs, stages };
}

export function dataFilePath(box: Sandbox, kind: GameDataKind): string {
  const { stage, file } = GAME_DATA_FILES[kind];
  return join(box.workspaceDir, "stages", stage, "json", file);
}

/** Reads and validates one generated file. */
export async function readData<K extends GameDataKind>(box: Sandbox, kind: K): Promise<GameDataFileOf<K>> {
  const text = await readFile(dataFilePath(box, kind), "utf8");
  const result = parseGameDataJson(kind, text, GAME_DATA_FILES[kind].file);
  if (!result.ok) throw new Error(`${result.error.file} ${result.error.path}: ${result.error.problem}`);
  return result.data;
}

/** Counts that match what `syntheticInputs()` produces. */
export const SYNTHETIC_EXPECTED_COUNTS: ExpectedCounts = {
  species: 6,
  forms: 2,
  moves: 8,
  abilities: 3,
  items: 8,
  tms: 92,
  hms: 8,
  tutors: 3,
  natures: 25,
  types: 18,
  growthRates: 6,
  learnsets: 8,
};
