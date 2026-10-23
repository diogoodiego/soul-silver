import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main, type CliIo } from "../../src/cli.ts";
import { sandbox, type Sandbox } from "../pipeline/helpers.ts";

let box: Sandbox;
let out: string;
beforeEach(async () => {
  box = await sandbox();
  out = join(box.root, "out");
  const en = join(out, "stages", "text-catalog", "catalog", "en");
  await mkdir(en, { recursive: true });
  await writeFile(join(en, "0034.json"), JSON.stringify({ kind: "text-bank", formatVersion: 1, language: "en", bank: 34, name: "nature-names", records: [{ id: 0, text: "Hardy {trainer-name:0}" }, { id: 1, text: "Lonely{n}grin" }] }));
});
afterEach(async () => {
  await box.cleanup();
});

function io(): CliIo & { lines: string[]; errors: string[] } {
  const lines: string[] = [];
  const errors: string[] = [];
  return { lines, errors, stdout: (l) => lines.push(l), stderr: (l) => errors.push(l), isTTY: false };
}

describe("--find", () => {
  it("prints identifier, bank name and text for each match", async () => {
    const c = io();
    expect(await main(["--out", out, "--find", "hardy"], c)).toBe(0);
    expect(c.lines.join("\n")).toContain("0034:0");
    expect(c.lines.join("\n")).toContain("nature-names");
    expect(c.lines.join("\n")).toContain("{trainer-name:0}");
  });

  it("finds a phrase across a line break", async () => {
    const c = io();
    expect(await main(["--out", out, "--find", "lonely grin"], c)).toBe(0);
    expect(c.lines.join("\n")).toContain("0034:1");
  });

  it("says when nothing matches and exits 0", async () => {
    const c = io();
    expect(await main(["--out", out, "--find", "zzzz"], c)).toBe(0);
    expect(c.lines.join("\n")).toContain('nenhum texto contém "zzzz"');
  });

  it("refuses to combine with other modes", async () => {
    expect(await main(["--out", out, "--find", "x", "--report"], io())).toBe(2);
    expect(await main(["--out", out, "--find", "x", "--verify"], io())).toBe(2);
    expect(await main(["--rom", "x.nds", "--find", "x"], io())).toBe(2);
  });

  it("refuses an invalid limit", async () => {
    expect(await main(["--out", out, "--find", "x", "--limit", "0"], io())).toBe(2);
    expect(await main(["--out", out, "--find", "x", "--limit", "1001"], io())).toBe(2);
  });

  it("fails when there is no catalog", async () => {
    const c = io();
    expect(await main(["--out", join(box.root, "empty"), "--find", "x"], c)).toBe(1);
    expect(c.errors.join("\n")).toMatch(/extração/);
  });
});
