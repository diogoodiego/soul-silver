import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRegistry } from "../../src/pipeline/registry.ts";
import { runPipeline } from "../../src/pipeline/run.ts";
import type { Stage } from "../../src/pipeline/stage.ts";
import { romUnpackStage } from "../../src/stages/rom-unpack.ts";
import { buildNarc } from "../fixtures/build-narc.ts";
import { buildNdsRom, HEADER_SIZE } from "../fixtures/build-nds-rom.ts";
import { memoryLogger, sandbox, type Sandbox } from "../pipeline/helpers.ts";

const bytes = (...values: number[]) => Uint8Array.from(values);
const m0 = bytes(1, 2, 3);
const m1 = bytes(4, 5);
const x = bytes(6);
const files = {
  "a/0/0/0": buildNarc([m0, m1]),
  "a/0/0/1": buildNarc([x], ["foo/bar.bin"]),
  "data/plain.bin": bytes(7, 7, 7),
};
const arm9 = new Uint8Array(32).fill(9);
const arm7 = new Uint8Array(24).fill(7);
const overlays9 = [bytes(0x90, 0x91)];
const overlays7 = [bytes(0x70)];
const banner = new Uint8Array(0x840).fill(0xbb);

let box: Sandbox;
let fractions: number[];
beforeEach(async () => {
  box = await sandbox(buildNdsRom({ files, arm9, arm7, overlays9, overlays7, banner }));
  fractions = [];
  const spy: Stage = { ...romUnpackStage, run: (ctx) => romUnpackStage.run({ ...ctx, progress: (f) => {
    fractions.push(f);
    ctx.progress(f);
  } }) };
  const result = await runPipeline({
    workspaceDir: box.workspaceDir,
    romPath: box.romPath,
    registry: createRegistry([spy]),
    log: memoryLogger(),
    references: [box.romSha1],
  });
  expect(result.status).toBe("completed");
});
afterEach(async () => {
  await box.cleanup();
});

const out = (...parts: string[]) => join(box.workspaceDir, "stages", "rom-unpack", ...parts);
const read = async (...parts: string[]) => new Uint8Array(await readFile(out(...parts)));

describe("romUnpackStage", () => {
  it("declares the documented metadata", () => {
    expect(romUnpackStage).toMatchObject({
      id: "rom-unpack",
      title: "Desempacotando a ROM",
      version: 1,
      weight: 10,
      inputs: [{ kind: "rom" }],
      outputs: ["binaries", "filesystem", "narc"],
    });
    expect(romUnpackStage.estimateBytes(100)).toBe(250);
  });

  it("writes the binaries", async () => {
    expect((await read("binaries", "header.bin")).length).toBe(HEADER_SIZE);
    expect(await read("binaries", "header.bin")).toEqual(box.rom.subarray(0, HEADER_SIZE));
    expect(await read("binaries", "arm9.bin")).toEqual(arm9);
    expect(await read("binaries", "arm7.bin")).toEqual(arm7);
    expect(await read("binaries", "banner.bin")).toEqual(banner);
    expect((await read("binaries", "y9.bin")).length).toBe(32);
    expect((await read("binaries", "y7.bin")).length).toBe(32);
    expect(await read("binaries", "overlay9", "0000.bin")).toEqual(overlays9[0]);
    expect(await read("binaries", "overlay7", "0000.bin")).toEqual(overlays7[0]);
  });

  it("mirrors the file system byte for byte, NARCs included", async () => {
    for (const [path, data] of Object.entries(files)) {
      expect(await read("filesystem", ...path.split("/"))).toEqual(data);
    }
  });

  it("unpacks every NARC by member index", async () => {
    expect(await read("narc", "a", "0", "0", "0", "0000.bin")).toEqual(m0);
    expect(await read("narc", "a", "0", "0", "0", "0001.bin")).toEqual(m1);
    expect(await readdir(out("narc", "a", "0", "0", "0"))).toEqual(["0000.bin", "0001.bin"]);
    expect(await read("narc", "a", "0", "0", "1", "0000.bin")).toEqual(x);
    expect(JSON.parse(await readFile(out("narc", "a", "0", "0", "1", "names.json"), "utf8"))).toEqual({ "0": "foo/bar.bin" });
    expect(await readdir(out("narc"))).toEqual(["a"]);
  });

  it("reports progress fractions between 0 and 1, ending at 1", () => {
    expect(fractions.length).toBeGreaterThan(1);
    expect(fractions.every((f) => f >= 0 && f <= 1)).toBe(true);
    expect(fractions.at(-1)).toBe(1);
  });
});
