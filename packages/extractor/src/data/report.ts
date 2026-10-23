import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  GAME_DATA_FILES,
  type GameDataFileOf,
  type GameDataKind,
  parseGameDataJson,
  STAT_KEYS,
} from "@soulsilver/shared/game-data";
import { type DataLayout, SOULSILVER_US_LAYOUT } from "./layout.ts";

// Sanity report; see specs/004-game-data-extraction/research.md R15 and contracts/cli-report.md.
// It reads the files already extracted, so it needs no ROM and never runs in CI.

export interface ExpectedCounts {
  species: number;
  forms: number;
  moves: number;
  abilities: number;
  items: number;
  tms: number;
  hms: number;
  tutors: number;
  natures: number;
  types: number;
  growthRates: number;
  learnsets: number;
}

/** Counts for Pokémon SoulSilver (USA): 493 species and 467 moves, and the public totals for the rest. */
export const EXPECTED_COUNTS: ExpectedCounts = {
  species: 493,
  forms: 12,
  moves: 467,
  abilities: 123,
  items: 513,
  tms: 92,
  hms: 8,
  tutors: 52,
  natures: 25,
  types: 18,
  growthRates: 6,
  learnsets: 505,
};

const COUNT_LABELS: Record<keyof ExpectedCounts, string> = {
  species: "espécies",
  forms: "formas alternativas",
  moves: "golpes",
  abilities: "habilidades",
  items: "itens",
  tms: "TMs",
  hms: "HMs",
  tutors: "tutores",
  natures: "naturezas",
  types: "tipos",
  growthRates: "curvas de experiência",
  learnsets: "learnsets",
};

export interface SanityReport {
  /** False when a file is missing or invalid, or a count differs. Warnings never fail the report. */
  ok: boolean;
  files: Array<{
    kind: GameDataKind;
    file: string;
    status: "ok" | "missing" | "invalid";
    error?: { path: string; problem: string };
  }>;
  counts: Array<{ name: string; expected: number; actual: number; ok: boolean }>;
  warnings: Array<{ kind: GameDataKind; recordId: number; field: string; value: string; expected: string }>;
  ignored: Array<{ kind: GameDataKind; detail: string }>;
}

type Loaded = { [K in GameDataKind]?: GameDataFileOf<K>["records"] };

const GENDER_RAWS = new Set([0, 31, 63, 127, 191, 254, 255]);
const TYPE_RANGE = "tipo de 0 a 17";

async function load(workspaceDir: string): Promise<{ files: SanityReport["files"]; data: Loaded }> {
  const files: SanityReport["files"] = [];
  const data: Record<string, unknown> = {};
  for (const kind of Object.keys(GAME_DATA_FILES) as GameDataKind[]) {
    const { stage, file } = GAME_DATA_FILES[kind];
    let text: string;
    try {
      text = await readFile(join(workspaceDir, "stages", stage, "json", file), "utf8");
    } catch {
      files.push({ kind, file, status: "missing" });
      continue;
    }
    const result = parseGameDataJson(kind, text, file);
    if (!result.ok) {
      files.push({ kind, file, status: "invalid", error: { path: result.error.path, problem: result.error.problem } });
      continue;
    }
    files.push({ kind, file, status: "ok" });
    data[kind] = (result.data as { records: unknown }).records;
  }
  return { files, data };
}

function checkWarnings(data: Loaded): SanityReport["warnings"] {
  const warnings: SanityReport["warnings"] = [];
  const warn = (kind: GameDataKind, recordId: number, field: string, value: unknown, expected: string) => {
    warnings.push({ kind, recordId, field, value: String(value), expected });
  };

  const ids = (records: ReadonlyArray<{ id: number }> | undefined) => (records ? new Set(records.map((r) => r.id)) : undefined);
  const moveIds = ids(data.moves);
  const itemIds = ids(data.items);
  const abilityIds = ids(data.abilities);
  const machineIds = ids(data.machines);
  const tutorIds = ids(data.tutors);
  const speciesNumbers = data.species ? new Set(data.species.map((r) => r.species)) : undefined;
  const maxAbility = data.abilities ? Math.max(0, ...data.abilities.map((a) => a.id)) : 0;

  for (const r of data.species ?? []) {
    for (const key of STAT_KEYS) {
      const value = r.baseStats[key];
      if (value < 1 || value > 255) warn("species", r.id, `baseStats.${key}`, value, "1–255");
    }
    const evTotal = STAT_KEYS.reduce((sum, key) => sum + r.evYield[key], 0);
    if (evTotal > 3) warn("species", r.id, "evYield", evTotal, "soma de 0 a 3");
    if (r.catchRate < 1) warn("species", r.id, "catchRate", r.catchRate, "1–255");
    if (!GENDER_RAWS.has(r.gender.raw)) warn("species", r.id, "gender.raw", r.gender.raw, "0, 31, 63, 127, 191, 254 ou 255");
    r.types.forEach((type, i) => {
      if (type > 17) warn("species", r.id, `types.${i}`, type, TYPE_RANGE);
    });
    r.abilities.forEach((ability, i) => {
      if (abilityIds && !abilityIds.has(ability)) warn("species", r.id, `abilities.${i}`, ability, `habilidade de 1 a ${maxAbility}`);
    });
    for (const slot of ["common", "rare"] as const) {
      const item = r.heldItems[slot];
      if (item !== null && itemIds && !itemIds.has(item)) warn("species", r.id, `heldItems.${slot}`, item, "item existente em items.json");
    }
  }

  for (const r of data.moves ?? []) {
    if (r.accuracy !== null && (r.accuracy < 1 || r.accuracy > 100)) warn("moves", r.id, "accuracy", r.accuracy, "1–100 ou null");
    if (r.pp < 1 || r.pp > 40) warn("moves", r.id, "pp", r.pp, "1–40");
    if (r.priority < -7 || r.priority > 5) warn("moves", r.id, "priority", r.priority, "-7 a 5");
    if (r.effect.chance > 100) warn("moves", r.id, "effect.chance", r.effect.chance, "0–100");
    if (r.type > 17) warn("moves", r.id, "type", r.type, TYPE_RANGE);
  }

  for (const r of data.learnsets ?? []) {
    r.levelUp.forEach((entry, i) => {
      if (entry.level < 1 || entry.level > 100) warn("learnsets", r.id, `levelUp.${i}.level`, entry.level, "1–100");
      if (moveIds && !moveIds.has(entry.move)) warn("learnsets", r.id, `levelUp.${i}.move`, entry.move, "golpe existente em moves.json");
    });
    r.machines.forEach((machine, i) => {
      if (machineIds && !machineIds.has(machine)) warn("learnsets", r.id, `machines.${i}`, machine, "máquina existente em machines.json");
    });
    r.egg.forEach((move, i) => {
      if (moveIds && !moveIds.has(move)) warn("learnsets", r.id, `egg.${i}`, move, "golpe existente em moves.json");
    });
    r.tutors.forEach((tutor, i) => {
      if (tutorIds && !tutorIds.has(tutor)) warn("learnsets", r.id, `tutors.${i}`, tutor, "tutor existente em tutors.json");
    });
  }

  for (const r of data.machines ?? []) {
    if (moveIds && !moveIds.has(r.move)) warn("machines", r.id, "move", r.move, "golpe existente em moves.json");
  }
  for (const r of data.tutors ?? []) {
    if (moveIds && !moveIds.has(r.move)) warn("tutors", r.id, "move", r.move, "golpe existente em moves.json");
  }

  for (const r of data.evolutions ?? []) {
    r.evolutions.forEach((evolution, i) => {
      const at = `evolutions.${i}`;
      if (evolution.method === "unknown") warn("evolutions", r.id, `${at}.method`, "unknown", "método conhecido (1–26)");
      if (speciesNumbers && !speciesNumbers.has(evolution.into)) warn("evolutions", r.id, `${at}.into`, evolution.into, "espécie existente em species.json");
      const { condition } = evolution;
      if (condition.kind === "item" && itemIds && !itemIds.has(condition.item)) warn("evolutions", r.id, `${at}.condition.item`, condition.item, "item existente em items.json");
      if (condition.kind === "move" && moveIds && !moveIds.has(condition.move)) warn("evolutions", r.id, `${at}.condition.move`, condition.move, "golpe existente em moves.json");
      if (condition.kind === "species" && speciesNumbers && !speciesNumbers.has(condition.species)) warn("evolutions", r.id, `${at}.condition.species`, condition.species, "espécie existente em species.json");
    });
  }

  for (const r of data.items ?? []) {
    const { type } = r.naturalGift;
    if (type > 17 && type !== 31) warn("items", r.id, "naturalGift.type", type, "tipo de 0 a 17 ou 31 (nenhum)");
  }

  for (const r of data["growth-rates"] ?? []) {
    for (let level = 1; level < r.experience.length; level++) {
      const previous = r.experience[level - 1]!;
      if (r.experience[level]! < previous) warn("growth-rates", r.id, `experience.${level}`, r.experience[level]!, `não menor que ${previous}`);
    }
  }

  return warnings;
}

function countAll(data: Loaded): Record<keyof ExpectedCounts, number> {
  return {
    species: data.species?.filter((r) => r.form === 0).length ?? 0,
    forms: data.species?.filter((r) => r.form > 0).length ?? 0,
    moves: data.moves?.length ?? 0,
    abilities: data.abilities?.length ?? 0,
    items: data.items?.length ?? 0,
    tms: data.machines?.filter((r) => r.kind === "tm").length ?? 0,
    hms: data.machines?.filter((r) => r.kind === "hm").length ?? 0,
    tutors: data.tutors?.length ?? 0,
    natures: data.natures?.length ?? 0,
    types: data.types?.length ?? 0,
    growthRates: data["growth-rates"]?.length ?? 0,
    learnsets: data.learnsets?.length ?? 0,
  };
}

function listIgnored(data: Loaded, layout: DataLayout): SanityReport["ignored"] {
  const ignored: SanityReport["ignored"] = [
    { kind: "species", detail: `registros do NARC depois do ${layout.counts.species} (Ovo e Ovo ruim) não são espécies` },
    { kind: "moves", detail: `membros do NARC depois do golpe ${layout.counts.moves} não são usados (sem nome no jogo)` },
    { kind: "growth-rates", detail: `membros ${layout.counts.growthRates}–${layout.counts.growthRates + 1} (cópias do grupo 0)` },
  ];
  if (data.items) ignored.push({ kind: "items", detail: `${layout.counts.items - data.items.length} ids sem dados (apontam para o dado 0)` });
  return ignored;
}

export async function buildSanityReport(
  workspaceDir: string,
  options: { expected?: ExpectedCounts; layout?: DataLayout } = {},
): Promise<SanityReport> {
  const expected = options.expected ?? EXPECTED_COUNTS;
  const { files, data } = await load(workspaceDir);
  const actual = countAll(data);
  const counts = (Object.keys(COUNT_LABELS) as Array<keyof ExpectedCounts>).map((key) => ({
    name: COUNT_LABELS[key],
    expected: expected[key],
    actual: actual[key],
    ok: expected[key] === actual[key],
  }));
  return {
    ok: files.every((f) => f.status === "ok") && counts.every((c) => c.ok),
    files,
    counts,
    warnings: checkWarnings(data),
    ignored: listIgnored(data, options.layout ?? SOULSILVER_US_LAYOUT),
  };
}

const STATUS_LABEL = { ok: "ok", missing: "ausente", invalid: "inválido" } as const;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Text for the terminal; layout in contracts/cli-report.md. */
export function formatSanityReport(report: SanityReport, workspaceDir: string): string {
  const lines: string[] = [`Relatório de sanidade — ${workspaceDir}`, "", "Arquivos"];
  for (const f of report.files) {
    const detail = f.error ? `  ${f.error.path}: ${f.error.problem}` : "";
    lines.push(`  ${STATUS_LABEL[f.status].padEnd(9)}${f.file}${detail}`);
  }

  lines.push("Contagens");
  for (const c of report.counts) lines.push(`  ${(c.ok ? "ok" : "FALHA").padEnd(9)}${c.name.padEnd(24)}${c.actual} / ${c.expected}`);

  lines.push(`Alertas (${report.warnings.length})`);
  for (const w of report.warnings) {
    lines.push(`  ${`${w.kind} #${w.recordId}`.padEnd(18)}${w.field.padEnd(18)}${w.value.padEnd(10)}esperado ${w.expected}`);
  }

  lines.push("Ignorados");
  for (const i of report.ignored) lines.push(`  ${i.kind.padEnd(14)}${i.detail}`);

  const badFiles = report.files.filter((f) => f.status !== "ok").length;
  const badCounts = report.counts.filter((c) => !c.ok).length;
  lines.push("");
  if (report.ok) {
    const alerts = report.warnings.length;
    lines.push(alerts > 0 ? `Resultado: OK (${plural(alerts, "alerta", "alertas")})` : "Resultado: OK");
  } else {
    const parts = [
      ...(badFiles > 0 ? [plural(badFiles, "arquivo", "arquivos")] : []),
      ...(badCounts > 0 ? [plural(badCounts, "contagem", "contagens")] : []),
    ];
    lines.push(`Resultado: FALHA (${parts.join(", ")})`);
  }
  return `${lines.join("\n")}\n`;
}
