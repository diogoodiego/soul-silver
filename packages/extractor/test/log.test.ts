import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createConsoleLogger, createFileLogger } from "../src/log.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ss-log-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const LINE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z (INFO|WARN|ERROR)( \[[\w-]+\])? .+$/;

describe("createFileLogger", () => {
  it("writes one formatted line per event, creating parent folders", async () => {
    const path = join(dir, "logs", "extractor.log");
    const log = createFileLogger(path);
    log.info("started");
    log.warn("careful", "rom-unpack");
    log.error("failed", Object.assign(new Error("disk"), { code: "ENOSPC" }), "rom-unpack");
    const lines = (await readFile(path, "utf8")).trimEnd().split("\n");
    expect(lines[0]).toMatch(LINE);
    expect(lines[0]).toContain("INFO started");
    expect(lines[1]).toContain("WARN [rom-unpack] careful");
    expect(lines[2]).toContain("ERROR [rom-unpack] failed");
    expect(lines[2]).toContain("[ENOSPC]");
    expect(lines.slice(2).join("\n")).toContain("Error: disk");
  });

  it("rotates to extractor.1.log past maxBytes, keeping a single backup", async () => {
    const path = join(dir, "extractor.log");
    const log = createFileLogger(path, { maxBytes: 200 });
    for (let i = 0; i < 20; i++) log.info(`line ${i} ${"x".repeat(40)}`);
    expect((await readdir(dir)).sort()).toEqual(["extractor.1.log", "extractor.log"]);
    const current = await readFile(path, "utf8");
    expect(current.length).toBeLessThanOrEqual(200);
    expect(current).toContain("line 19");
  });

  it("never writes binary data", async () => {
    const path = join(dir, "extractor.log");
    const log = createFileLogger(path);
    const bytes = new Uint8Array(64).fill(0x41);
    log.error("bad", bytes);
    log.info(Buffer.from("AAAA") as unknown as string);
    const content = await readFile(path, "utf8");
    expect(content).toContain("<binary 64 bytes>");
    expect(content).toContain("<binary 4 bytes>");
    expect(content).not.toContain("AAAA");
  });
});

describe("createConsoleLogger", () => {
  it("uses the same format", () => {
    const lines: string[] = [];
    createConsoleLogger((line) => lines.push(line)).info("hello", "rom-unpack");
    expect(lines[0]).toMatch(LINE);
  });
});
