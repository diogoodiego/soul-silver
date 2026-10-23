import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CliIo, main } from "../src/cli.ts";
import { acquireLock } from "../src/pipeline/lock.ts";
import { type Manifest, readManifest } from "../src/pipeline/manifest.ts";
import { createRegistry } from "../src/pipeline/registry.ts";
import { runPipeline } from "../src/pipeline/run.ts";
import { defaultStages } from "../src/stages/index.ts";
import { buildNarc } from "./fixtures/build-narc.ts";
import { buildNdsRom, corruptByte } from "./fixtures/build-nds-rom.ts";
import { memoryLogger, sandbox, type Sandbox } from "./pipeline/helpers.ts";

const rom = buildNdsRom({ files: { "a/0/0/0": buildNarc([Uint8Array.of(1, 2), Uint8Array.of(3)]), "data/x.bin": Uint8Array.of(9) } });

let box: Sandbox;
beforeEach(async () => {
  box = await sandbox(rom);
});
afterEach(async () => {
  await box.cleanup();
});

interface Captured extends CliIo {
  out: string[];
  err: string[];
}

function io(extra: Partial<CliIo> = {}): Captured {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
    isTTY: false,
    references: [box.romSha1],
    ...extra,
  };
}

const out = () => join(box.root, "out");
const base = () => ["--rom", box.romPath, "--out", out()];

describe("extractor CLI", () => {
  it("lists stages without a ROM", async () => {
    const captured = io();
    expect(await main(["--list"], captured)).toBe(0);
    expect(captured.out.join("\n")).toContain("rom-unpack v1");
  });

  it.each([
    [["--out", "x"]],
    [["--rom", "x", "--bogus"]],
    [["--rom", "x", "--stages", "nope"]],
    [["--rom", "x", "--force", "nope"]],
  ])("exits 2 on usage errors (%s)", async (argv) => {
    const captured = io();
    expect(await main(argv, captured)).toBe(2);
    expect(captured.err.length).toBeGreaterThan(0);
  });

  it("exits 3 with the app's message for a rejected ROM", async () => {
    const bad = join(box.root, "hg.nds");
    await writeFile(bad, buildNdsRom({ gameCode: "IPKE" }));
    const captured = io();
    expect(await main(["--rom", bad, "--out", out()], captured)).toBe(3);
    expect(captured.err.join("\n")).toContain("HeartGold");
  });

  it("extracts, then skips up-to-date stages, then forces them", async () => {
    const first = io();
    expect(await main(base(), first)).toBe(0);
    expect(await readManifest(out(), memoryLogger())).toBeDefined();
    expect(first.out.join("\n")).toContain("rom-unpack: missing");

    const second = io();
    expect(await main(base(), second)).toBe(0);
    expect(second.out.join("\n")).toContain("rom-unpack: em dia, pulada");

    const forced = io();
    expect(await main([...base(), "--force", "rom-unpack"], forced)).toBe(0);
    expect(forced.out.join("\n")).toContain("rom-unpack: forced");
  });

  it("verifies outputs and reports corruption", async () => {
    expect(await main(base(), io())).toBe(0);
    expect(await main([...base(), "--verify"], io())).toBe(0);
    const file = join(out(), "stages", "rom-unpack", "filesystem", "data", "x.bin");
    await writeFile(file, corruptByte(new Uint8Array(await readFile(file)), 0));
    const captured = io();
    expect(await main([...base(), "--verify"], captured)).toBe(1);
    expect(captured.out.join("\n")).toContain("rom-unpack/filesystem");
  });

  it("exits 4 when the workspace is busy", async () => {
    await acquireLock(out());
    expect(await main(base(), io())).toBe(4);
  });

  it("prints progress every 10 points when not a TTY", async () => {
    const captured = io();
    await main(base(), captured);
    const lines = captured.out.filter((l) => /^\[rom-unpack\] .* \d+%$/.test(l));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThanOrEqual(11);
    expect(lines.at(-1)).toMatch(/100%$/);
  });

  it("exits 130 when interrupted", async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await main(base(), io({ signal: controller.signal }))).toBe(130);
  });

  it("writes a log file with --log", async () => {
    const logPath = join(box.root, "cli.log");
    await main([...base(), "--log", logPath], io());
    expect(await readFile(logPath, "utf8")).toContain("Extraction started");
  });
});

describe("app and CLI parity (SC-008)", () => {
  function withoutDates(manifest: Manifest | undefined) {
    const copy = structuredClone(manifest!) as Partial<Manifest>;
    delete copy.createdAt;
    delete copy.updatedAt;
    delete copy.completedAt;
    for (const stage of Object.values(copy.stages!)) delete (stage as { completedAt?: string }).completedAt;
    return copy;
  }

  it("produces the same manifest through the library and through the CLI", async () => {
    const appDir = join(box.root, "app");
    const result = await runPipeline({
      workspaceDir: appDir,
      romPath: box.romPath,
      registry: createRegistry(defaultStages),
      log: memoryLogger(),
      references: [box.romSha1],
    });
    expect(result.status).toBe("completed");
    expect(await main(base(), io())).toBe(0);
    expect(withoutDates(await readManifest(out(), memoryLogger()))).toEqual(withoutDates(await readManifest(appDir, memoryLogger())));
  });
});
