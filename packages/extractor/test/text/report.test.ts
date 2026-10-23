import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTextReport, EXPECTED_TEXT_COUNTS } from "../../src/text/report.ts";
import { sandbox, type Sandbox } from "../pipeline/helpers.ts";

let box: Sandbox;
let catalog: string;
beforeEach(async () => {
  box = await sandbox();
  catalog = join(box.root, "catalog");
  await mkdir(join(catalog, "en"), { recursive: true });
});
afterEach(async () => {
  await box.cleanup();
});

async function writeReport(overrides: Record<string, unknown> = {}) {
  await writeFile(join(catalog, "report.json"), JSON.stringify({ kind: "text-report", formatVersion: 1, records: [], banks: EXPECTED_TEXT_COUNTS.banks, texts: EXPECTED_TEXT_COUNTS.texts, namedBanks: 11, compressedTexts: 738, unknownCharacters: [{ code: 0x1a3, count: 3, banks: [810] }], unknownCommands: [{ command: 0x200, count: 2, params: 1 }], roundTrip: { banks: EXPECTED_TEXT_COUNTS.banks, identical: EXPECTED_TEXT_COUNTS.banks }, ...overrides }));
  await writeFile(join(catalog, "index.json"), JSON.stringify({ kind: "text-index", formatVersion: 1, language: "en", records: [{ id: 237, name: "species-names", count: 500 }] }));
}

describe("buildTextReport", () => {
  it("is ok when counts, round trip and references match", async () => {
    await writeReport();
    const r = await buildTextReport(catalog, { expectedBanks: EXPECTED_TEXT_COUNTS.banks, expectedTexts: EXPECTED_TEXT_COUNTS.texts, references: [] });
    expect(r.ok).toBe(true);
    expect(r.alerts.length).toBeGreaterThan(0);
  });

  it("fails when the catalog report is missing", async () => {
    const r = await buildTextReport(catalog, { expectedBanks: 829, expectedTexts: 49984, references: [] });
    expect(r.ok).toBe(false);
    expect(r.lines.join("\n")).toMatch(/ausente/);
  });

  it("fails when a count differs from the expected", async () => {
    await writeReport({ banks: 828 });
    const r = await buildTextReport(catalog, { expectedBanks: 829, expectedTexts: 49984, references: [] });
    expect(r.ok).toBe(false);
  });

  it("fails when a bank does not recode to the same bytes", async () => {
    await writeReport({ roundTrip: { banks: 829, identical: 828 } });
    const r = await buildTextReport(catalog, { expectedBanks: 829, expectedTexts: 49984, references: [] });
    expect(r.ok).toBe(false);
  });

  it("fails on a name reference whose text does not exist (SC-004)", async () => {
    await writeReport();
    const r = await buildTextReport(catalog, {
      expectedBanks: 829,
      expectedTexts: 49984,
      references: [{ catalog: "species-names", index: 999 }],
    });
    expect(r.ok).toBe(false);
    expect(r.lines.join("\n")).toMatch(/species-names.*999/);
  });

  it("lists unknown characters as alerts only", async () => {
    await writeReport();
    const r = await buildTextReport(catalog, { expectedBanks: 829, expectedTexts: 49984, references: [] });
    expect(r.alerts.join("\n")).toMatch(/0x01A3/);
  });
});
