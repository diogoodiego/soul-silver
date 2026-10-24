// The "Mapas" section of --report: maps without failure (SC-002), each failure with its
// reason, maps with animated textures (FR-009) and behaviors left without a category.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseMapJson } from "@soulsilver/shared/maps";

/** Share of maps that must not fail (SC-002). */
export const MIN_MAPS_WITHOUT_FAILURE = 0.95;

export interface MapReportResult {
  ok: boolean;
  lines: string[];
}

const pad = (id: number) => String(id).padStart(4, "0");

export async function buildMapReport(mapsDir: string): Promise<MapReportResult> {
  const lines = ["Mapas"];
  let text: string;
  try {
    text = await readFile(join(mapsDir, "report.json"), "utf8");
  } catch {
    return { ok: true, lines: [...lines, "  não extraído (etapa maps não rodou)"] };
  }
  const parsed = parseMapJson("map-report", text, "report.json");
  if (!parsed.ok) return { ok: false, lines: [...lines, `  FALHA    relatório de mapas inválido em ${parsed.error.path}: ${parsed.error.problem}`] };

  const { records } = parsed.data;
  const failures = records.filter((r) => r.status === "failure");
  const share = records.length === 0 ? 1 : (records.length - failures.length) / records.length;
  const ok = share >= MIN_MAPS_WITHOUT_FAILURE;
  const counted = `${records.length - failures.length} / ${records.length} (${(share * 100).toFixed(1)}%)`;
  lines.push(`  ${ok ? "ok      " : "FALHA   "} ${"mapas sem falha".padEnd(22)}${counted}`);
  lines.push(`  com avisos ${records.filter((r) => r.status === "successWithWarnings").length}, com falha ${failures.length}`);
  if (failures.length > 0) {
    lines.push(`  Falhas (${failures.length})`);
    for (const f of failures) lines.push(`    ${pad(f.id)}  ${f.reason ?? ""}`);
  }

  const animated = records.filter((r) => r.warnings.some((w) => w.code === "animated-texture")).map((r) => pad(r.id));
  if (animated.length > 0) lines.push(`  Mapas com textura animada (${animated.length}): ${animated.join(", ")}`);

  const behaviors = new Map<string, number>();
  for (const r of records) {
    for (const w of r.warnings) {
      if (w.code !== "unknown-permission") continue;
      for (const value of w.detail.split(", ")) behaviors.set(value, (behaviors.get(value) ?? 0) + 1);
    }
  }
  if (behaviors.size > 0) {
    const listed = [...behaviors]
      .sort((a, b) => parseInt(a[0], 16) - parseInt(b[0], 16))
      .map(([value, n]) => `${value} (${n} ${n === 1 ? "mapa" : "mapas"})`);
    lines.push(`  Comportamentos sem categoria: ${listed.join(", ")}`);
  }
  return { ok, lines };
}
