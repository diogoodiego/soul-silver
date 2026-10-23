import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readNdsFileSystem } from "../nds/filesystem.ts";
import { NDS_HEADER_SIZE } from "../nds/header.ts";
import { isNarc, parseNarc } from "../nds/narc.ts";
import type { Stage, StageContext } from "../pipeline/stage.ts";

// Stage 1: raw DS file system and NARC members; layout in research.md R6.

function indexName(index: number, count: number): string {
  return `${String(index).padStart(Math.max(4, String(count - 1).length), "0")}.bin`;
}

async function run(ctx: StageContext): Promise<void> {
  const { rom } = ctx;
  const fs = readNdsFileSystem(rom);
  const { header } = fs;
  const slice = (offset: number, size: number) => rom.subarray(offset, offset + size);

  const total =
    NDS_HEADER_SIZE +
    header.arm9.size + header.arm7.size + header.banner.size + header.y9.size + header.y7.size +
    [...fs.overlays9, ...fs.overlays7].reduce((sum, o) => sum + o.end - o.start, 0) +
    fs.files.reduce((sum, f) => sum + 2 * (f.end - f.start), 0);
  let written = 0;
  const write = async (path: string, data: Uint8Array) => {
    ctx.signal.throwIfAborted();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
    written += data.length;
    ctx.progress(total === 0 ? 1 : Math.min(1, written / total));
  };

  const binaries = ctx.outputDir("binaries");
  await write(join(binaries, "header.bin"), slice(0, NDS_HEADER_SIZE));
  await write(join(binaries, "arm9.bin"), slice(header.arm9.offset, header.arm9.size));
  await write(join(binaries, "arm7.bin"), slice(header.arm7.offset, header.arm7.size));
  await write(join(binaries, "banner.bin"), slice(header.banner.offset, header.banner.size));
  await write(join(binaries, "y9.bin"), slice(header.y9.offset, header.y9.size));
  await write(join(binaries, "y7.bin"), slice(header.y7.offset, header.y7.size));
  for (const [folder, overlays] of [["overlay9", fs.overlays9], ["overlay7", fs.overlays7]] as const) {
    for (const overlay of overlays) {
      await write(join(binaries, folder, indexName(overlay.index, overlays.length)), rom.subarray(overlay.start, overlay.end));
    }
  }

  const filesystem = ctx.outputDir("filesystem");
  const narcRoot = ctx.outputDir("narc");
  for (const file of fs.files) {
    const data = rom.subarray(file.start, file.end);
    const parts = file.path.split("/");
    await write(join(filesystem, ...parts), data);
    if (!isNarc(data)) {
      written += data.length;
      continue;
    }
    const narc = parseNarc(data);
    const folder = join(narcRoot, ...parts);
    await mkdir(folder, { recursive: true });
    for (const [index, member] of narc.members.entries()) {
      await write(join(folder, indexName(index, narc.members.length)), member);
    }
    written += data.length - narc.members.reduce((sum, m) => sum + m.length, 0);
    if (narc.names) await writeFile(join(folder, "names.json"), `${JSON.stringify(narc.names, null, 2)}\n`);
  }
  ctx.progress(1);
}

export const romUnpackStage: Stage = {
  id: "rom-unpack",
  title: "Desempacotando a ROM",
  version: 1,
  weight: 10,
  inputs: [{ kind: "rom" }],
  outputs: ["binaries", "filesystem", "narc"],
  estimateBytes: (romSize) => romSize * 2.5,
  run,
};
