import { randomBytes } from "node:crypto";
import { open, rename as fsRename, rm } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

const RETRYABLE = new Set(["EPERM", "EBUSY", "EACCES"]);

export function randomSuffix(): string {
  return randomBytes(4).toString("hex");
}

export interface RenameOptions {
  rename?: (from: string, to: string) => Promise<void>;
  /** Delay before each retry; attempts = delays + 1. */
  delaysMs?: readonly number[];
}

/**
 * Renames, retrying the transient failures Windows reports while antivirus or the
 * indexer holds a handle (research R7).
 */
export async function renameWithRetry(from: string, to: string, options: RenameOptions = {}): Promise<void> {
  const rename = options.rename ?? fsRename;
  const delays = options.delaysMs ?? [50, 100, 200, 400];
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      const delay = delays[attempt];
      if (!RETRYABLE.has(code) || delay === undefined) throw error;
      await sleep(delay);
    }
  }
}

/** Writes to a temporary sibling, fsyncs and renames over the target. */
export async function writeFileAtomic(path: string, data: string | Uint8Array): Promise<void> {
  const tmp = `${path}.tmp-${randomSuffix()}`;
  try {
    const handle = await open(tmp, "w");
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await renameWithRetry(tmp, path);
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
}
