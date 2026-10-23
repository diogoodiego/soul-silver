import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRegistry } from "../../src/pipeline/registry.ts";
import { runPipeline } from "../../src/pipeline/run.ts";
import { codeDecompressStage } from "../../src/stages/code-decompress.ts";
import { romUnpackStage } from "../../src/stages/rom-unpack.ts";
import { buildNdsRom } from "../fixtures/build-nds-rom.ts";
import { encodeArm9, encodeBlz } from "../fixtures/game-data/blz-encode.ts";
import { memoryLogger, sandbox, type Sandbox } from "../pipeline/helpers.ts";

const body = () => Uint8Array.from({ length: 600 }, (_, i) => "ARMCODE!".charCodeAt(i % 8));
const overlay0 = () => Uint8Array.from({ length: 300 }, (_, i) => "OVERLAY0".charCodeAt(i % 8));
const overlay1 = () => Uint8Array.from({ length: 50 }, (_, i) => i);

let box: Sandbox;
let arm9Expected: Uint8Array;

beforeEach(async () => {
  const arm9 = encodeArm9(body());
  arm9Expected = arm9.expected;
  box = await sandbox(
    buildNdsRom({
      arm9: arm9.file,
      overlays9: [encodeBlz(overlay0()), overlay1()],
      compressedOverlays9: [true, false],
    }),
  );
  const result = await runPipeline({
    workspaceDir: box.workspaceDir,
    romPath: box.romPath,
    registry: createRegistry([romUnpackStage, codeDecompressStage]),
    log: memoryLogger(),
    references: [box.romSha1],
  });
  expect(result.status).toBe("completed");
});
afterEach(async () => {
  await box.cleanup();
});

const read = async (...parts: string[]) =>
  new Uint8Array(await readFile(join(box.workspaceDir, "stages", "code-decompress", "code", ...parts)));

describe("codeDecompressStage", () => {
  it("declares the documented metadata", () => {
    expect(codeDecompressStage).toMatchObject({
      id: "code-decompress",
      title: "Descomprimindo o código do jogo",
      version: 1,
      weight: 2,
      inputs: [{ kind: "stage", stage: "rom-unpack", output: "binaries" }],
      outputs: ["code"],
    });
    expect(codeDecompressStage.estimateBytes(123)).toBe(8 * 1024 * 1024);
  });

  it("writes the decompressed ARM9", async () => {
    expect(await read("arm9.bin")).toEqual(arm9Expected);
  });

  it("writes every ARM9 overlay, decompressing only the flagged ones", async () => {
    expect(await read("overlay9", "0000.bin")).toEqual(overlay0());
    expect(await read("overlay9", "0001.bin")).toEqual(overlay1());
  });
});
