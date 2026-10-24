// Developer CLI over the same library the app uses; see
// specs/003-rom-extraction-pipeline/contracts/cli.md. Run with `npm run extract -- [options]`.
import { join, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { romRejectionMessage } from "@soulsilver/shared/rom-validation";
import { createConsoleLogger, createFileLogger, type Logger } from "./log.ts";
import { buildSanityReport, type ExpectedCounts, formatSanityReport } from "./data/report.ts";
import { buildMapReport } from "./maps/report.ts";
import { buildSpriteReport } from "./sprites/report.ts";
import { verifyOutputs } from "./pipeline/check.ts";
import { loadTextCatalog, loadTranslatedCatalog } from "./text/catalog-files.ts";
import { findTexts } from "./text/find.ts";
import { buildTextReport, EXPECTED_TEXT_COUNTS, type NameRef } from "./text/report.ts";
import { readdir } from "node:fs/promises";
import { TEXT_REF_BANKS } from "@soulsilver/shared/text";

/** Every { catalog, index } name reference in the feature 004 data files that were extracted. */
async function collectNameRefs(workspaceDir: string): Promise<NameRef[]> {
  const refs: NameRef[] = [];
  const stages = join(workspaceDir, "stages");
  let names: string[];
  try {
    names = await readdir(stages);
  } catch {
    return refs;
  }
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (value === null || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    if (typeof node["catalog"] === "string" && typeof node["index"] === "number" && node["catalog"] in TEXT_REF_BANKS) {
      refs.push({ catalog: node["catalog"] as NameRef["catalog"], index: node["index"] });
      return;
    }
    Object.values(node).forEach(visit);
  };
  for (const stage of names.filter((n) => n.startsWith("data-"))) {
    const dir = join(stages, stage, "json");
    for (const file of await readdir(dir).catch(() => [] as string[])) {
      if (!file.endsWith(".json")) continue;
      visit(JSON.parse(await readFile(join(dir, file), "utf8")));
    }
  }
  return refs;
}
import { createRegistry, type Registry } from "./pipeline/registry.ts";
import { runPipeline } from "./pipeline/run.ts";
import { validateRom } from "./rom/validate.ts";
import { defaultStages } from "./stages/index.ts";

export interface CliIo {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  isTTY: boolean;
  /** Overrides REFERENCE_ROM_SHA1 (tests). */
  references?: readonly string[];
  /** Overrides the expected counts of --report (tests). */
  expected?: ExpectedCounts;
  registry?: Registry;
  signal?: AbortSignal;
}

const EXIT = { ok: 0, failed: 1, usage: 2, rejected: 3, busy: 4, interrupted: 130 } as const;

const USAGE = `Uso: npm run extract -- --rom <arquivo> [opções]

  --rom <arquivo>     ROM a validar e extrair (obrigatória, exceto com --list)
  --out <pasta>       raiz da área de trabalho (padrão: assets)
  --stages <id,id>    roda só essas etapas e as dependências necessárias
  --force <id,id>     roda essas etapas mesmo que estejam em dia
  --list              lista as etapas registradas
  --verify            confere os digests das saídas com o manifesto, sem extrair
  --report            relatório de sanidade dos dados do jogo já extraídos (não exige --rom)
  --log <arquivo>     também grava o log nesse arquivo
  --help              mostra esta ajuda`;

function list(value: string | undefined): string[] | undefined {
  return value?.split(",").map((id) => id.trim()).filter((id) => id.length > 0);
}

function tee(...loggers: Logger[]): Logger {
  return {
    info: (message, stageId) => loggers.forEach((l) => l.info(message, stageId)),
    warn: (message, stageId) => loggers.forEach((l) => l.warn(message, stageId)),
    error: (message, error, stageId) => loggers.forEach((l) => l.error(message, error, stageId)),
  };
}

/** --find: searches the English catalog, or a language with English as fallback (contracts/stage-and-cli.md). */
async function runFind(values: { find?: string; out: string; lang: string; limit: string; rom?: string; stages?: string; force?: string; verify: boolean; report: boolean }, io: CliIo): Promise<number> {
  if (values.rom !== undefined || values.stages !== undefined || values.force !== undefined || values.verify || values.report) {
    io.stderr(`--find não combina com --rom, --stages, --force, --verify nem --report.

${USAGE}`);
    return EXIT.usage;
  }
  const limit = Number(values.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    io.stderr("--limit precisa ser um inteiro de 1 a 1000.");
    return EXIT.usage;
  }
  const catalogDir = join(resolve(values.out), "stages", "text-catalog", "catalog");
  const english = await loadTextCatalog(catalogDir, "en");
  if (english.length === 0) {
    io.stderr(`Catálogo de textos não encontrado em ${catalogDir}. Rode a extração primeiro.`);
    return EXIT.failed;
  }

  // A translation is searched first; English fills in the texts it lacks.
  let banks = english;
  if (values.lang !== "en") {
    const translated = await loadTranslatedCatalog(catalogDir, values.lang, english);
    banks = english.map((file) => {
      const own = new Map((translated.find((t) => t.bank === file.bank)?.records ?? []).map((r) => [r.id, r]));
      return { ...file, language: values.lang, records: file.records.map((r) => own.get(r.id) ?? r) };
    });
  }

  const found = findTexts(banks, values.find!, { limit });
  if (found.length === 0) {
    io.stdout(`nenhum texto contém "${values.find}"`);
    return EXIT.ok;
  }
  io.stdout(`${found.length} resultado(s) para "${values.find}"`);
  io.stdout("");
  for (const r of found) {
    const label = r.name === null ? "" : ` (${r.name})`;
    const shown = r.text.length > 160 ? `${r.text.slice(0, 160)}…` : r.text;
    io.stdout(`${r.id}${label}  ${shown}`);
  }
  if (found.length === limit) io.stdout(`
(mostrando ${limit}; use --limit para ver mais)`);
  return EXIT.ok;
}

export async function main(argv: string[], io: CliIo): Promise<number> {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      strict: true,
      options: {
        rom: { type: "string" },
        out: { type: "string", default: "assets" },
        stages: { type: "string" },
        force: { type: "string" },
        list: { type: "boolean", default: false },
        verify: { type: "boolean", default: false },
        log: { type: "string" },
        report: { type: "boolean", default: false },
        find: { type: "string" },
        lang: { type: "string", default: "en" },
        limit: { type: "string", default: "20" },
        help: { type: "boolean", default: false },
      },
    }));
  } catch (error) {
    io.stderr(`${(error as Error).message}\n\n${USAGE}`);
    return EXIT.usage;
  }
  if (values.help) {
    io.stdout(USAGE);
    return EXIT.ok;
  }

  const registry = io.registry ?? createRegistry(defaultStages);
  if (values.list) {
    for (const stage of registry.stages) {
      const inputs = stage.inputs.map((i) => (i.kind === "rom" ? "rom" : `${i.stage}/${i.output}`)).join(", ");
      io.stdout(`${stage.id} v${stage.version}  ${stage.title}`);
      io.stdout(`  entradas: ${inputs || "—"}`);
      io.stdout(`  saídas:   ${stage.outputs.join(", ")}`);
    }
    return EXIT.ok;
  }

  if (values.find !== undefined) return runFind(values, io);

  if (values.report) {
    if (values.verify || values.stages !== undefined || values.force !== undefined) {
      io.stderr(`--report não combina com --verify, --stages nem --force.\n\n${USAGE}`);
      return EXIT.usage;
    }
    const reportDir = resolve(values.out);
    const report = await buildSanityReport(reportDir, io.expected ? { expected: io.expected } : {});
    io.stdout(formatSanityReport(report, reportDir).trimEnd());
    const text = await buildTextReport(join(reportDir, "stages", "text-catalog", "catalog"), {
      expectedBanks: EXPECTED_TEXT_COUNTS.banks,
      expectedTexts: EXPECTED_TEXT_COUNTS.texts,
      references: await collectNameRefs(reportDir),
    });
    io.stdout(text.lines.join("\n"));
    const maps = await buildMapReport(join(reportDir, "stages", "maps", "maps"));
    io.stdout(maps.lines.join("\n"));
    const sprites = await buildSpriteReport(join(reportDir, "stages", "sprites", "sprites"));
    io.stdout(sprites.lines.join("\n"));
    return report.ok && text.ok && maps.ok && sprites.ok ? EXIT.ok : EXIT.failed;
  }

  if (!values.rom) {
    io.stderr(`Faltou --rom.\n\n${USAGE}`);
    return EXIT.usage;
  }
  const only = list(values.stages);
  const force = list(values.force);
  for (const [flag, ids] of [["--stages", only], ["--force", force]] as const) {
    const unknown = ids?.filter((id) => !registry.get(id)) ?? [];
    if (unknown.length > 0) {
      io.stderr(`Etapa desconhecida em ${flag}: ${unknown.join(", ")}. Use --list para ver as etapas.`);
      return EXIT.usage;
    }
  }

  const romPath = resolve(values.rom);
  const workspaceDir = resolve(values.out);
  const references = io.references ? { references: io.references } : {};
  const validation = await validateRom(romPath, references);
  if (!validation.ok) {
    const message = romRejectionMessage(validation.rejection);
    io.stderr(`${message.title}\n${message.detail}`);
    return EXIT.rejected;
  }

  if (values.verify) {
    const report = await verifyOutputs({ workspaceDir, registry });
    for (const m of report.mismatches) io.stdout(`divergente: ${m.stageId}/${m.output}`);
    io.stdout(report.ok ? "Todas as saídas conferem com o manifesto." : `${report.mismatches.length} saída(s) divergente(s).`);
    return report.ok ? EXIT.ok : EXIT.failed;
  }

  const stderrLog = createConsoleLogger(io.stderr);
  const log = values.log ? tee(stderrLog, createFileLogger(resolve(values.log))) : stderrLog;
  let lastDecile = -1;
  const result = await runPipeline({
    workspaceDir,
    romPath,
    registry,
    log,
    ...references,
    ...(only ? { only } : {}),
    ...(force ? { force } : {}),
    ...(io.signal ? { signal: io.signal } : {}),
    onPlan: (plan) => {
      for (const p of plan) io.stdout(`${p.stage.id}: ${p.reason}`);
    },
    onProgress: ({ stageId, stageTitle, percent }) => {
      const line = `[${stageId}] ${stageTitle} ${percent}%`;
      if (io.isTTY) {
        io.stdout(line);
      } else if (Math.floor(percent / 10) > lastDecile) {
        lastDecile = Math.floor(percent / 10);
        io.stdout(line);
      }
    },
  });

  switch (result.status) {
    case "completed":
      for (const id of result.skipped) io.stdout(`${id}: em dia, pulada`);
      io.stdout(`Concluído: ${result.ran.length} etapa(s) executada(s), ${result.skipped.length} pulada(s). Saída em ${workspaceDir}`);
      return EXIT.ok;
    case "cancelled":
      io.stderr("Interrompido.");
      return EXIT.interrupted;
    case "failed": {
      const { error } = result;
      switch (error.code) {
        case "busy":
          io.stderr("Outra extração está usando essa pasta de saída.");
          return EXIT.busy;
        case "rom-mismatch":
          io.stderr("A ROM mudou durante a extração.");
          return EXIT.rejected;
        case "disk-full":
          io.stderr(`Espaço insuficiente: são necessários ${error.requiredBytes} bytes, há ${error.availableBytes}.`);
          return EXIT.failed;
        case "write-permission":
          io.stderr(`Sem permissão para gravar em ${error.path}.`);
          return EXIT.failed;
        case "stage-failed":
          io.stderr(`A etapa ${error.stageId} falhou: ${error.message}`);
          return EXIT.failed;
      }
    }
  }
}

if (import.meta.main) {
  const abort = new AbortController();
  process.once("SIGINT", () => abort.abort());
  process.exitCode = await main(process.argv.slice(2), {
    stdout: (line) => process.stdout.write(`${line}\n`),
    stderr: (line) => process.stderr.write(`${line}\n`),
    isTTY: process.stdout.isTTY,
    signal: abort.signal,
  });
}
