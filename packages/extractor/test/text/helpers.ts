import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Stage } from "../../src/pipeline/stage.ts";

/** A stand-in for rom-unpack that writes the message bank folder (a/0/2/7) from `banks`. */
export function unpackFixture(banks: Map<number, Uint8Array>): Stage {
  return {
    id: "rom-unpack",
    title: "Desempacotando a ROM",
    version: 1,
    weight: 1,
    inputs: [{ kind: "rom" }],
    outputs: ["binaries", "filesystem", "narc"],
    estimateBytes: () => 1024,
    run: async (ctx) => {
      await mkdir(ctx.outputDir("binaries"), { recursive: true });
      await mkdir(ctx.outputDir("filesystem"), { recursive: true });
      const folder = join(ctx.outputDir("narc"), "a", "0", "2", "7");
      await mkdir(folder, { recursive: true });
      for (const [index, bytes] of banks) await writeFile(join(folder, `${String(index).padStart(4, "0")}.bin`), bytes);
    },
  };
}
