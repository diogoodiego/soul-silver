import { describe, expect, it } from "vitest";
import { formatSanityReport, type SanityReport } from "../../src/data/report.ts";

const okReport = (): SanityReport => ({
  ok: true,
  files: [
    { kind: "species", file: "species.json", status: "ok" },
    { kind: "moves", file: "moves.json", status: "ok" },
  ],
  counts: [
    { name: "espécies", expected: 493, actual: 493, ok: true },
    { name: "golpes", expected: 467, actual: 467, ok: true },
  ],
  warnings: [],
  ignored: [{ kind: "moves", detail: "membros do NARC depois do golpe 467 não são usados" }],
});

describe("formatSanityReport", () => {
  it("prints the sections and an OK result", () => {
    const text = formatSanityReport(okReport(), "C:/out");
    expect(text).toContain("Relatório de sanidade — C:/out");
    for (const section of ["Arquivos", "Contagens", "Alertas (0)", "Ignorados"]) expect(text).toContain(section);
    expect(text).toContain("ok       species.json");
    expect(text).toContain("493 / 493");
    expect(text.trimEnd().split("\n").at(-1)).toBe("Resultado: OK");
  });

  it("marks failing counts and says how many failed", () => {
    const report = okReport();
    report.ok = false;
    report.counts[1] = { name: "golpes", expected: 467, actual: 466, ok: false };
    const text = formatSanityReport(report, "x");
    expect(text).toMatch(/FALHA\s+golpes\s+466 \/ 467/);
    expect(text.trimEnd().split("\n").at(-1)).toBe("Resultado: FALHA (1 contagem)");
  });

  it("marks missing and invalid files with their problem", () => {
    const report = okReport();
    report.ok = false;
    report.files = [
      { kind: "species", file: "species.json", status: "invalid", error: { path: "records.5.baseStats.hp", problem: "esperado valor ≤ 255" } },
      { kind: "moves", file: "moves.json", status: "missing" },
    ];
    const text = formatSanityReport(report, "x");
    expect(text).toMatch(/inválido\s+species\.json.*records\.5\.baseStats\.hp.*esperado valor ≤ 255/);
    expect(text).toMatch(/ausente\s+moves\.json/);
    expect(text.trimEnd().split("\n").at(-1)).toBe("Resultado: FALHA (2 arquivos)");
  });

  it("lists warnings with record, field, value and expected range, and still says OK", () => {
    const report = okReport();
    report.warnings = [{ kind: "moves", recordId: 200, field: "accuracy", value: "150", expected: "1–100 ou null" }];
    const text = formatSanityReport(report, "x");
    expect(text).toContain("Alertas (1)");
    expect(text).toMatch(/moves #200\s+accuracy\s+150\s+esperado 1–100 ou null/);
    expect(text.trimEnd().split("\n").at(-1)).toBe("Resultado: OK (1 alerta)");
  });
});
