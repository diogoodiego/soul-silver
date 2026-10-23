// The "Textos" section of --report: counts, round trip, unknown codes and name references.
// See specs/005-text-catalog/contracts/stage-and-cli.md and tech-debt.md.
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { TEXT_REF_BANKS, type TextRefCatalog } from "@soulsilver/shared/text";

export const EXPECTED_TEXT_COUNTS = { banks: 829, texts: 49984 } as const;

export interface NameRef {
  catalog: TextRefCatalog;
  index: number;
}

export interface TextReportResult {
  ok: boolean;
  lines: string[];
  alerts: string[];
}

interface ReportShape {
  banks: number;
  texts: number;
  roundTrip: { banks: number; identical: number };
  unknownCharacters: Array<{ code: number; count: number; banks: number[] }>;
  unknownCommands: Array<{ command: number; count: number; params: number }>;
}

interface IndexShape {
  records: Array<{ id: number; name: string | null; count: number }>;
}

const hex = (n: number, width: number) => n.toString(16).toUpperCase().padStart(width, "0");

export async function buildTextReport(
  catalogDir: string,
  options: { expectedBanks: number; expectedTexts: number; references: readonly NameRef[] },
): Promise<TextReportResult> {
  const lines: string[] = ["Textos"];
  const alerts: string[] = [];
  let ok = true;

  let report: ReportShape;
  let index: IndexShape;
  try {
    report = JSON.parse(await readFile(join(catalogDir, "report.json"), "utf8")) as ReportShape;
    index = JSON.parse(await readFile(join(catalogDir, "index.json"), "utf8")) as IndexShape;
  } catch {
    // The text stage never ran: nothing to check, so the report does not fail (feature 004 reports
    // still work on a data-only extraction). A stage that ran and left a broken catalog fails.
    const ran = await stat(catalogDir).then(() => true, () => false);
    if (!ran) return { ok: true, lines: [...lines, "  não extraído (etapa text-catalog não rodou)"], alerts };
    lines.push("  FALHA    catálogo de textos ausente ou inválido (rode a extração de novo)");
    return { ok: false, lines: [...lines], alerts };
  }

  const row = (label: string, actual: number, expected: number) => {
    const pass = actual === expected;
    lines.push(`  ${pass ? "ok      " : "FALHA   "} ${label.padEnd(22)}${actual} / ${expected}`);
    if (!pass) ok = false;
  };
  row("bancos", report.banks, options.expectedBanks);
  row("textos", report.texts, options.expectedTexts);
  row("ida e volta", report.roundTrip.identical, report.roundTrip.banks);

  const countsByBank = new Map(index.records.map((r) => [r.id, r.count]));
  let refsOk = 0;
  for (const ref of options.references) {
    const bank = TEXT_REF_BANKS[ref.catalog];
    const count = countsByBank.get(bank);
    if (count !== undefined && ref.index < count) {
      refsOk += 1;
    } else {
      lines.push(`  FALHA    referência ${ref.catalog}:${ref.index} sem texto no catálogo`);
      ok = false;
    }
  }
  row("referências de nome", refsOk, options.references.length);

  const topCharacters = [...report.unknownCharacters].sort((a, b) => b.count - a.count).slice(0, 10);
  for (const c of topCharacters) alerts.push(`caractere 0x${hex(c.code, 4)}  x${c.count}  bancos ${c.banks.map((b) => String(b).padStart(4, "0")).join(", ")}`);
  const topCommands = [...report.unknownCommands].sort((a, b) => b.count - a.count).slice(0, 10);
  for (const c of topCommands) alerts.push(`comando  0x${hex(c.command, 4)}  x${c.count}  parâmetros ${c.params}`);
  lines.push(`  Alertas de texto (${alerts.length})`);
  for (const a of alerts) lines.push(`    ${a}`);

  return { ok, lines, alerts };
}
