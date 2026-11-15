// Map table by roadmap block (Marco 4, M4.0): `npm run maps:blocks`. Reads the local extraction (never in CI,
// principle II), gives every Johto map with scripts its block from content/roadmap/map-blocks.json and lists the
// commands of its own script file that the interpreter has no handler for. Writes out/map-blocks.txt (ignored by git).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

type Assignment = string | { pending: string };

export interface BlocksFile {
  blocks: Record<string, string>;
  /** Map section name (bank 279) → block, for every map in it. */
  sections: Record<string, Assignment>;
  /** Map id → block, over its section. */
  maps: Record<string, Assignment>;
  /** Map sections that are not Johto. */
  outside: string[];
}

interface Header {
  id: number;
  mapsec: number;
  refs: { scripts: number };
}

type Command = { name: string } | { raw: true; id: number };

export interface Row {
  map: number;
  section: string;
  block: string | null;
  pending?: string;
  missing: Record<string, number>;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseBlocksFile(value: unknown, file: string): BlocksFile {
  const fail = (path: string, problem: string): never => {
    throw new Error(`${file}: ${path}: ${problem}`);
  };
  if (!isObject(value)) return fail("(raiz)", "esperado um objeto");
  const { blocks, sections, maps, outside } = value;
  if (!isObject(blocks) || Object.values(blocks).some((b) => typeof b !== "string")) return fail("blocks", "esperado { bloco: descrição }");
  const assignments = (key: string, table: unknown) => {
    if (!isObject(table)) return fail(key, "esperado um objeto");
    for (const [name, a] of Object.entries(table)) {
      if (key === "maps" && !/^\d+$/.test(name)) fail(`maps.${name}`, "id de mapa inválido");
      if (typeof a === "string") {
        if (!(a in blocks)) fail(`${key}.${name}`, `bloco ${a} não está em blocks`);
      } else if (!isObject(a) || typeof a["pending"] !== "string" || a["pending"] === "") {
        fail(`${key}.${name}`, 'esperado um bloco ou { "pending": motivo }');
      }
    }
  };
  assignments("sections", sections);
  assignments("maps", maps);
  if (!Array.isArray(outside) || outside.some((s) => typeof s !== "string")) return fail("outside", "esperada uma lista de nomes");
  for (const s of outside as string[]) if (s in (sections as object)) fail("outside", `${s} também está em sections`);
  return value as unknown as BlocksFile;
}

export interface MapBlocksInput {
  headers: Header[];
  sectionName: (mapsec: number) => string;
  /** The decoded script file, or undefined when it is missing. */
  script: (file: number) => { entries: unknown[]; code: Command[] } | undefined;
  implemented: ReadonlySet<string>;
  plan: BlocksFile;
}

export function mapBlocks({ headers, sectionName, script, implemented, plan }: MapBlocksInput) {
  const rows: Row[] = [];
  const unknown = new Map<string, number[]>();
  const outside = new Set(plan.outside);
  for (const h of headers) {
    const file = script(h.refs.scripts);
    if (!file || file.entries.length === 0) continue;
    const section = sectionName(h.mapsec);
    const assigned = plan.maps[String(h.id)] ?? plan.sections[section];
    if (assigned === undefined) {
      if (!outside.has(section)) unknown.set(section, [...(unknown.get(section) ?? []), h.id]);
      continue;
    }
    const missing: Record<string, number> = {};
    for (const c of file.code) {
      const name = "raw" in c ? `raw:${c.id}` : c.name;
      if (!implemented.has(name)) missing[name] = (missing[name] ?? 0) + 1;
    }
    rows.push(typeof assigned === "string" ? { map: h.id, section, block: assigned, missing } : { map: h.id, section, block: null, pending: assigned.pending, missing });
  }
  return { rows, unknownSections: [...unknown].map(([section, maps]) => ({ section, maps })) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { defaultStages } = await import("../packages/app/golden/obtainable.ts");
  const { SCRIPT_HANDLERS } = await import("../packages/shared/src/script/index.ts");
  const stages = defaultStages();
  const json = <T>(...parts: string[]) => JSON.parse(readFileSync(join(stages, ...parts), "utf8")) as T;
  const names = json<{ name: string; records: { text: string }[] }>("text-catalog", "catalog", "en", "0279.json");
  if (names.name !== "map-names") throw new Error("O banco 279 não é map-names");
  const planPath = fileURLToPath(new URL("../content/roadmap/map-blocks.json", import.meta.url));
  const plan = parseBlocksFile(JSON.parse(readFileSync(planPath, "utf8")), "content/roadmap/map-blocks.json");
  const { rows, unknownSections } = mapBlocks({
    headers: json<{ records: Header[] }>("maps", "maps", "map-headers.json").records,
    sectionName: (m) => names.records[m]?.text ?? `mapsec ${m}`,
    script: (f) => {
      try {
        return json(`events`, "events", "scripts", `${String(f).padStart(4, "0")}.json`);
      } catch {
        return undefined;
      }
    },
    implemented: new Set(SCRIPT_HANDLERS.keys()),
    plan,
  });

  const lines: string[] = [];
  const counts: string[] = [];
  for (const [block, title] of Object.entries(plan.blocks)) {
    const mine = rows.filter((r) => r.block === block);
    counts.push(`  ${block} ${title}: ${mine.length} mapas`);
    lines.push(`== ${block} ${title} (${mine.length} mapas)`);
    for (const r of mine) {
      const missing = Object.entries(r.missing).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} ${c}`);
      lines.push(`  mapa ${r.map} ${r.section}: ${missing.length === 0 ? "tudo implementado" : missing.join(", ")}`);
    }
  }
  const pending = rows.filter((r) => r.block === null);
  lines.push(`== Pendentes (${pending.length} mapas)`);
  for (const r of pending) lines.push(`  mapa ${r.map} ${r.section}: ${r.pending} | sem handler: ${Object.keys(r.missing).join(", ") || "-"}`);
  for (const u of unknownSections) lines.push(`SEM BLOCO: ${u.section} (mapas ${u.maps.join(", ")}) não está em sections nem em outside`);

  const out = fileURLToPath(new URL("../out/map-blocks.txt", import.meta.url));
  mkdirSync(join(out, ".."), { recursive: true });
  writeFileSync(out, lines.join("\n") + "\n");
  console.log(`Mapas de Johto com scripts: ${rows.length}. Relatório completo em ${out}`);
  console.log(counts.join("\n"));
  const reasons = new Map<string, string[]>();
  for (const r of pending) reasons.set(`${r.section}: ${r.pending}`, [...(reasons.get(`${r.section}: ${r.pending}`) ?? []), String(r.map)]);
  console.log(`  pendentes: ${pending.length} mapas`);
  for (const [why, maps] of reasons) console.log(`    ${why} (mapas ${maps.join(", ")})`);
  if (unknownSections.length > 0) {
    for (const u of unknownSections) console.log(`FALHOU: ${u.section} (mapas ${u.maps.join(", ")}) sem bloco, pendência nem outside`);
    process.exit(1);
  }
}
