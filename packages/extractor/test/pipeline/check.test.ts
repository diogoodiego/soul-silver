import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkAssets } from "../../src/pipeline/check.ts";
import { createRegistry } from "../../src/pipeline/registry.ts";
import { runPipeline } from "../../src/pipeline/run.ts";
import type { Stage } from "../../src/pipeline/stage.ts";
import { fakeStage } from "./fake-stage.ts";
import { memoryLogger, sandbox, type Sandbox } from "./helpers.ts";

let box: Sandbox;
beforeEach(async () => {
  box = await sandbox();
});
afterEach(async () => {
  await box.cleanup();
});

async function extract(stages: Stage[]) {
  const result = await runPipeline({
    workspaceDir: box.workspaceDir,
    romPath: box.romPath,
    registry: createRegistry(stages),
    log: memoryLogger(),
    references: [box.romSha1],
  });
  expect(result.status).toBe("completed");
}

function check(stages: Stage[], romPath = box.romPath) {
  return checkAssets({ workspaceDir: box.workspaceDir, romPath, registry: createRegistry(stages), log: memoryLogger() });
}

describe("checkAssets (foundational)", () => {
  it("needs the ROM when there is neither manifest nor copy", async () => {
    expect(await check([fakeStage("a")], join(box.root, "missing.nds"))).toEqual({ status: "needs-rom" });
  });

  it("needs extraction when there is a copy but no manifest", async () => {
    expect(await check([fakeStage("a")])).toEqual({ status: "needs-extraction", romAvailable: true, reason: "no-manifest" });
  });

  it("is ready after a complete extraction", async () => {
    const stages = [fakeStage("a"), fakeStage("b", { dependsOn: ["a"] })];
    await extract(stages);
    expect(await check(stages)).toEqual({ status: "ready" });
  });

  it("marks the ROM unavailable when the copy is missing or has another size", async () => {
    const a = fakeStage("a");
    await extract([a]);
    // A registered stage missing from the manifest makes the check not ready.
    const withNewStage = [a, fakeStage("z")];
    expect(await check(withNewStage)).toMatchObject({ romAvailable: true });
    expect(await check(withNewStage, join(box.root, "missing.nds"))).toMatchObject({ romAvailable: false });
    await writeFile(box.romPath, "short");
    expect(await check(withNewStage)).toMatchObject({ romAvailable: false });
  });
});

describe("checkAssets (update and repair)", () => {
  it("is outdated when a stage version changed", async () => {
    await extract([fakeStage("a")]);
    expect(await check([fakeStage("a", { version: 2 })])).toEqual({ status: "needs-extraction", romAvailable: true, reason: "outdated" });
  });

  it("is outdated when a stage was added after a complete extraction", async () => {
    await extract([fakeStage("a")]);
    expect(await check([fakeStage("a"), fakeStage("e")])).toEqual({ status: "needs-extraction", romAvailable: true, reason: "outdated" });
  });

  it("is outdated when the manifest lists a stage that is no longer registered", async () => {
    await extract([fakeStage("a"), fakeStage("old")]);
    expect(await check([fakeStage("a")])).toMatchObject({ reason: "outdated" });
  });

  it("is missing outputs when an output folder is deleted", async () => {
    const stages = [fakeStage("a", { outputs: ["out", "y"] })];
    await extract(stages);
    await rm(join(box.workspaceDir, "stages", "a", "y"), { recursive: true });
    expect(await check(stages)).toEqual({ status: "needs-extraction", romAvailable: true, reason: "outputs-missing" });
  });

  it("is missing outputs when a file inside an output is deleted", async () => {
    const stages = [fakeStage("a")];
    await extract(stages);
    await rm(join(box.workspaceDir, "stages", "a", "out", "0.bin"));
    expect(await check(stages)).toMatchObject({ reason: "outputs-missing" });
  });

  it("reports the ROM unavailable when the copy is gone", async () => {
    await extract([fakeStage("a")]);
    expect(await check([fakeStage("a", { version: 2 })], join(box.root, "missing.nds"))).toMatchObject({ romAvailable: false });
  });
});
