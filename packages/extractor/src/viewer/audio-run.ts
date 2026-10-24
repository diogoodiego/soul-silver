// `npm run audio:view -- [id] [--out <pasta>]`: serves the audio stage output and
// opens the dev player in the browser. Read-only; development only (research.md R8).
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
    mapsDir: join(resolve(values.out), "stages", "audio", "audio"),
    port: 0,
    html: await readFile(new URL("./audio.html", import.meta.url), "utf8"),
  }).catch((error: Error) => {
    console.error(`Não foi possível iniciar o reprodutor: ${error.message}`);
    return undefined;
  });
  if (!viewer) return 1;

  const target = positionals[0] ? `${viewer.url}#${encodeURIComponent(positionals[0])}` : viewer.url;
  console.log(`Reprodutor em ${target} (Ctrl+C para encerrar)`);
  const opener = process.platform === "win32" ? ["cmd", ["/c", "start", "", target]] : ["xdg-open", [target]];
  spawn(opener[0] as string, opener[1] as string[], { detached: true, stdio: "ignore" }).unref();

  await new Promise<void>((done) => process.once("SIGINT", () => done()));
  await viewer.close();
  return 0;
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
