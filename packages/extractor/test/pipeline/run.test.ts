import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { digestTree } from "../../src/pipeline/digest.ts";
import { acquireLock } from "../../src/pipeline/lock.ts";
import { readManifest } from "../../src/pipeline/manifest.ts";
import { createRegistry } from "../../src/pipeline/registry.ts";
import { runPipeline, type RunArgs } from "../../src/pipeline/run.ts";
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

function args(stages: Stage[], extra: Partial<RunArgs> = {}): RunArgs {
  return {
    workspaceDir: box.workspaceDir,
    romPath: box.romPath,
    registry: createRegistry(stages),
    log: memoryLogger(),
    references: [box.romSha1],
    ...extra,
  };
}

describe("runPipeline", () => {
  it("runs stages in order and commits each one to stages/ and the manifest", async () => {
    const order: string[] = [];
    const a = fakeStage("a", { outputs: ["out", "y"] });
    const b = fakeStage("b", { dependsOn: ["a"] });
    const wrap = (s: Stage): Stage => ({
      ...s,
      run: async (ctx) => {
        order.push(s.id);
        expect(ctx.outputDir(s.outputs[0]!)).toContain(join("staging", `${s.id}-`));
        await s.run(ctx);
      },
    });
    const result = await runPipeline(args([wrap(a), wrap(b)]));
    expect(result).toEqual({ status: "completed", ran: ["a", "b"], skipped: [] });
    expect(order).toEqual(["a", "b"]);

    const manifest = await readManifest(box.workspaceDir, memoryLogger());
    expect(manifest?.rom).toEqual({ sha1: box.romSha1, size: box.rom.length });
    expect(Object.keys(manifest!.stages)).toEqual(["a", "b"]);
    expect(manifest!.completedAt).toBeDefined();
    for (const [id, outputs] of [["a", ["out", "y"]], ["b", ["out"]]] as const) {
      expect(manifest!.stages[id]!.version).toBe(1);
      for (const output of outputs) {
        const dir = join(box.workspaceDir, "stages", id, output);
        expect(manifest!.stages[id]!.outputs[output]).toEqual(await digestTree(dir));
      }
    }
    expect(await readdir(join(box.workspaceDir, "staging"))).toEqual([]);
  });

  it("gives stages their inputs and the ROM", async () => {
    let seen = "";
    const b: Stage = {
      ...fakeStage("b", { dependsOn: ["a"] }),
      run: async (ctx) => {
        seen = await readFile(join(ctx.inputDir("a", "out"), "0.bin"), "utf8");
        expect(ctx.rom).toEqual(box.rom);
        await writeFile(join(ctx.outputDir("out"), "f"), "1");
      },
    };
    await runPipeline(args([fakeStage("a"), b]));
    expect(seen).toBe("a:out:0:v1");
  });

  it("skips stages that are up to date", async () => {
    const a = fakeStage("a");
    await runPipeline(args([a]));
    const again = await runPipeline(args([a]));
    expect(again).toEqual({ status: "completed", ran: [], skipped: ["a"] });
    expect(a.runs).toBe(1);
  });

  it("reports weighted progress that never decreases and ends at 100", async () => {
    const percents: number[] = [];
    const titles = new Set<string>();
    await runPipeline(
      args([fakeStage("a", { weight: 3, filesPerOutput: 4 }), fakeStage("b", { weight: 1, filesPerOutput: 4 })], {
        onProgress: (p) => {
          percents.push(p.percent);
          titles.add(p.stageTitle);
        },
      }),
    );
    expect(percents.at(-1)).toBe(100);
    expect(percents).toEqual([...percents].sort((x, y) => x - y));
    expect(percents).toContain(75);
    expect([...titles]).toEqual(["Stage a", "Stage b"]);
  });

  it("reports progress while checking the saved outputs, then runs stages past that share", async () => {
    const a = fakeStage("a", { outputs: ["out", "y"] });
    await runPipeline(args([a, fakeStage("b")]));
    const seen: { stageId: string; percent: number }[] = [];
    await runPipeline(
      args([a, fakeStage("b")], { force: ["b"], onProgress: ({ stageId, percent }) => seen.push({ stageId, percent }) }),
    );
    const verify = seen.filter((p) => p.stageId === "verify").map((p) => p.percent);
    expect(verify.length).toBeGreaterThan(0);
    expect(Math.max(...verify)).toBeLessThanOrEqual(10);
    expect(seen.filter((p) => p.stageId === "b").every((p) => p.percent >= 10)).toBe(true);
    expect(seen.at(-1)!.percent).toBe(100);
  });

  it("cancels mid-stage without recording the stage", async () => {
    const controller = new AbortController();
    const b = fakeStage("b", {
      filesPerOutput: 4,
      onFile: (_ctx, i) => {
        if (i === 1) controller.abort();
      },
    });
    const result = await runPipeline(args([fakeStage("a"), b], { signal: controller.signal }));
    expect(result).toEqual({ status: "cancelled" });
    const manifest = await readManifest(box.workspaceDir, memoryLogger());
    expect(Object.keys(manifest!.stages)).toEqual(["a"]);
    expect(manifest!.completedAt).toBeUndefined();
  });

  it("reports a failing stage and keeps earlier stages", async () => {
    const log = memoryLogger();
    const b = fakeStage("b", {
      run: () => Promise.reject(new Error("boom")),
    });
    const result = await runPipeline(args([fakeStage("a"), b], { log }));
    expect(result).toEqual({ status: "failed", error: { code: "stage-failed", stageId: "b", message: "boom" } });
    const manifest = await readManifest(box.workspaceDir, memoryLogger());
    expect(Object.keys(manifest!.stages)).toEqual(["a"]);
    expect(log.lines.some((l) => l.startsWith("ERROR [b]"))).toBe(true);
  });

  it("refuses a ROM that is not a reference before writing anything", async () => {
    const result = await runPipeline(args([fakeStage("a")], { references: ["0".repeat(40)] }));
    expect(result).toEqual({ status: "failed", error: { code: "rom-mismatch" } });
    expect(await readdir(box.workspaceDir)).toEqual([]);
  });

  it("reports busy when another run holds the lock", async () => {
    await acquireLock(box.workspaceDir);
    const result = await runPipeline(args([fakeStage("a")]));
    expect(result).toEqual({ status: "failed", error: { code: "busy" } });
  });
});

describe("runPipeline (resume)", () => {
  it("deletes leftover staging folders and stage folders the manifest does not list", async () => {
    await mkdir(join(box.workspaceDir, "staging", "a-dead"), { recursive: true });
    await mkdir(join(box.workspaceDir, "stages", "ghost", "out"), { recursive: true });
    await runPipeline(args([fakeStage("a")]));
    expect(await readdir(join(box.workspaceDir, "staging"))).toEqual([]);
    expect(await readdir(join(box.workspaceDir, "stages"))).toEqual(["a"]);
  });

  it("skips stages already complete when resuming", async () => {
    const a = fakeStage("a");
    const controller = new AbortController();
    const b = fakeStage("b", {
      dependsOn: ["a"],
      filesPerOutput: 3,
      onFile: (_ctx, i) => {
        if (i === 1) controller.abort();
      },
    });
    expect(await runPipeline(args([a, b], { signal: controller.signal }))).toEqual({ status: "cancelled" });
    const b2 = fakeStage("b", { dependsOn: ["a"] });
    expect(await runPipeline(args([a, b2]))).toEqual({ status: "completed", ran: ["b"], skipped: ["a"] });
    expect(a.runs).toBe(1);
  });
});

describe("runPipeline (failures)", () => {
  const MiB = 1024 * 1024;

  it("refuses to start without enough disk space", async () => {
    const statfs = () => Promise.resolve({ bavail: 10, bsize: 4096 });
    const a = fakeStage("a");
    const result = await runPipeline(args([a], { statfs }));
    expect(result).toEqual({
      status: "failed",
      error: { code: "disk-full", requiredBytes: 1024 + 64 * MiB, availableBytes: 40_960 },
    });
    expect(a.runs).toBe(0);
    expect(await readdir(join(box.workspaceDir, "staging")).catch(() => [])).toEqual([]);
  });

  it("maps ENOSPC from a stage to disk-full", async () => {
    const stage = fakeStage("a", { run: () => Promise.reject(Object.assign(new Error("no space"), { code: "ENOSPC" })) });
    const result = await runPipeline(args([stage]));
    expect(result).toMatchObject({ status: "failed", error: { code: "disk-full" } });
  });

  it.each(["EACCES", "EPERM"])("maps %s to write-permission with the path", async (code) => {
    const stage = fakeStage("a", {
      run: () => Promise.reject(Object.assign(new Error("denied"), { code, path: "D:/locked/file.bin" })),
    });
    const result = await runPipeline(args([stage]));
    expect(result).toEqual({ status: "failed", error: { code: "write-permission", path: "D:/locked/file.bin" } });
  });

  it("logs the context first and the failing stage, without ROM bytes", async () => {
    const log = memoryLogger();
    const stage = fakeStage("b", { run: () => Promise.reject(new Error("boom")) });
    await runPipeline(args([fakeStage("a"), stage], { log, appVersion: "9.9.9" }));
    const first = log.lines.find((l) => l.startsWith("INFO"))!;
    expect(first).toContain("9.9.9");
    expect(first).toContain("a@1");
    expect(first).toContain("b@1");
    expect(first).toContain(box.romSha1);
    expect(log.lines.some((l) => l.startsWith("ERROR [b]") && l.includes("boom"))).toBe(true);
    const romSample = Buffer.from(box.rom.subarray(0x4000, 0x4010)).toString("latin1");
    expect(log.lines.join("\n")).not.toContain(romSample);
  });
});
