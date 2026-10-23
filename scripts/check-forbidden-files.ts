// Usage: node scripts/check-forbidden-files.ts --staged | --all
// Exit codes: 0 clean, 1 forbidden files found, 2 usage or git error.
import { execFileSync } from "node:child_process";
import { findForbiddenFiles } from "./forbidden-files.ts";

const GIT_ARGS: Record<string, string[]> = {
  "--staged": ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
  "--all": ["ls-files", "-z"],
};

const mode = process.argv[2] ?? "";
const gitArgs = GIT_ARGS[mode];
if (!gitArgs) {
  console.error("Uso: node scripts/check-forbidden-files.ts --staged | --all");
  process.exit(2);
}

let paths: string[];
try {
  paths = execFileSync("git", gitArgs, { encoding: "utf8" }).split("\0").filter(Boolean);
} catch (error) {
  console.error(`Falha ao consultar o git: ${(error as Error).message}`);
  process.exit(2);
}

const violations = findForbiddenFiles(paths);
if (violations.length === 0) process.exit(0);

const width = Math.max(...violations.map((v) => v.path.length));
const lines = [
  "✖ Commit bloqueado: arquivos proibidos pelo princípio II da constituição.",
  "  ROMs, assets e dados derivados da ROM nunca podem ser versionados.",
  "",
  ...violations.map((v) => `  ${v.path.padEnd(width)}  ${v.reason}`),
  "",
  "Remova esses arquivos do commit (git restore --staged <arquivo>).",
  "Arte original do projeto deve ficar em art/.",
];
console.error(lines.join("\n"));
process.exit(1);
