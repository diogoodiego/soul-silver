import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadTextCatalog } from "../../src/text/catalog-files.ts";
import { sandbox, type Sandbox } from "../pipeline/helpers.ts";

let box: Sandbox;
let root: string;
beforeEach(async () => {
  box = await sandbox();
  root = join(box.root, "catalog");
  await mkdir(join(root, "en"), { recursive: true });
});
afterEach(async () => {
  await box.cleanup();
});

const bank = (number: number, records: Array<{ id: number; text: string }>, language = "en") =>
  JSON.stringify({ kind: "text-bank", formatVersion: 1, language, bank: number, name: null, records }, null, 2);

describe("loadTextCatalog", () => {
  it("loads every NNNN.json of the language folder, in bank order", async () => {
    await writeFile(join(root, "en", "0034.json"), bank(34, [{ id: 0, text: "Hardy" }]));
    await writeFile(join(root, "en", "0002.json"), bank(2, [{ id: 0, text: "x" }]));
    const banks = await loadTextCatalog(root, "en");
    expect(banks.map((b) => b.bank)).toEqual([2, 34]);
  });

  it("ignores files whose names are not NNNN.json", async () => {
    await writeFile(join(root, "en", "notes.txt"), "hello");
    await writeFile(join(root, "en", "0001.json"), bank(1, [{ id: 0, text: "a" }]));
    expect((await loadTextCatalog(root, "en")).length).toBe(1);
  });

  it("names the file and the path when a file is invalid", async () => {
    await writeFile(join(root, "en", "0001.json"), bank(1, [{ id: 0, text: "{foo:0}" }]));
    await expect(loadTextCatalog(root, "en")).rejects.toThrow(/0001\.json.*records\.0\.text/);
  });

  it("refuses invalid JSON, naming the file", async () => {
    await writeFile(join(root, "en", "0003.json"), "{nope");
    await expect(loadTextCatalog(root, "en")).rejects.toThrow(/0003\.json/);
  });

  it("returns an empty list for a language that has no folder", async () => {
    expect(await loadTextCatalog(root, "pt-BR")).toEqual([]);
  });
});
