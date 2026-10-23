import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, statfs as fsStatfs } from "node:fs/promises";
import { join } from "node:path";
import { randomSuffix, renameWithRetry } from "../fs-atomic.ts";
import type { Logger } from "../log.ts";
import { REFERENCE_ROM_SHA1 } from "../rom/reference.ts";
import { digestTree } from "./digest.ts";
import { acquireLock, LockBusyError, type LockOptions } from "./lock.ts";
import { type Manifest, type OutputRecord, readManifest, writeManifest } from "./manifest.ts";
import { type PlannedStage, planRun } from "./plan.ts";
import type { Registry } from "./registry.ts";
import type { Stage, StageContext } from "./stage.ts";
import { outputDir, STAGES_DIR, stageDir, STAGING_DIR } from "./workspace.ts";

// See specs/003-rom-extraction-pipeline/contracts/extractor-library-api.md, "runPipeline".

export interface RunProgress {
  stageId: string;
  stageTitle: string;
  percent: number;
}

/** Points where tests simulate a crash (research R18); "mid-stage" is raised by test stages. */
export type CheckpointName =
  | "after-lock"
  | "after-cleanup"
  | "before-manifest-entry-drop"
  | `${"before-stage" | "mid-stage" | "after-stage-run" | "after-old-removed" | "after-rename" | "after-manifest"}:${string}`;

export interface RunArgs {
  workspaceDir: string;
  /** Already validated ROM (the saved copy, or --rom). */
  romPath: string;
  registry: Registry;
  signal?: AbortSignal;
  log: Logger;
  onProgress?: (progress: RunProgress) => void;
  onPlan?: (plan: readonly PlannedStage[]) => void;
  only?: readonly string[];
  force?: readonly string[];
  /** Accepted ROM SHA-1s; defaults to REFERENCE_ROM_SHA1. */
  references?: readonly string[];
  lock?: LockOptions;
  /** Test hook only. */
  onCheckpoint?: (name: CheckpointName) => void;
  /** Written to the log's first line. */
  appVersion?: string;
  /** Free-space probe; injectable for tests (research R12). */
  statfs?: (path: string) => Promise<{ bavail: number | bigint; bsize: number | bigint }>;
}

/** Spare room on top of the stage estimates. */
const DISK_MARGIN_BYTES = 64 * 1024 * 1024;

export type PipelineError =
  | { code: "disk-full"; requiredBytes: number; availableBytes: number }
  | { code: "write-permission"; path: string }
  | { code: "busy" }
  | { code: "rom-mismatch" }
  | { code: "stage-failed"; stageId: string; message: string };

export type RunResult =
  | { status: "completed"; ran: string[]; skipped: string[] }
  | { status: "cancelled" }
  | { status: "failed"; error: PipelineError };

class StageFailure extends Error {
  readonly stageId: string;

  constructor(stageId: string, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.stageId = stageId;
  }
}

function now(): string {
  return new Date().toISOString();
}

function progressReporter(planned: readonly PlannedStage[], onProgress: RunArgs["onProgress"]) {
  const total = planned.reduce((sum, p) => sum + p.stage.weight, 0);
  let done = 0;
  let last = -1;
  const report = (stage: Stage, fraction: number) => {
    const clamped = Math.min(1, Math.max(0, fraction));
    const percent = Math.floor((100 * (done + stage.weight * clamped)) / total);
    if (percent <= last) return;
    last = percent;
    onProgress?.({ stageId: stage.id, stageTitle: stage.title, percent });
  };
  const finish = (stage: Stage) => {
    done += stage.weight;
    report(stage, 0);
  };
  return { report, finish };
}

/** Removes leftovers of interrupted runs: staging folders and stage folders the manifest does not list. */
async function cleanup(workspaceDir: string, manifest: Manifest | undefined): Promise<void> {
  await rm(join(workspaceDir, STAGING_DIR), { recursive: true, force: true });
  await mkdir(join(workspaceDir, STAGING_DIR), { recursive: true });
  let entries: string[] = [];
  try {
    entries = await readdir(join(workspaceDir, STAGES_DIR));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  for (const id of entries) {
    if (!manifest?.stages[id]) await rm(stageDir(workspaceDir, id), { recursive: true, force: true });
  }
}

async function runStage(args: RunArgs, stage: Stage, rom: Uint8Array, report: (fraction: number) => void) {
  const staging = join(args.workspaceDir, STAGING_DIR, `${stage.id}-${randomSuffix()}`);
  for (const output of stage.outputs) await mkdir(join(staging, output), { recursive: true });
  const ctx: StageContext = {
    rom,
    inputDir: (id, output) => outputDir(args.workspaceDir, id, output),
    outputDir: (output) => {
      if (!stage.outputs.includes(output)) throw new Error(`Stage "${stage.id}" has no output "${output}"`);
      return join(staging, output);
    },
    signal: args.signal ?? new AbortController().signal,
    progress: report,
    log: args.log,
  };
  try {
    await stage.run(ctx);
  } catch (error) {
    if (args.signal?.aborted) throw error;
    throw new StageFailure(stage.id, error);
  }
  args.signal?.throwIfAborted();
  const outputs: Record<string, OutputRecord> = {};
  for (const output of stage.outputs) outputs[output] = await digestTree(join(staging, output));
  return { staging, outputs };
}

async function availableBytes(args: RunArgs): Promise<number> {
  const info = await (args.statfs ?? fsStatfs)(args.workspaceDir);
  return Number(info.bavail) * Number(info.bsize);
}

/** Facts gathered by execute() that the error mapping needs. */
interface RunFacts {
  requiredBytes: number;
}

async function execute(args: RunArgs, facts: RunFacts): Promise<RunResult> {
  const { workspaceDir, registry, log } = args;
  const rom = new Uint8Array(await readFile(args.romPath));
  const romSha1 = createHash("sha1").update(rom).digest("hex");
  const versions = registry.stages.map((s) => `${s.id}@${s.version}`).join(", ");
  log.info(`Extraction started: app ${args.appVersion ?? "unknown"}; stages ${versions}; ROM SHA-1 ${romSha1}`);
  if (!(args.references ?? REFERENCE_ROM_SHA1).includes(romSha1)) {
    log.error(`ROM SHA-1 ${romSha1} is not a reference dump`);
    return { status: "failed", error: { code: "rom-mismatch" } };
  }

  const checkpoint = args.onCheckpoint ?? (() => {});
  const previous = await readManifest(workspaceDir, log);
  await cleanup(workspaceDir, previous);
  checkpoint("after-cleanup");

  const plan = await planRun({
    registry,
    manifest: previous,
    romSha1,
    ...(args.only ? { only: args.only } : {}),
    ...(args.force ? { force: args.force } : {}),
    isOutputValid: async (id, output, record) => {
      const actual = await digestTree(outputDir(workspaceDir, id, output)).catch(() => undefined);
      return actual?.sha256 === record.sha256;
    },
  });
  args.onPlan?.(plan.stages);
  facts.requiredBytes = Math.ceil(plan.stages.reduce((sum, p) => sum + p.stage.estimateBytes(rom.length), 0)) + DISK_MARGIN_BYTES;
  if (plan.stages.length > 0) {
    const available = await availableBytes(args);
    if (available < facts.requiredBytes) {
      log.error(`Not enough disk space: need ${facts.requiredBytes} bytes, have ${available}`);
      return { status: "failed", error: { code: "disk-full", requiredBytes: facts.requiredBytes, availableBytes: available } };
    }
  }
  const planned = new Set(plan.stages.map((p) => p.stage.id));
  const skipped = registry.stages.map((s) => s.id).filter((id) => !planned.has(id));

  const timestamp = now();
  const sameRom = previous?.rom.sha1 === romSha1;
  const manifest: Manifest = sameRom
    ? structuredClone(previous)
    : { formatVersion: 1, rom: { sha1: romSha1, size: rom.length }, createdAt: timestamp, updatedAt: timestamp, stages: {} };

  // Forget stale entries in one atomic write before touching their folders (research R7, step 4).
  // With another ROM every previous stage is stale, and the fresh manifest already omits them.
  const stale = sameRom
    ? [...plan.removed, ...plan.stages.map((p) => p.stage.id)].filter((id) => manifest.stages[id])
    : Object.keys(previous?.stages ?? {});
  if (previous && stale.length > 0) {
    checkpoint("before-manifest-entry-drop");
    for (const id of stale) delete manifest.stages[id];
    manifest.updatedAt = now();
    await writeManifest(workspaceDir, manifest);
  }
  for (const id of stale) await rm(stageDir(workspaceDir, id), { recursive: true, force: true });

  const progress = progressReporter(plan.stages, args.onProgress);
  const ran: string[] = [];
  for (const { stage } of plan.stages) {
    args.signal?.throwIfAborted();
    checkpoint(`before-stage:${stage.id}`);
    progress.report(stage, 0);
    const { staging, outputs } = await runStage(args, stage, rom, (f) => progress.report(stage, f));
    checkpoint(`after-stage-run:${stage.id}`);
    await rm(stageDir(workspaceDir, stage.id), { recursive: true, force: true });
    checkpoint(`after-old-removed:${stage.id}`);
    await mkdir(join(workspaceDir, STAGES_DIR), { recursive: true });
    await renameWithRetry(staging, stageDir(workspaceDir, stage.id));
    checkpoint(`after-rename:${stage.id}`);
    manifest.stages[stage.id] = { version: stage.version, completedAt: now(), outputs };
    manifest.updatedAt = now();
    if (registry.stages.every((s) => manifest.stages[s.id]?.version === s.version)) manifest.completedAt = now();
    await writeManifest(workspaceDir, manifest);
    checkpoint(`after-manifest:${stage.id}`);
    log.info(`Stage completed (v${stage.version})`, stage.id);
    progress.finish(stage);
    ran.push(stage.id);
  }
  if (previous === undefined && plan.stages.length === 0) await writeManifest(workspaceDir, manifest);
  return { status: "completed", ran, skipped };
}

export async function runPipeline(args: RunArgs): Promise<RunResult> {
  let release: () => Promise<void>;
  try {
    release = await acquireLock(args.workspaceDir, args.lock);
  } catch (error) {
    if (error instanceof LockBusyError) return { status: "failed", error: { code: "busy" } };
    throw error;
  }
  const facts: RunFacts = { requiredBytes: DISK_MARGIN_BYTES };
  try {
    args.onCheckpoint?.("after-lock");
    return await execute(args, facts);
  } catch (error) {
    if (args.signal?.aborted) {
      args.log.info("Extraction cancelled");
      return { status: "cancelled" };
    }
    const stageId = error instanceof StageFailure ? error.stageId : undefined;
    const cause = error instanceof StageFailure ? error.cause : error;
    const errno = cause as NodeJS.ErrnoException;
    if (errno.code === "ENOSPC") {
      args.log.error("Disk full", cause, stageId);
      const available = await availableBytes(args).catch(() => 0);
      return { status: "failed", error: { code: "disk-full", requiredBytes: facts.requiredBytes, availableBytes: available } };
    }
    if (errno.code === "EACCES" || errno.code === "EPERM") {
      args.log.error("No permission to write", cause, stageId);
      return { status: "failed", error: { code: "write-permission", path: errno.path ?? args.workspaceDir } };
    }
    if (error instanceof StageFailure) {
      args.log.error("Stage failed", cause, stageId);
      return { status: "failed", error: { code: "stage-failed", stageId: error.stageId, message: error.message } };
    }
    throw error;
  } finally {
    await release();
  }
}
