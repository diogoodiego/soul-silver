import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const LOCK_FILE = ".lock";

export class LockBusyError extends Error {
  override name = "LockBusyError";
}

export interface LockOptions {
  pid?: number;
  isAlive?: (pid: number) => boolean;
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function ownerPid(path: string): Promise<number | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as { pid?: unknown };
    return Number.isInteger(parsed.pid) ? (parsed.pid as number) : undefined;
  } catch {
    return undefined;
  }
}

/** One extraction per workspace, across the app and the CLI (research R14). Returns the release function. */
export async function acquireLock(workspaceDir: string, options: LockOptions = {}): Promise<() => Promise<void>> {
  const pid = options.pid ?? process.pid;
  const isAlive = options.isAlive ?? processIsAlive;
  const path = join(workspaceDir, LOCK_FILE);
  await mkdir(workspaceDir, { recursive: true });
  const content = JSON.stringify({ pid, startedAt: new Date().toISOString() });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await writeFile(path, content, { flag: "wx" });
      return () => rm(path, { force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const owner = await ownerPid(path);
      if (owner !== undefined && isAlive(owner)) throw new LockBusyError(`Workspace is locked by process ${owner}`);
      await rm(path, { force: true });
    }
  }
  throw new LockBusyError("Workspace lock is contended");
}
