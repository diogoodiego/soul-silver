import { readFile } from "node:fs/promises";
import { GAME_DATA_FILES, type GameDataKind } from "@soulsilver/shared/game-data";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readManifest } from "../../src/pipeline/manifest.ts";
import { syntheticInputs } from "../fixtures/game-data/builders.ts";
import { memoryLogger, sandbox, type Sandbox } from "../pipeline/helpers.ts";
import { dataFilePath, extractSynthetic } from "./helpers.ts";

// SC-003: extracting the same ROM twice gives byte-identical data files.

let first: Sandbox;
let second: Sandbox;
beforeAll(async () => {
  first = await sandbox();
  second = await sandbox();
  await extractSynthetic(first, { inputs: syntheticInputs() });
  await extractSynthetic(second, { inputs: syntheticInputs() });
});
afterAll(async () => {
  await first.cleanup();
  await second.cleanup();
});

const kinds = Object.keys(GAME_DATA_FILES) as GameDataKind[];

describe("determinism", () => {
  it.each(kinds)("%s.json is byte-identical across extractions", async (kind) => {
    const a = await readFile(dataFilePath(first, kind));
    const b = await readFile(dataFilePath(second, kind));
    expect(a.length).toBeGreaterThan(0);
    expect(Buffer.compare(a, b)).toBe(0);
  });

  it("records the same digest for every data output in the manifests", async () => {
    const a = await readManifest(first.workspaceDir, memoryLogger());
    const b = await readManifest(second.workspaceDir, memoryLogger());
    const dataStages = Object.keys(a!.stages).filter((id) => id.startsWith("data-"));
    expect(dataStages).toHaveLength(6);
    for (const id of dataStages) expect(a!.stages[id]!.outputs).toEqual(b!.stages[id]!.outputs);
  });

  it("does not depend on the order the inputs were written in", async () => {
    const third = await sandbox();
    try {
      const inputs = syntheticInputs();
      inputs.messages = new Map([...inputs.messages].reverse());
      await extractSynthetic(third, { inputs });
      for (const kind of kinds) {
        expect(Buffer.compare(await readFile(dataFilePath(first, kind)), await readFile(dataFilePath(third, kind)))).toBe(0);
      }
    } finally {
      await third.cleanup();
    }
  });
});
