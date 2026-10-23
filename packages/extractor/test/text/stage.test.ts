import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseTextJson, type TextBankFile, type TextIndexFile, type TextReportFile } from "@soulsilver/shared/text";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRegistry } from "../../src/pipeline/registry.ts";
import { runPipeline } from "../../src/pipeline/run.ts";
import type { Stage } from "../../src/pipeline/stage.ts";
import { textCatalogStage } from "../../src/text/stage.ts";
import { buildBank } from "../fixtures/text/build-bank.ts";
import { memoryLogger, sandbox, type Sandbox } from "../pipeline/helpers.ts";

const MESSAGE_DIR = ["a", "0", "2", "7"];

/** A stand-in for rom-unpack that writes the message bank folder given by `banks`. */
function unpackStub(banks: Map<number, Uint8Array>): Stage {
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
      const folder = join(ctx.outputDir("narc"), ...MESSAGE_DIR);
      await mkdir(folder, { recursive: true });
      for (const [index, bytes] of banks) await writeFile(join(folder, `${String(index).padStart(4, "0")}.bin`), bytes);
    },
  };
}

// Bank 34 (nature names) with a variable, a color, a layout break, a known and an unknown character.
const bank34 = buildBank(
  [
    { words: [0x132, 0x14d, 0xfffe, 0x0103, 2, 0, 0, 0x1ab] },
    { words: [0x12b, 0xe000, 0x25bc, 0xfffe, 0xff00, 1, 1, 0x1a3] },
    { words: [] },
  ],
  { seed: 17 },
);
// Bank 0 with a compressed entry and an unknown command.
const bank0 = buildBank(
  [{ words: [0x12b, 0x145, 0x146], compressed: true }, { words: [0xfffe, 0xff02, 2, 1, 0] }],
  { seed: 1234 },
);

let box: Sandbox;
beforeEach(async () => {
  box = await sandbox();
});
afterEach(async () => {
  await box.cleanup();
});

async function run(banks: Map<number, Uint8Array>, stage: Stage = textCatalogStage) {
  return runPipeline({
    workspaceDir: box.workspaceDir,
    romPath: box.romPath,
    registry: createRegistry([unpackStub(banks), stage]),
    log: memoryLogger(),
    references: [box.romSha1],
  });
}

const catalogDir = () => join(box.workspaceDir, "stages", "text-catalog", "catalog");
const read = async (name: string) => readFile(join(catalogDir(), name), "utf8");

describe("textCatalogStage metadata", () => {
  it("matches contracts/stage-and-cli.md", () => {
    expect(textCatalogStage).toMatchObject({
      id: "text-catalog",
      title: "Convertendo os textos",
      version: 1,
      weight: 3,
      inputs: [{ kind: "stage", stage: "rom-unpack", output: "narc" }],
      outputs: ["catalog"],
    });
    expect(textCatalogStage.estimateBytes(1)).toBe(40 * 1024 * 1024);
  });
});

describe("textCatalogStage output", () => {
  it("writes one validated file per bank plus index and report", async () => {
    const result = await run(new Map([[0, bank0], [34, bank34]]));
    expect(result.status).toBe("completed");
    expect((await readdir(join(catalogDir(), "en"))).sort()).toEqual(["0000.json", "0034.json"]);

    const bank = parseTextJson("text-bank", await read("en/0034.json"), "0034.json");
    expect(bank.ok).toBe(true);
    if (bank.ok) {
      const data = bank.data;
      expect(data.bank).toBe(34);
      expect(data.name).toBe("nature-names");
      expect(data.records.map((r) => r.text)).toEqual([
        "Hi{trainer-name:0}!",
        "A{n}{page}{color:1}{raw:01A3}",
        "",
      ]);
    }
  });

  it("keeps compressed entries flagged and unnamed banks unnamed", async () => {
    await run(new Map([[0, bank0]]));
    const data = JSON.parse(await read("en/0000.json")) as TextBankFile;
    expect(data.name).toBeNull();
    expect(data.records[0]).toEqual({ id: 0, text: "Aab", compressed: true });
    expect(data.records[1]).toEqual({ id: 1, text: "{cmd:FF02:1,0}" });
  });

  it("lists unknown characters and commands in the report, nothing dropped", async () => {
    await run(new Map([[0, bank0], [34, bank34]]));
    const report = JSON.parse(await read("report.json")) as TextReportFile & { banks: number };
    expect(report.banks).toBe(2);
    expect(report.texts).toBe(5);
    expect(report.unknownCharacters).toEqual([{ code: 0x1a3, count: 1, banks: [34] }]);
    expect(report.unknownCommands).toEqual([{ command: 0xff02, count: 1, params: 2 }]);
    expect(report.roundTrip).toEqual({ banks: 2, identical: 2 });
  });

  it("writes an index with one row per bank, in order", async () => {
    await run(new Map([[34, bank34], [0, bank0]]));
    const index = JSON.parse(await read("index.json")) as TextIndexFile;
    expect(index.records).toEqual([
      { id: 0, name: null, count: 2 },
      { id: 34, name: "nature-names", count: 3 },
    ]);
  });

  it("fails naming the bank when a bank is corrupt", async () => {
    const corrupt = bank0.slice(0, 6);
    const result = await run(new Map([[0, corrupt]]));
    expect(result).toMatchObject({ status: "failed", error: { code: "stage-failed", stageId: "text-catalog" } });
    if (result.status === "failed" && result.error.code === "stage-failed") {
      expect(result.error.message).toMatch(/banco|bank|0000/i);
    }
  });

  it("reports progress from 0 to 1", async () => {
    const fractions: number[] = [];
    const stage: Stage = { ...textCatalogStage, run: (ctx) => textCatalogStage.run({ ...ctx, progress: (f) => { fractions.push(f); ctx.progress(f); } }) };
    await run(new Map([[0, bank0], [34, bank34]]), stage);
    expect(fractions[0]).toBeGreaterThanOrEqual(0);
    expect(fractions.at(-1)).toBe(1);
    expect(fractions.every((f) => f >= 0 && f <= 1)).toBe(true);
  });
});
