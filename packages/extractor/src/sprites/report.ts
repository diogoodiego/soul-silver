// The sprite report (research.md R5) and its section of --report.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseSpriteJson, SPRITE_FORMAT_VERSION, type SpriteCategory, type SpriteReportFile, type SpriteSetFile } from "@soulsilver/shared/sprites";

/** Largest share of sprites that may fail in a category other than the 493 Pokémon (R5). */
export const MAX_LOSS_SHARE = 0.02;

export interface CategoryResult {
  set: SpriteSetFile;
  missing: { sprite: string; frame?: string; reason: string }[];
  failed: { sprite: string; reason: string }[];
  /** Species that must not lose any sprite: any failure in this category fails the stage. */
  strict: boolean;
  fallbacks?: { species: number; form: number; usedForm: number }[];
}

export function buildReportFile(results: Partial<Record<SpriteCategory, CategoryResult>>): SpriteReportFile {
  const categories: SpriteReportFile["categories"] = {};
  const missing: SpriteReportFile["missing"] = [];
  const failed: SpriteReportFile["failed"] = [];
  const fallbacks: SpriteReportFile["fallbacks"] = [];
  let ok = true;
  for (const [name, result] of Object.entries(results) as [SpriteCategory, CategoryResult][]) {
    categories[name] = {
      sprites: result.set.sprites.length,
      frames: result.set.frames.length,
      animations: result.set.sprites.reduce((n, s) => n + s.animations.length, 0),
      pages: result.set.pages.length,
    };
    missing.push(...result.missing.map((m) => ({ category: name, ...m })));
    failed.push(...result.failed.map((f) => ({ category: name, ...f })));
    fallbacks.push(...(result.fallbacks ?? []));
    const total = result.set.sprites.length + result.failed.length;
    const loss = total === 0 ? 0 : result.failed.length / total;
    if (result.strict ? result.failed.length > 0 : loss > MAX_LOSS_SHARE) ok = false;
  }
  return { kind: "sprite-report", formatVersion: SPRITE_FORMAT_VERSION, ok, categories, missing, fallbacks, failed };
}

export interface SpriteReportResult {
  ok: boolean;
  lines: string[];
}

export async function buildSpriteReport(spritesDir: string): Promise<SpriteReportResult> {
  const lines = ["Sprites"];
  let text: string;
  try {
    text = await readFile(join(spritesDir, "report.json"), "utf8");
  } catch {
    return { ok: true, lines: [...lines, "  não extraído (etapa sprites não rodou)"] };
  }
  const parsed = parseSpriteJson("sprite-report", text, "report.json");
  if (!parsed.ok) return { ok: false, lines: [...lines, `  FALHA    relatório de sprites inválido em ${parsed.error.path}: ${parsed.error.problem}`] };
  const { categories, missing, failed, fallbacks, ok } = parsed.data;
  for (const [name, c] of Object.entries(categories)) {
    lines.push(`  ${name.padEnd(18)}${c.sprites} sprites, ${c.frames} quadros, ${c.animations} animações, ${c.pages} páginas`);
  }
  lines.push(`  ${ok ? "ok      " : "FALHA   "} faltando ${missing.length}, com falha ${failed.length}, usando a forma base ${fallbacks.length}`);
  for (const m of missing) lines.push(`    faltando  ${m.category} ${m.sprite}${m.frame ? ` ${m.frame}` : ""}: ${m.reason}`);
  for (const f of failed) lines.push(`    falha     ${f.category} ${f.sprite}: ${f.reason}`);
  return { ok, lines };
}
