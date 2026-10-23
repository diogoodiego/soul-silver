import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acquireLock, LockBusyError } from "../../src/pipeline/lock.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ss-lock-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("acquireLock", () => {
  it("writes pid and startedAt, and release deletes the file", async () => {
    const release = await acquireLock(dir, { pid: 1234 });
    const content = JSON.parse(await readFile(join(dir, ".lock"), "utf8")) as { pid: number; startedAt: string };
    expect(content.pid).toBe(1234);
    expect(Number.isNaN(Date.parse(content.startedAt))).toBe(false);
    await release();
    await expect(stat(join(dir, ".lock"))).rejects.toThrow();
  });

  it("refuses while the owner is alive", async () => {
    await acquireLock(dir, { pid: 1 });
    await expect(acquireLock(dir, { pid: 2, isAlive: () => true })).rejects.toBeInstanceOf(LockBusyError);
  });

  it("replaces a stale lock", async () => {
    await acquireLock(dir, { pid: 1 });
    const release = await acquireLock(dir, { pid: 2, isAlive: () => false });
    const content = JSON.parse(await readFile(join(dir, ".lock"), "utf8")) as { pid: number };
    expect(content.pid).toBe(2);
    await release();
  });

  it("treats an unreadable lock file as stale", async () => {
    await writeFile(join(dir, ".lock"), "garbage");
    const release = await acquireLock(dir, { pid: 3, isAlive: () => true });
    await release();
  });

  it("creates the workspace folder if needed", async () => {
    const release = await acquireLock(join(dir, "nested", "ws"));
    await release();
  });
});
