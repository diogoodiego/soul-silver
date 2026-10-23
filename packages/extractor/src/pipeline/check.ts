import { stat } from "node:fs/promises";
import type { Logger } from "../log.ts";
import { countFiles, digestTree } from "./digest.ts";
import { type OutputRecord, readManifest } from "./manifest.ts";
import type { Registry } from "./registry.ts";
import { outputDir } from "./workspace.ts";

// See specs/003-rom-extraction-pipeline/data-model.md, "Resultado da checagem rápida".

export type AssetsCheck =
  | { status: "ready" }
  | {
      status: "needs-extraction";
      romAvailable: boolean;
      reason: "no-manifest" | "incomplete" | "outdated" | "outputs-missing";
    }
  | { status: "needs-rom" };

export interface CheckArgs {
  workspaceDir: string;
  /** The saved ROM copy. */
  romPath: string;
  registry: Registry;
  log: Logger;
}

async function sizeOf(path: string): Promise<number | undefined> {
  try {
    const info = await stat(path);
    return info.isFile() ? info.size : undefined;
  } catch {
    return undefined;
  }
}

/** Startup check (research R9): manifest, versions and output file counts; no hashing. */
export async function checkAssets(args: CheckArgs): Promise<AssetsCheck> {
  const { registry, workspaceDir } = args;
  const manifest = await readManifest(workspaceDir, args.log);
  const romSize = await sizeOf(args.romPath);
  if (!manifest) {
    return romSize === undefined ? { status: "needs-rom" } : { status: "needs-extraction", romAvailable: true, reason: "no-manifest" };
  }
  const romAvailable = romSize === manifest.rom.size;
  const needs = (reason: "incomplete" | "outdated" | "outputs-missing"): AssetsCheck => ({ status: "needs-extraction", romAvailable, reason });

  const removed = Object.keys(manifest.stages).some((id) => !registry.get(id));
  const versionChanged = registry.stages.some((s) => manifest.stages[s.id] && manifest.stages[s.id]!.version !== s.version);
  if (removed || versionChanged) return needs("outdated");
  // After a complete extraction, a missing stage was added by an update; otherwise the run was interrupted.
  if (registry.stages.some((s) => !manifest.stages[s.id])) return needs(manifest.completedAt ? "outdated" : "incomplete");

  for (const stage of registry.stages) {
    for (const [output, record] of Object.entries(manifest.stages[stage.id]!.outputs)) {
      if ((await countFiles(outputDir(workspaceDir, stage.id, output))) !== record.files) {
        args.log.warn(`Output "${output}" has missing files`, stage.id);
        return needs("outputs-missing");
      }
    }
  }
  return { status: "ready" };
}

export interface OutputMismatch {
  stageId: string;
  output: string;
  expected: OutputRecord | undefined;
  actual: OutputRecord | undefined;
}

/** Full verification: recomputes every output digest and compares it with the manifest. */
export async function verifyOutputs(args: { workspaceDir: string; registry: Registry; log?: Logger }): Promise<{
  ok: boolean;
  mismatches: OutputMismatch[];
}> {
  const log = args.log ?? { info() {}, warn() {}, error() {} };
  const manifest = await readManifest(args.workspaceDir, log);
  const mismatches: OutputMismatch[] = [];
  for (const stage of args.registry.stages) {
    for (const output of stage.outputs) {
      const expected = manifest?.stages[stage.id]?.outputs[output];
      const actual = await digestTree(outputDir(args.workspaceDir, stage.id, output)).catch(() => undefined);
      if (!expected || !actual || expected.sha256 !== actual.sha256) mismatches.push({ stageId: stage.id, output, expected, actual });
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}
