// The events report (research.md R6): command coverage, scripts the decoder could not finish and
// references it could not resolve, plus its section of --report.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { EVENTS_FORMAT_VERSION, parseEventsJson, type CommandCoverage, type EventsReportFile, type ScriptFile } from "@soulsilver/shared/events";

/** Largest share of script files that may be lost before the stage fails (R6). */
export const MAX_LOSS_SHARE = 0.02;

export interface ScriptFileResult {
  file: number;
  /** Maps whose header uses the file; empty for files shared by script id. */
  maps: number[];
  script?: ScriptFile;
  error?: string;
}

export interface ReportInput {
  counts: Pick<EventsReportFile["counts"], "maps" | "npcs" | "warps" | "triggers" | "signs" | "encounterBanks" | "trainers">;
  files: ScriptFileResult[];
  unresolved: EventsReportFile["unresolved"];
}

const ascending = (values: Iterable<number>) => [...values].sort((a, b) => a - b);

export function buildEventsReportFile({ counts, files, unresolved }: ReportInput): EventsReportFile {
  const coverage = new Map<string, { count: number; maps: Set<number>; globalFiles: Set<number> }>();
  const undecoded: EventsReportFile["undecodedScripts"] = [];
  let commands = 0;
  let scripts = 0;
  let scriptFiles = 0;
  let unreachableBytes = 0;
  let lost = 0;

  for (const { file, maps, script, error } of files) {
    if (!script) {
      undecoded.push({ file, reason: error ?? "não decodificado" });
      lost++;
      continue;
    }
    scriptFiles++;
    scripts += script.entries.length;
    unreachableBytes += script.unreachableBytes;
    const raws: string[] = [];
    for (const command of script.code) {
      const name = "raw" in command ? `raw:${command.id}` : command.name;
      if ("raw" in command) raws.push(name);
      commands++;
      const entry = coverage.get(name) ?? { count: 0, maps: new Set<number>(), globalFiles: new Set<number>() };
      entry.count++;
      if (maps.length === 0) entry.globalFiles.add(file);
      for (const map of maps) entry.maps.add(map);
      coverage.set(name, entry);
    }
    if (script.partial) {
      undecoded.push({ file, reason: `parou num comando desconhecido (${[...new Set(raws)].join(", ")})` });
      lost++;
    }
  }

  const rows = [...coverage]
    .map(([name, e]): CommandCoverage => ({ name, count: e.count, maps: ascending(e.maps), globalFiles: ascending(e.globalFiles) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const total = files.length;
  return {
    kind: "events-report",
    formatVersion: EVENTS_FORMAT_VERSION,
    ok: total === 0 || lost / total <= MAX_LOSS_SHARE,
    counts: { ...counts, scriptFiles, scripts, commands },
    commands: rows.filter((r) => !r.name.startsWith("raw:")),
    unknownCommands: rows.filter((r) => r.name.startsWith("raw:")),
    undecodedScripts: undecoded.sort((a, b) => a.file - b.file),
    unresolved,
    unreachableBytes,
    decodedPercent: total === 0 ? 100 : Math.round(((total - lost) / total) * 10000) / 100,
  };
}

const TOP_COMMANDS = 10;

export function reportLines(report: EventsReportFile): string[] {
  const c = report.counts;
  const lines = [
    "Eventos, scripts, encontros e treinadores",
    `  ${c.maps} mapas: ${c.npcs} NPCs, ${c.warps} warps, ${c.triggers} gatilhos, ${c.signs} placas`,
    `  ${c.scriptFiles} arquivos de script, ${c.scripts} scripts, ${c.commands} comandos (${report.commands.length} tipos)`,
    `  ${c.encounterBanks} tabelas de encontro, ${c.trainers} treinadores`,
    `  ${report.decodedPercent}% dos arquivos de script decodificados, ${report.unreachableBytes} bytes sem caminho de entrada`,
  ];
  if (report.commands.length > 0) {
    lines.push(`  comandos mais usados: ${report.commands.slice(0, TOP_COMMANDS).map((r) => `${r.name} ${r.count}`).join(", ")}`);
  }
  for (const r of report.unknownCommands) lines.push(`  desconhecido ${r.name}: ${r.count} vezes, mapas ${r.maps.join(",") || "-"}, arquivos compartilhados ${r.globalFiles.join(",") || "-"}`);
  for (const u of report.undecodedScripts) lines.push(`  não decodificado: arquivo ${u.file}: ${u.reason}`);
  for (const u of report.unresolved.slice(0, 10)) lines.push(`  referência sem destino (${u.kind}): ${u.detail}`);
  if (report.unresolved.length > 10) lines.push(`  ... e mais ${report.unresolved.length - 10} referências sem destino`);
  lines.push(`  ${report.ok ? "ok      " : "FALHA   "} ${report.undecodedScripts.length} arquivos de script perdidos`);
  return lines;
}

export interface EventsReportResult {
  ok: boolean;
  lines: string[];
}

export async function buildEventsReport(eventsDir: string): Promise<EventsReportResult> {
  const title = "Eventos, scripts, encontros e treinadores";
  let text: string;
  try {
    text = await readFile(join(eventsDir, "report.json"), "utf8");
  } catch {
    return { ok: true, lines: [title, "  não extraído (etapa events não rodou)"] };
  }
  const parsed = parseEventsJson("events-report", text, "report.json");
  if (!parsed.ok) return { ok: false, lines: [title, `  FALHA    relatório de eventos inválido em ${parsed.error.path}: ${parsed.error.problem}`] };
  return { ok: parsed.data.ok, lines: reportLines(parsed.data) };
}
