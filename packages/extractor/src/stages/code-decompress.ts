import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { decompressArm9, decompressOverlay, readOverlayTable } from "../data/code.ts";
import type { Stage, StageContext } from "../pipeline/stage.ts";
import { indexName } from "./rom-unpack.ts";

// Decompressed ARM9 and ARM9 overlays, where several tables live (contracts/stages.md).

const ARM9_LOAD_ADDRESS_OFFSET = 0x28;

async function run(ctx: StageContext): Promise<void> {
  const binaries = ctx.inputDir("rom-unpack", "binaries");
  const code = ctx.outputDir("code");
  const write = async (path: string, data: Uint8Array) => {
    ctx.signal.throwIfAborted();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  };

  const header = new Uint8Array(await readFile(join(binaries, "header.bin")));
  const loadAddress = new DataView(header.buffer).getUint32(ARM9_LOAD_ADDRESS_OFFSET, true);
  const arm9 = new Uint8Array(await readFile(join(binaries, "arm9.bin")));
  await write(join(code, "arm9.bin"), decompressArm9(arm9, loadAddress));
  ctx.progress(0.3);

  const overlays = readOverlayTable(new Uint8Array(await readFile(join(binaries, "y9.bin"))));
  for (const entry of overlays) {
    const name = indexName(entry.index, overlays.length);
    const raw = new Uint8Array(await readFile(join(binaries, "overlay9", name)));
    await write(join(code, "overlay9", name), decompressOverlay(raw, entry));
    ctx.progress(0.3 + (0.7 * (entry.index + 1)) / overlays.length);
  }
  ctx.progress(1);
}

export const codeDecompressStage: Stage = {
  id: "code-decompress",
  title: "Descomprimindo o código do jogo",
  version: 1,
  weight: 2,
  inputs: [{ kind: "stage", stage: "rom-unpack", output: "binaries" }],
  outputs: ["code"],
  estimateBytes: () => 8 * 1024 * 1024,
  run,
};
