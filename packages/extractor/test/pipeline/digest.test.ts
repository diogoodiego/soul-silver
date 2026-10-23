import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { countFiles, digestTree } from "../../src/pipeline/digest.ts";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "ss-digest-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function tree(name: string, files: Array<[string, string]>): Promise<string> {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  for (const [path, content] of files) {
    await mkdir(join(dir, path, ".."), { recursive: true });
    await writeFile(join(dir, path), content);
  }
  return dir;
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

describe("digestTree", () => {
  it("hashes sorted `path\\0size\\0sha256\\n` lines", async () => {
    const dir = await tree("t", [["b.bin", "bb"], ["a/x.bin", "x"]]);
    const expected = sha256(`a/x.bin\u00001\u0000${sha256("x")}\nb.bin\u00002\u0000${sha256("bb")}\n`);
    expect(await digestTree(dir)).toEqual({ sha256: expected, files: 2, bytes: 3 });
  });

  it("does not depend on creation order", async () => {
    const one = await tree("one", [["a", "1"], ["z/y", "2"], ["m", "3"]]);
    const two = await tree("two", [["m", "3"], ["z/y", "2"], ["a", "1"]]);
    expect(await digestTree(one)).toEqual(await digestTree(two));
  });

  it("sorts by UTF-8 bytes, not by locale", async () => {
    const dir = await tree("t", [["é", "1"], ["z", "2"]]);
    const expected = sha256(`z\u00001\u0000${sha256("2")}\né\u00001\u0000${sha256("1")}\n`);
    expect((await digestTree(dir)).sha256).toBe(expected);
  });

  it("changes when content, names or file set change", async () => {
    const dir = await tree("t", [["a", "1"], ["b", "2"]]);
    const base = await digestTree(dir);
    await writeFile(join(dir, "a"), "9");
    const edited = await digestTree(dir);
    expect(edited.sha256).not.toBe(base.sha256);
    await rename(join(dir, "a"), join(dir, "c"));
    const renamed = await digestTree(dir);
    expect(renamed.sha256).not.toBe(edited.sha256);
    await rm(join(dir, "c"));
    const removed = await digestTree(dir);
    expect(removed.files).toBe(1);
    expect(removed.sha256).not.toBe(renamed.sha256);
  });

  it("handles an empty folder", async () => {
    const dir = await tree("empty", []);
    expect(await digestTree(dir)).toEqual({ sha256: sha256(""), files: 0, bytes: 0 });
  });
});

describe("countFiles", () => {
  it("counts files recursively, ignoring folders", async () => {
    const dir = await tree("t", [["a", "1"], ["x/b", "2"], ["x/y/c", "3"]]);
    await mkdir(join(dir, "empty"));
    expect(await countFiles(dir)).toBe(3);
  });

  it("returns undefined for a missing folder", async () => {
    expect(await countFiles(join(root, "missing"))).toBeUndefined();
  });
});
