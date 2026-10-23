import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRegistry } from "../../src/pipeline/registry.ts";
import { runPipeline } from "../../src/pipeline/run.ts";
import { textCatalogStage } from "../../src/text/stage.ts";
import { buildBank } from "../fixtures/text/build-bank.ts";
import { memoryLogger, sandbox, type Sandbox } from "../pipeline/helpers.ts";
import { unpackFixture } from "./helpers.ts";

const bank = buildBank([{ words: [0x12b, 0x145] }, { words: [0xe000] }], { seed: 5 });

let box: Sandbox;
beforeEach(async () => {
  box = await sandbox();
});
afterEach(async () => {
  await box.cleanup();
});

const run = (version = 1) =>
  runPipeline({
    workspaceDir: box.workspaceDir,
    romPath: box.romPath,
    registry: createRegistry([unpackFixture(new Map([[0, bank], [34, bank]])), { ...textCatalogStage, version }]),
    log: memoryLogger(),
    references: [box.romSha1],
  });

describe("text stage determinism and isolation", () => {
  it("writes byte-identical files on a second run (SC-005)", async () => {
    await run();
    const first = await readFile(join(box.workspaceDir, "stages", "text-catalog", "catalog", "en", "0034.json"));
    const firstReport = await readFile(join(box.workspaceDir, "stages", "text-catalog", "catalog", "report.json"));
    await run(1);
    const again = await readFile(join(box.workspaceDir, "stages", "text-catalog", "catalog", "en", "0034.json"));
    expect(Buffer.compare(first, again)).toBe(0);
    expect(Buffer.compare(firstReport, await readFile(join(box.workspaceDir, "stages", "text-catalog", "catalog", "report.json")))).toBe(0);
  });

  it("re-runs only text-catalog when its version changes", async () => {
    await run();
    const result = await run(2);
    expect(result).toEqual({ status: "completed", ran: ["text-catalog"], skipped: ["rom-unpack"] });
  });
});
