// Item coverage report (spec 027, FR-017, research R10): `npm run items:coverage`. Reads the local extraction
// (never in CI, principle II), lists every item with no use or hold effect, and fails when one the player can
// get up to Violet City is among them (packages/app/golden/obtainable.ts says which).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { itemCoverage, parseItemFile } from "../packages/shared/src/items/index.ts";
import { defaultStages, obtainableUntilViolet } from "../packages/app/golden/obtainable.ts";

const stages = defaultStages();
const json = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;
const items = json<{ records: { id: number; pocket: never; partyUse: never; holdEffect: never }[] }>(join(stages, "data-items", "json", "items.json")).records;
const effectsPath = fileURLToPath(new URL("../content/items/effects.json", import.meta.url));
const effectsFile = parseItemFile("effects", json(effectsPath), "content/items/effects.json");
if (!effectsFile.ok) throw new Error(`${effectsFile.error.file}: ${effectsFile.error.path}: ${effectsFile.error.problem}`);
const obtainable = obtainableUntilViolet(stages);

const report = itemCoverage(items, effectsFile.data.value, new Set(obtainable.keys()));
console.log(`Itens na extração: ${items.length}. Sem efeito mapeado: ${report.unmapped.length}.`);
console.log(`Obtíveis até Violet City: ${obtainable.size} (${[...obtainable.keys()].sort((a, b) => a - b).join(", ")}).`);
for (const id of report.obtainableUnmapped) console.log(`  SEM EFEITO ${id}: ${[...obtainable.get(id)!].join(", ")}`);
if (report.obtainableUnmapped.length > 0) {
  console.log(`FALHOU: ${report.obtainableUnmapped.length} item(ns) obtível(is) até Violet City sem efeito.`);
  process.exit(1);
}
console.log("ok: todo item obtível até Violet City tem efeito mapeado.");
if (process.argv.includes("--all")) console.log(`Sem efeito (todos): ${report.unmapped.join(", ")}`);
