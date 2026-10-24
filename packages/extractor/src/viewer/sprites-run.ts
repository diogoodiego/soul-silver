// `npm run sprites:view -- [sprite-name] [--out <pasta>]`: serves the sprites stage output and
// opens the preview page in the browser. Read-only; development only (research.md R6).
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { startViewer } from "./serve.ts";

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { out: { type: "string", default: "assets" } },
  });
  const viewer = await startViewer({
    mapsDir: join(resolve(values.out), "stages", "sprites", "sprites"),
    port: 0,
    html: await readFile(new URL("./sprites.html", import.meta.url), "utf8"),
  }).catch((error: Error) => {
    console.error(`Não foi possível iniciar a pré-visualização: ${error.message}`);
    return undefined;
  });
  if (!viewer) return 1;

  const target = positionals[0] ? `${viewer.url}#${encodeURIComponent(positionals[0])}` : viewer.url;
  console.log(`Pré-visualização em ${target} (Ctrl+C para encerrar)`);
  const opener = process.platform === "win32" ? ["cmd", ["/c", "start", "", target]] : ["xdg-open", [target]];
  spawn(opener[0] as string, opener[1] as string[], { detached: true, stdio: "ignore" }).unref();

  await new Promise<void>((done) => process.once("SIGINT", () => done()));
  await viewer.close();
  return 0;
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
