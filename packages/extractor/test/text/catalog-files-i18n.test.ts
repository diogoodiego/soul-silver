import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadTranslatedCatalog } from "../../src/text/catalog-files.ts";
import type { TextBankFile } from "@soulsilver/shared/text";
import { sandbox, type Sandbox } from "../pipeline/helpers.ts";

let box: Sandbox;
let root: string;
beforeEach(async () => {
  box = await sandbox();
  root = join(box.root, "catalog");
  await mkdir(join(root, "pt-BR"), { recursive: true });
});
afterEach(async () => {
  await box.cleanup();
});

const english: TextBankFile[] = [
  { kind: "text-bank", formatVersion: 1, language: "en", bank: 34, name: null, records: [{ id: 0, text: "Hi {trainer-name:0}" }, { id: 1, text: "Plain" }] },
];

const file = (language: string, records: Array<{ id: number; text: string }>) =>
  JSON.stringify({ kind: "text-bank", formatVersion: 1, language, bank: 34, name: null, records });

describe("loadTranslatedCatalog", () => {
  it("loads a partial translation that keeps the variables", async () => {
    await writeFile(join(root, "pt-BR", "0034.json"), file("pt-BR", [{ id: 0, text: "Oi {trainer-name:0}" }]));
    const banks = await loadTranslatedCatalog(root, "pt-BR", english);
    expect(banks[0]!.records).toEqual([{ id: 0, text: "Oi {trainer-name:0}" }]);
  });

  it("refuses a translation whose language does not match its folder", async () => {
    await writeFile(join(root, "pt-BR", "0034.json"), file("en", [{ id: 0, text: "Hi {trainer-name:0}" }]));
    await expect(loadTranslatedCatalog(root, "pt-BR", english)).rejects.toThrow(/language/);
  });

  it("refuses a text the English catalog does not have", async () => {
    await writeFile(join(root, "pt-BR", "0034.json"), file("pt-BR", [{ id: 9, text: "Novo" }]));
    await expect(loadTranslatedCatalog(root, "pt-BR", english)).rejects.toThrow(/034:9|0034\.json/);
  });

  it("refuses a translation that drops a variable", async () => {
    await writeFile(join(root, "pt-BR", "0034.json"), file("pt-BR", [{ id: 0, text: "Oi" }]));
    await expect(loadTranslatedCatalog(root, "pt-BR", english)).rejects.toThrow(/trainer-name:0/);
  });
});
