import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { randomSuffix, renameWithRetry } from "../fs-atomic.ts";

/** Copies the validated ROM into the user data folder, atomically and hash-checked (FR-005). */
export async function copyRom(source: string, dest: string, expectedSha1: string, signal?: AbortSignal): Promise<void> {
  await mkdir(dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp-${randomSuffix()}`;
  try {
    signal?.throwIfAborted();
    const hash = createHash("sha1");
    const handle = await open(tmp, "w");
    try {
      for await (const chunk of createReadStream(source, signal ? { signal } : {})) {
        hash.update(chunk as Buffer);
        await handle.write(chunk as Buffer);
      }
      await handle.sync();
    } finally {
      await handle.close();
    }
    const actual = hash.digest("hex");
    if (actual !== expectedSha1) throw new Error(`Copied ROM SHA-1 ${actual} does not match ${expectedSha1}`);
    await renameWithRetry(tmp, dest);
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
}
