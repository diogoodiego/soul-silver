import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomic } from "../fs-atomic.ts";
import type { Logger } from "../log.ts";

// See specs/003-rom-extraction-pipeline/data-model.md, "Manifesto".

export const MANIFEST_FILE = "manifest.json";

export interface OutputRecord {
  /** Tree digest (research R8), lowercase hex. */
  sha256: string;
  files: number;
  bytes: number;
}

export interface StageRecord {
  version: number;
  completedAt: string;
  outputs: Record<string, OutputRecord>;
}

export interface Manifest {
  formatVersion: 1;
  rom: { sha1: string; size: number };
  createdAt: string;
  updatedAt: string;
  /** Set when a run finished with every registered stage; tells an added stage apart from an interrupted run. */
  completedAt?: string;
  stages: Record<string, StageRecord>;
}

export type ParseResult = { ok: true; manifest: Manifest } | { ok: false; path: string; problem: string };

class Invalid extends Error {
  readonly path: string;
  readonly problem: string;

  constructor(path: string, problem: string) {
    super(`${path}: ${problem}`);
    this.path = path;
    this.problem = problem;
  }
}

type Fields = Record<string, unknown>;

function record(value: unknown, path: string): Fields {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Invalid(path, "expected an object");
  return value as Fields;
}

function count(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) throw new Invalid(path, "expected an integer ≥ 0");
  return value as number;
}

function hex(value: unknown, length: number, path: string): string {
  if (typeof value !== "string" || !new RegExp(`^[0-9a-f]{${length}}$`).test(value)) {
    throw new Invalid(path, `expected ${length} lowercase hex characters`);
  }
  return value;
}

function date(value: unknown, path: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Invalid(path, "expected an ISO-8601 date");
  return value;
}

function join2(path: string, key: string): string {
  return path === "" ? key : `${path}.${key}`;
}

function parseOutput(value: unknown, path: string): OutputRecord {
  const fields = record(value, path);
  return {
    sha256: hex(fields["sha256"], 64, join2(path, "sha256")),
    files: count(fields["files"], join2(path, "files")),
    bytes: count(fields["bytes"], join2(path, "bytes")),
  };
}

function parseStage(value: unknown, path: string): StageRecord {
  const fields = record(value, path);
  const version = fields["version"];
  if (!Number.isInteger(version) || (version as number) < 1) throw new Invalid(join2(path, "version"), "expected an integer ≥ 1");
  const outputsPath = join2(path, "outputs");
  const outputs: Record<string, OutputRecord> = {};
  for (const [name, output] of Object.entries(record(fields["outputs"], outputsPath))) {
    outputs[name] = parseOutput(output, join2(outputsPath, name));
  }
  return { version: version as number, completedAt: date(fields["completedAt"], join2(path, "completedAt")), outputs };
}

/** Validates a parsed manifest.json (principle III). */
export function parseManifest(value: unknown): ParseResult {
  try {
    const fields = record(value, "");
    if (fields["formatVersion"] !== 1) throw new Invalid("formatVersion", "expected 1");
    const rom = record(fields["rom"], "rom");
    const stages: Record<string, StageRecord> = {};
    for (const [id, stage] of Object.entries(record(fields["stages"], "stages"))) {
      stages[id] = parseStage(stage, `stages.${id}`);
    }
    const manifest: Manifest = {
      formatVersion: 1,
      rom: { sha1: hex(rom["sha1"], 40, "rom.sha1"), size: count(rom["size"], "rom.size") },
      createdAt: date(fields["createdAt"], "createdAt"),
      updatedAt: date(fields["updatedAt"], "updatedAt"),
      stages,
    };
    if (fields["completedAt"] !== undefined) manifest.completedAt = date(fields["completedAt"], "completedAt");
    return { ok: true, manifest };
  } catch (error) {
    if (error instanceof Invalid) return { ok: false, path: error.path, problem: error.problem };
    throw error;
  }
}

/** Missing, unreadable or invalid manifests all count as absent (FR-019). */
export async function readManifest(workspaceDir: string, log: Logger): Promise<Manifest | undefined> {
  let text: string;
  try {
    text = await readFile(join(workspaceDir, MANIFEST_FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") log.warn(`Cannot read ${MANIFEST_FILE}: ${String(error)}`);
    return undefined;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    log.warn(`${MANIFEST_FILE} is not valid JSON; treating it as absent`);
    return undefined;
  }
  const result = parseManifest(json);
  if (!result.ok) {
    log.warn(`${MANIFEST_FILE} is invalid at "${result.path}": ${result.problem}; treating it as absent`);
    return undefined;
  }
  return result.manifest;
}

export async function writeManifest(workspaceDir: string, manifest: Manifest): Promise<void> {
  await writeFileAtomic(join(workspaceDir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
}
