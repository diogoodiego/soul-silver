// `npm run maps:view -- [mapa-id] [--out <pasta>]`: serves the maps stage output and opens the
// viewer in the browser. Read-only; see specs/006-map-prerender/contracts/map-api.md.
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { startViewer } from "./serve.ts";

/** Text bank of the map names (feature 005, TEXT_BANK_NAMES "map-names"). */
const MAP_NAMES_BANK = 279;

/** mapsec -> name, read from the English catalog of the text-catalog stage. */
async function loadMapNames(outDir: string): Promise<Record<number, string>> {
  try {
    const bank = JSON.parse(await readFile(join(outDir, "stages", "text-catalog", "catalog", "en", `${String(MAP_NAMES_BANK).padStart(4, "0")}.json`), "utf8")) as {
      records: { id: number; text: string }[];
    };
    return Object.fromEntries(bank.records.map((r) => [r.id, r.text]));
  } catch {
    return {};
  }
}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { out: { type: "string", default: "assets" } },
  });
  const outDir = resolve(values.out);
  const viewer = await startViewer({
    mapsDir: join(outDir, "stages", "maps", "maps"),
    port: 0,
    names: await loadMapNames(outDir),
  }).catch((error: Error) => {
    console.error(`Não foi possível iniciar o visualizador: ${error.message}`);
    return undefined;
  });
  if (!viewer) return 1;

  const target = positionals[0] ? `${viewer.url}#${positionals[0]}` : viewer.url;
  console.log(`Visualizador em ${target} (Ctrl+C para encerrar)`);
  const opener = process.platform === "win32" ? ["cmd", ["/c", "start", "", target]] : ["xdg-open", [target]];
  spawn(opener[0] as string, opener[1] as string[], { detached: true, stdio: "ignore" }).unref();

  await new Promise<void>((done) => process.once("SIGINT", () => done()));
  await viewer.close();
  return 0;
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
