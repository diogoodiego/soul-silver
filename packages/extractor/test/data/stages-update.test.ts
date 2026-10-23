import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRegistry } from "../../src/pipeline/registry.ts";
import { runPipeline } from "../../src/pipeline/run.ts";
import type { Stage } from "../../src/pipeline/stage.ts";
import { syntheticInputs } from "../fixtures/game-data/builders.ts";
import { memoryLogger, sandbox, type Sandbox } from "../pipeline/helpers.ts";
import { extractSynthetic, syntheticStages } from "./helpers.ts";

// SC-005: an update that changes one data stage re-extracts only it and what depends on it.

let box: Sandbox;
const inputs = syntheticInputs();
beforeEach(async () => {
  box = await sandbox();
  await extractSynthetic(box, { inputs });
});
afterEach(async () => {
  await box.cleanup();
});

async function rerun(bump: string) {
  const stages: Stage[] = syntheticStages(inputs).map((s) => (s.id === bump ? { ...s, version: 2 } : s));
  return runPipeline({
    workspaceDir: box.workspaceDir,
    romPath: box.romPath,
    registry: createRegistry(stages),
    log: memoryLogger(),
    references: [box.romSha1],
  });
}

describe("re-extraction after an update", () => {
  it("re-runs only data-moves when its version changes", async () => {
    const result = await rerun("data-moves");
    expect(result).toMatchObject({ status: "completed", ran: ["data-moves"] });
    if (result.status === "completed") {
      expect(result.skipped.sort()).toEqual([
        "code-decompress", "data-evolutions", "data-items", "data-learnsets", "data-species", "data-tables", "rom-unpack",
      ]);
    }
  });

  it("re-runs only data-species when its version changes", async () => {
    expect(await rerun("data-species")).toMatchObject({ ran: ["data-species"] });
  });

  it("re-runs the stages that read the code when code-decompress changes, and nothing that does not", async () => {
    const result = await rerun("code-decompress");
    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect([...result.ran].sort()).toEqual(["code-decompress", "data-items", "data-learnsets", "data-tables"]);
      expect(result.skipped).toEqual(expect.arrayContaining(["data-species", "data-moves", "data-evolutions"]));
    }
  });

  it("does nothing when no version changed", async () => {
    const stages = syntheticStages(inputs);
    const result = await runPipeline({
      workspaceDir: box.workspaceDir,
      romPath: box.romPath,
      registry: createRegistry(stages),
      log: memoryLogger(),
      references: [box.romSha1],
    });
    expect(result).toMatchObject({ status: "completed", ran: [] });
  });
});
