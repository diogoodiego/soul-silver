import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serializeMapFile, type MapReportEntry } from "@soulsilver/shared/maps";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildMapReport } from "../../src/maps/report.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ss-maps-report-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(records: MapReportEntry[]) {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "report.json"), serializeMapFile("map-report", { kind: "map-report", formatVersion: 1, records }));
}

const ok = (id: number): MapReportEntry => ({ id, status: "success", warnings: [] });

describe("buildMapReport", () => {
  it("passes with at least 95% of the maps without failure, listing every failure with its reason", async () => {
    const records = Array.from({ length: 20 }, (_, i) => ok(i));
    records[3] = { id: 3, status: "failure", stage: "grid", reason: "Matriz: o mapa não ocupa nenhuma célula da matriz 0", warnings: [] };
    await write(records);
    const report = await buildMapReport(dir);
    expect(report.ok).toBe(true);
    expect(report.lines[0]).toBe("Mapas");
    expect(report.lines).toContain("  ok       mapas sem falha       19 / 20 (95.0%)");
    expect(report.lines).toContain("    0003  Matriz: o mapa não ocupa nenhuma célula da matriz 0");
  });

  it("fails below 95%", async () => {
    await write([ok(0), { id: 1, status: "failure", stage: "render", reason: "Renderização: x", warnings: [] }]);
    expect((await buildMapReport(dir)).ok).toBe(false);
  });

  it("lists the maps with animated textures and the behaviors left without a category", async () => {
    await write([
      { id: 0, status: "successWithWarnings", warnings: [{ code: "animated-texture", detail: "wind_lm3" }, { code: "unknown-permission", detail: "0x65, 0x69" }] },
      { id: 7, status: "successWithWarnings", warnings: [{ code: "unknown-permission", detail: "0x65" }] },
    ]);
    const { lines } = await buildMapReport(dir);
    expect(lines).toContain("  Mapas com textura animada (1): 0000");
    expect(lines).toContain("  Comportamentos sem categoria: 0x65 (2 mapas), 0x69 (1 mapa)");
  });

  it("says when the stage did not run", async () => {
    const report = await buildMapReport(join(dir, "missing"));
    expect(report).toEqual({ ok: true, lines: ["Mapas", "  não extraído (etapa maps não rodou)"] });
  });
});
