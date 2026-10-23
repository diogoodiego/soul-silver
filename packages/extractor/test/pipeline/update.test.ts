import { stat } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readManifest } from "../../src/pipeline/manifest.ts";
import { createRegistry } from "../../src/pipeline/registry.ts";
import { runPipeline } from "../../src/pipeline/run.ts";
import type { Stage } from "../../src/pipeline/stage.ts";
import { fakeStage } from "./fake-stage.ts";
import { memoryLogger, sandbox, type Sandbox } from "./helpers.ts";

// SC-006: an update that bumps one stage re-runs only that stage and its dependents.

let box: Sandbox;
beforeEach(async () => {
  box = await sandbox();
});
afterEach(async () => {
  await box.cleanup();
});

function run(stages: Stage[]) {
  return runPipeline({
    workspaceDir: box.workspaceDir,
    romPath: box.romPath,
    registry: createRegistry(stages),
    log: memoryLogger(),
    references: [box.romSha1],
  });
}

const stagesV = (b: number) => {
  const a = fakeStage("a");
  const stageB = fakeStage("b", { version: b, dependsOn: ["a"] });
  const c = fakeStage("c", { dependsOn: ["b"] });
  const d = fakeStage("d");
  return { a, b: stageB, c, d, all: [a, stageB, c, d] };
};

describe("update re-extraction", () => {
  it("re-runs only the bumped stage and its dependents", async () => {
    await run(stagesV(1).all);
    const before = await readManifest(box.workspaceDir, memoryLogger());
    const aFolder = await stat(join(box.workspaceDir, "stages", "a"));

    const next = stagesV(2);
    const result = await run(next.all);
    expect(result).toEqual({ status: "completed", ran: ["b", "c"], skipped: ["a", "d"] });
    expect([next.a.runs, next.b.runs, next.c.runs, next.d.runs]).toEqual([0, 1, 1, 0]);

    const after = await readManifest(box.workspaceDir, memoryLogger());
    expect(after!.stages["a"]).toEqual(before!.stages["a"]);
    expect(after!.stages["b"]!.version).toBe(2);
    expect((await stat(join(box.workspaceDir, "stages", "a"))).mtimeMs).toBe(aFolder.mtimeMs);
    expect(after!.completedAt).toBeDefined();
  });

  it("removes stages that are no longer registered", async () => {
    await run([...stagesV(1).all, fakeStage("old")]);
    const result = await run(stagesV(1).all);
    expect(result).toMatchObject({ status: "completed", ran: [] });
    const manifest = await readManifest(box.workspaceDir, memoryLogger());
    expect(Object.keys(manifest!.stages).sort()).toEqual(["a", "b", "c", "d"]);
    await expect(stat(join(box.workspaceDir, "stages", "old"))).rejects.toThrow();
  });
});
