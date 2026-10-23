import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";
import type { Logger } from "../../src/log.ts";
import { buildNdsRom, sha1Hex } from "../fixtures/build-nds-rom.ts";

export interface TestLogger extends Logger {
  lines: string[];
}

export function memoryLogger(): TestLogger {
  const lines: string[] = [];
  return {
    lines,
    info: vi.fn((m: string, s?: string) => void lines.push(`INFO [${s ?? ""}] ${m}`)),
    warn: vi.fn((m: string, s?: string) => void lines.push(`WARN [${s ?? ""}] ${m}`)),
    error: vi.fn((m: string, e?: unknown, s?: string) => void lines.push(`ERROR [${s ?? ""}] ${m} ${String(e)}`)),
  };
}

export interface Sandbox {
  root: string;
  workspaceDir: string;
  romPath: string;
  rom: Uint8Array;
  romSha1: string;
  cleanup(): Promise<void>;
}

/** A temp folder with a synthetic ROM file and an (unborn) workspace. */
export async function sandbox(rom: Uint8Array = buildNdsRom()): Promise<Sandbox> {
  const root = await mkdtemp(join(tmpdir(), "ss-pipeline-"));
  const romPath = join(root, "rom.nds");
  await writeFile(romPath, rom);
  return {
    root,
    workspaceDir: join(root, "extraction"),
    romPath,
    rom,
    romSha1: sha1Hex(rom),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
