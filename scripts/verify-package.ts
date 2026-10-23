// Checks the unpacked app (and its app.asar) for ROMs and assets before release.
// Usage: node scripts/verify-package.ts <win-unpacked-dir>
// Exit codes: 0 clean, 1 forbidden files found, 2 usage error.
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { listPackage } from "@electron/asar";
import { findForbiddenPackageFiles } from "./forbidden-files.ts";

const dir = process.argv[2];
if (!dir || !statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
  console.error("Uso: node scripts/verify-package.ts <pasta win-unpacked>");
  process.exit(2);
}

const files = readdirSync(dir, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => relative(dir, join(entry.parentPath, entry.name)).replaceAll("\\", "/"));

const paths = [...files];
for (const file of files.filter((f) => f.endsWith(".asar"))) {
  for (const entry of listPackage(join(dir, file), { isPack: false })) {
    paths.push(`${file}/${entry.replaceAll("\\", "/").replace(/^\//, "")}`);
  }
}

const violations = findForbiddenPackageFiles(paths);
if (violations.length === 0) {
  console.log(`Pacote verificado: ${paths.length} entradas, nenhum arquivo proibido.`);
  process.exit(0);
}

const width = Math.max(...violations.map((v) => v.path.length));
console.error(
  [
    "✖ Pacote recusado: arquivos proibidos pelo princípio II da constituição.",
    "  ROMs, assets e dados derivados da ROM nunca podem ser distribuídos.",
    "",
    ...violations.map((v) => `  ${v.path.padEnd(width)}  ${v.reason}`),
  ].join("\n"),
);
process.exit(1);
