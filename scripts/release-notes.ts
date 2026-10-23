// Release notes from commit subjects since the previous tag.
// Usage: node scripts/release-notes.ts <tag> <out.md>
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const SECTIONS = [
  { title: "Novidades", types: ["feat"] },
  { title: "Correções", types: ["fix"] },
] as const;
const OTHER_TITLE = "Outras mudanças";

const CONVENTIONAL = /^(\w+)(\([^)]*\))?(!)?: (.+)$/;

export function buildReleaseNotes(subjects: readonly string[]): string {
  const groups = new Map<string, string[]>();
  for (const subject of subjects) {
    const match = CONVENTIONAL.exec(subject);
    const type = match?.[1] ?? "";
    const text = match ? `${match[3] ? "**(incompatível)** " : ""}${match[4]}` : subject;
    const title = SECTIONS.find((s) => (s.types as readonly string[]).includes(type))?.title ?? OTHER_TITLE;
    groups.set(title, [...(groups.get(title) ?? []), text]);
  }
  const order = [...SECTIONS.map((s) => s.title), OTHER_TITLE];
  const sections = order
    .filter((title) => groups.has(title))
    .map((title) => [`## ${title}`, "", ...groups.get(title)!.map((t) => `- ${t}`), ""].join("\n"));
  return sections.length > 0 ? sections.join("\n") : "Sem mudanças registradas.\n";
}

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

if (import.meta.main) {
  const [tag, out] = process.argv.slice(2);
  if (!tag || !out) {
    console.error("Uso: node scripts/release-notes.ts <tag> <saida.md>");
    process.exit(2);
  }
  try {
    let range = tag;
    try {
      range = `${git(["describe", "--tags", "--abbrev=0", `${tag}^`])}..${tag}`;
    } catch {
      // No previous tag: use the whole history.
    }
    const log = git(["log", range, "--no-merges", "--reverse", "--format=%s"]);
    writeFileSync(out, buildReleaseNotes(log ? log.split("\n") : []));
  } catch (error) {
    console.error(`Falha ao gerar as notas: ${(error as Error).message}`);
    process.exit(2);
  }
}
