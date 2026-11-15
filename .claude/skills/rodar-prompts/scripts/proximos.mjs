#!/usr/bin/env node
// Prints the next N roadmap item prompts, starting at "Próximo item" in docs/STATUS.md.
// Usage: node .claude/skills/rodar-prompts/scripts/proximos.mjs [N]
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const n = Math.max(1, Number.parseInt(process.argv[2] ?? "1", 10) || 1);

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const status = read(join(root, "docs/STATUS.md"));
const m = status.match(/Próximo item:\s*([A-Z0-9.]+)/u);
if (!m) {
  console.error("docs/STATUS.md não tem a linha 'Próximo item: <ID>'.");
  process.exit(1);
}
const start = m[1];

const dir = join(root, "docs/roadmap");
const files = readdirSync(dir).filter((f) => /^marco-\d+\.md$/u.test(f))
  .sort((a, b) => Number(a.match(/\d+/u)[0]) - Number(b.match(/\d+/u)[0]));

const items = [];
for (const f of files) {
  const text = read(join(dir, f));
  const re = /^### (\S+) (.+)\n([\s\S]*?)(?=^### |^## |(?![\s\S]))/gmu;
  for (const it of text.matchAll(re)) {
    items.push({ id: it[1], title: it[2].trim(), file: f, prompt: it[3].trim() });
  }
}

const i = items.findIndex((it) => it.id === start);
if (i < 0) {
  console.error(`Item ${start} não encontrado em docs/roadmap/. Itens disponíveis: ${items.map((x) => x.id).join(", ")}`);
  process.exit(1);
}
const picked = items.slice(i, i + n);
for (const it of picked) {
  console.log(`=== ${it.id} · ${it.title} (${it.file})\n${it.prompt}\n`);
}
const after = items[i + picked.length];
console.log(`=== Depois destes: ${after ? `${after.id} · ${after.title}` : "nenhum item restante"}`);
if (picked.length < n) console.log(`(só havia ${picked.length} itens a partir de ${start})`);
