import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renameWithRetry, writeFileAtomic } from "../src/fs-atomic.ts";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ss-atomic-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function errno(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

describe("writeFileAtomic", () => {
  it("writes the file and leaves no temporary behind", async () => {
    const target = join(dir, "manifest.json");
    await writeFileAtomic(target, "hello");
    expect(await readFile(target, "utf8")).toBe("hello");
    expect(await readdir(dir)).toEqual(["manifest.json"]);
  });

  it("replaces an existing file", async () => {
    const target = join(dir, "manifest.json");
    await writeFile(target, "old");
    await writeFileAtomic(target, new TextEncoder().encode("new"));
    expect(await readFile(target, "utf8")).toBe("new");
    expect(await readdir(dir)).toEqual(["manifest.json"]);
  });
});

describe("renameWithRetry", () => {
  it.each(["EPERM", "EBUSY", "EACCES"])("retries on %s and then succeeds", async (code) => {
    const rename = vi
      .fn<(from: string, to: string) => Promise<void>>()
      .mockRejectedValueOnce(errno(code))
      .mockRejectedValueOnce(errno(code))
      .mockResolvedValueOnce(undefined);
    await renameWithRetry("a", "b", { rename, delaysMs: [0, 0, 0, 0] });
    expect(rename).toHaveBeenCalledTimes(3);
  });

  it("gives up after the last attempt", async () => {
    const rename = vi.fn<(from: string, to: string) => Promise<void>>().mockRejectedValue(errno("EPERM"));
    await expect(renameWithRetry("a", "b", { rename, delaysMs: [0, 0, 0, 0] })).rejects.toThrow("EPERM");
    expect(rename).toHaveBeenCalledTimes(5);
  });

  it("rethrows other errors immediately", async () => {
    const rename = vi.fn<(from: string, to: string) => Promise<void>>().mockRejectedValue(errno("ENOENT"));
    await expect(renameWithRetry("a", "b", { rename, delaysMs: [0, 0, 0, 0] })).rejects.toThrow("ENOENT");
    expect(rename).toHaveBeenCalledTimes(1);
  });
});
