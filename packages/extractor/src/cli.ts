// Developer CLI over the same library the app uses; see
// specs/003-rom-extraction-pipeline/contracts/cli.md. Run with `npm run extract -- [options]`.
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { romRejectionMessage } from "@soulsilver/shared/rom-validation";
import { createConsoleLogger, createFileLogger, type Logger } from "./log.ts";
import { verifyOutputs } from "./pipeline/check.ts";
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
