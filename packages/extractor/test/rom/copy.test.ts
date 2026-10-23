import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copyRom } from "../../src/rom/copy.ts";
import { sha1Hex } from "../fixtures/build-nds-rom.ts";

let dir: string;
let source: string;
const content = new Uint8Array(200_000).map((_, i) => i % 251);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ss-copy-"));
  source = join(dir, "source.nds");
  await writeFile(source, content);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("copyRom", () => {
  it("copies into a new folder and leaves no temporary file", async () => {
    const dest = join(dir, "rom", "soulsilver.nds");
    await copyRom(source, dest, sha1Hex(content));
    expect(new Uint8Array(await readFile(dest))).toEqual(content);
    expect(await readdir(join(dir, "rom"))).toEqual(["soulsilver.nds"]);
  });

  it("replaces an existing copy", async () => {
    const dest = join(dir, "soulsilver.nds");
    await writeFile(dest, "old");
    await copyRom(source, dest, sha1Hex(content));
    expect(new Uint8Array(await readFile(dest))).toEqual(content);
  });

  it("throws on a hash mismatch and leaves neither copy nor temporary", async () => {
    const dest = join(dir, "rom", "soulsilver.nds");
    await expect(copyRom(source, dest, "0".repeat(40))).rejects.toThrow(/SHA-1/);
    expect(await readdir(join(dir, "rom"))).toEqual([]);
  });

  it("stops on abort and leaves neither copy nor temporary", async () => {
    const dest = join(dir, "rom", "soulsilver.nds");
    const controller = new AbortController();
    controller.abort();
    await expect(copyRom(source, dest, sha1Hex(content), controller.signal)).rejects.toThrow();
    expect(await readdir(join(dir, "rom"))).toEqual([]);
  });
});
