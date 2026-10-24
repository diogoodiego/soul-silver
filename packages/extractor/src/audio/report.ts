// The audio report (research.md R10) and its section of --report.
import { AUDIO_FORMAT_VERSION, parseAudioJson, type AudioIndexFile, type AudioReportFile } from "@soulsilver/shared/audio";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Largest share of tracks other than cries that may be lost before the stage fails (R10). */
export const MAX_LOSS_SHARE = 0.02;

export interface ReportInput {
  index: AudioIndexFile;
  unconverted: AudioReportFile["unconverted"];
  missingCries: AudioReportFile["missingCries"];
  /** Forms the game tells apart elsewhere (feature 004) whose cry is their base form's. */
  fallbackCries: AudioReportFile["fallbackCries"];
  /** Track ids the map headers ask for. */
  mapMusic: { map: number; field: "musicDay" | "musicNight"; id: number }[];
  /** Track ids and species the scripts ask for. */
  scriptSounds: { file: number; command: string; id: number }[];
}

export function buildAudioReportFile(input: ReportInput): AudioReportFile {
  const { index } = input;
  const counts = { music: 0, jingle: 0, effect: 0, cry: index.cries.length };
  const bytes = { total: 0, music: 0, jingle: 0, effect: 0, cry: 0 };
  for (const t of index.tracks) {
    counts[t.kind]++;
    bytes[t.kind] += t.bytes;
  }
  for (const c of index.cries) bytes.cry += c.bytes;
  bytes.total = bytes.music + bytes.jingle + bytes.effect + bytes.cry;

  const ids = new Set(index.tracks.map((t) => t.id));
  const species = new Set(index.cries.map((c) => c.species));
  const tracks = index.tracks.length + input.unconverted.length;
  return {
    kind: "audio-report",
    formatVersion: AUDIO_FORMAT_VERSION,
    ok: input.missingCries.length === 0 && (tracks === 0 || input.unconverted.length / tracks <= MAX_LOSS_SHARE),
    counts,
    bytes,
    unconverted: input.unconverted,
    missingCries: input.missingCries,
    fallbackCries: input.fallbackCries,
    missingForMaps: input.mapMusic.filter((m) => !ids.has(m.id)),
    missingForScripts: input.scriptSounds.filter((s) => (s.command === "PlayCry" ? !species.has(s.id) : !ids.has(s.id))),
    loopless: index.tracks.filter((t) => t.kind === "music" && t.loop === null).map((t) => t.id),
  };
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

export function reportLines(report: AudioReportFile): string[] {
  const c = report.counts;
  const b = report.bytes;
  const lines = [
    "Áudio",
    `  ${c.music} músicas, ${c.jingle} jingles, ${c.effect} efeitos, ${c.cry} cries`,
    `  ${mb(b.total)} no total (músicas ${mb(b.music)}, jingles ${mb(b.jingle)}, efeitos ${mb(b.effect)}, cries ${mb(b.cry)})`,
  ];
  if (report.loopless.length > 0) lines.push(`  músicas sem loop: ${report.loopless.join(", ")}`);
  for (const u of report.unconverted) lines.push(`  não convertida: ${u.kind} ${u.id} (${u.name}): ${u.reason}`);
  for (const m of report.missingCries) lines.push(`  cry faltando: espécie ${m.species}: ${m.reason}`);
  for (const m of report.missingForMaps) lines.push(`  mapa ${m.map} pede a faixa ${m.id} (${m.field}), que não existe`);
  for (const s of report.missingForScripts) lines.push(`  script ${s.file} pede ${s.command} ${s.id}, que não existe`);
  if (report.fallbackCries.length > 0) lines.push(`  ${report.fallbackCries.length} formas usam o cry da forma base`);
  lines.push(`  ${report.ok ? "ok      " : "FALHA   "} ${report.unconverted.length} faixas e ${report.missingCries.length} cries perdidos`);
  return lines;
}

export async function buildAudioReport(audioDir: string): Promise<{ ok: boolean; lines: string[] }> {
  let text: string;
  try {
    text = await readFile(join(audioDir, "report.json"), "utf8");
  } catch {
    return { ok: true, lines: ["Áudio", "  não extraído (etapa audio não rodou)"] };
  }
  const parsed = parseAudioJson("audio-report", text, "report.json");
  if (!parsed.ok) return { ok: false, lines: ["Áudio", `  FALHA    relatório de áudio inválido em ${parsed.error.path}: ${parsed.error.problem}`] };
  return { ok: parsed.data.ok, lines: reportLines(parsed.data) };
}

