import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkAssets, verifyOutputs } from "../../src/pipeline/check.ts";
import { readManifest } from "../../src/pipeline/manifest.ts";
import { createRegistry } from "../../src/pipeline/registry.ts";
import { type CheckpointName, runPipeline, type RunResult } from "../../src/pipeline/run.ts";
import type { Stage } from "../../src/pipeline/stage.ts";
import { fakeStage } from "./fake-stage.ts";
import { memoryLogger, sandbox, type Sandbox } from "./helpers.ts";

// SC-005: a crash at any point never leaves half-written assets marked as ready,
// and the next run always ends ready with outputs matching the manifest.

class Crash extends Error {}

let box: Sandbox;
beforeEach(async () => {
  box = await sandbox();
});
afterEach(async () => {
  await box.cleanup();
});

/** Stages a → b → c with two outputs each; `onMid` runs between files. */
function stages(bVersion: number, onMid?: (id: string) => void): Stage[] {
  const make = (id: string, version: number, dependsOn: string[]) =>
    fakeStage(id, { version, dependsOn, outputs: ["out", "extra"], filesPerOutput: 2, onFile: (_ctx, i) => {
        if (i === 1) onMid?.(id);
      },
    });
  return [make("a", 1, []), make("b", bVersion, ["a"]), make("c", 1, ["b"])];
}

function run(list: Stage[], onCheckpoint?: (name: CheckpointName) => void): Promise<RunResult> {
  return runPipeline({
    workspaceDir: box.workspaceDir,
    romPath: box.romPath,
    registry: createRegistry(list),
    log: memoryLogger(),
    references: [box.romSha1],
    lock: { isAlive: () => false },
    ...(onCheckpoint ? { onCheckpoint } : {}),
  });
}

/** Runs until `target` is reached, then "crashes": throws, and leaves a lock behind like a killed process. */
async function crashAt(list: (onMid: (id: string) => void) => Stage[], target: string): Promise<boolean> {
  let reached = false;
  const hit = (name: string) => {
    if (name === target) {
      reached = true;
      throw new Crash(name);
    }
  };
  try {
    await run(list((id) => hit(`mid-stage:${id}`)), hit);
  } catch (error) {
    if (!(error instanceof Crash)) throw error;
  }
  await writeFile(join(box.workspaceDir, ".lock"), JSON.stringify({ pid: 999_999, startedAt: new Date().toISOString() }));
  return reached;
}

const STAGE_POINTS = ["before-stage", "mid-stage", "after-stage-run", "after-old-removed", "after-rename", "after-manifest"];
const firstRunPoints = ["after-lock", "after-cleanup", ...["a", "b", "c"].flatMap((id) => STAGE_POINTS.map((p) => `${p}:${id}`))];
const updatePoints = ["after-lock", "after-cleanup", "before-manifest-entry-drop", ...["b", "c"].flatMap((id) => STAGE_POINTS.map((p) => `${p}:${id}`))];

async function expectRecovered(list: Stage[], readyRightAfterCrash: boolean, before: Awaited<ReturnType<typeof checkAssets>>) {
  expect(before.status === "ready").toBe(readyRightAfterCrash);
  const result = await run(list);
  expect(result.status).toBe("completed");
  const registry = createRegistry(list);
  expect(await checkAssets({ workspaceDir: box.workspaceDir, romPath: box.romPath, registry, log: memoryLogger() })).toEqual({ status: "ready" });
  expect(await verifyOutputs({ workspaceDir: box.workspaceDir, registry })).toEqual({ ok: true, mismatches: [] });
  expect(await readdir(join(box.workspaceDir, "staging"))).toEqual([]);
}

describe("interruption on the first run", () => {
  it("covers at least 10 points", () => {
    expect(firstRunPoints.length).toBeGreaterThanOrEqual(10);
  });

  it.each(firstRunPoints)("recovers after a crash at %s", async (point) => {
    expect(await crashAt((onMid) => stages(1, onMid), point)).toBe(true);
    const registry = createRegistry(stages(1));
    const before = await checkAssets({ workspaceDir: box.workspaceDir, romPath: box.romPath, registry, log: memoryLogger() });
    await expectRecovered(stages(1), point === "after-manifest:c", before);
  });
});

describe("interruption during an update", () => {
  it.each(updatePoints)("recovers after a crash at %s", async (point) => {
    expect((await run(stages(1))).status).toBe("completed");
    expect(await crashAt((onMid) => stages(2, onMid), point)).toBe(true);
    const registry = createRegistry(stages(2));
    const before = await checkAssets({ workspaceDir: box.workspaceDir, romPath: box.romPath, registry, log: memoryLogger() });
    await expectRecovered(stages(2), point === "after-manifest:c", before);
    const manifest = await readManifest(box.workspaceDir, memoryLogger());
    expect(manifest!.stages["b"]!.version).toBe(2);
  });
});
