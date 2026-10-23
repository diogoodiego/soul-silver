// Runs on `npm install` (prepare): points git at the versioned hooks in .githooks/.
import { execFileSync } from "node:child_process";

try {
  execFileSync("git", ["rev-parse", "--git-dir"], { stdio: "ignore" });
} catch {
  console.log("Repositório git não encontrado; hook de pre-commit não instalado.");
  process.exit(0);
}

execFileSync("git", ["config", "core.hooksPath", ".githooks"]);
