// R0 probe (specs/008-events-scripts-encounters/research.md R0): checks the event archives against an
// existing rom-unpack output. Prints counts only, never ROM bytes.
// Usage: node packages/extractor/src/events/probe.ts <rom-unpack narc dir>
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readLevelScripts, readZone } from "./zone.ts";
import { EVENT_ARCHIVES, HEADBUTT_ARCHIVE } from "./layout.ts";

const root = process.argv[2] ?? "assets/stages/rom-unpack/narc";

function members(rel: string): Uint8Array[] {
  const dir = join(root, rel);
  return readdirSync(dir).filter((f) => f.endsWith(".bin")).sort().map((f) => new Uint8Array(readFileSync(join(dir, f))));
}

function report(name: string, total: number, bad: string[]) {
  console.log(`${name}: ${total - bad.length}/${total} ok`);
  for (const line of bad.slice(0, 5)) console.log(`  ${line}`);
}

const arm9 = new Uint8Array(readFileSync(join(root, "../../code-decompress/code/arm9.bin")));
const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const ENTRY = 24;
const HEADERS = 0xf6be0;
const COUNT = 540;

// Zone files: four counted lists that must fill the file exactly.
{
  const files = members(EVENT_ARCHIVES.events);
  const bad: string[] = [];
  files.forEach((b, i) => {
    try {
      readZone(b, `zone ${i}`);
    } catch (error) {
      bad.push((error as Error).message);
    }
  });
  report(`zone events ${EVENT_ARCHIVES.events}`, files.length, bad);
}

// Level scripts: every header points at a record list that ends with a 0 byte.
{
  const scripts = members(EVENT_ARCHIVES.scripts);
  const bad: string[] = [];
  const seen = new Set<number>();
  for (let id = 0; id < COUNT; id++) {
    const file = u16(arm9, HEADERS + id * ENTRY + 8);
    if (seen.has(file)) continue;
    seen.add(file);
    try {
      readLevelScripts(scripts[file]!, `level scripts ${file}`);
    } catch (error) {
      bad.push((error as Error).message);
    }
  }
  report("level scripts (header +8)", seen.size, bad);
}

// Encounter files: 0xC4 bytes each.
{
  const files = members(EVENT_ARCHIVES.encounters);
  report(`encounters ${EVENT_ARCHIVES.encounters}`, files.length, files.flatMap((b, i) => (b.length === 0xc4 ? [] : [`#${i} has ${b.length} bytes`])));
}

// Trainer files: 20 bytes of data each and a team sized by the data.
{
  const data = members(EVENT_ARCHIVES.trainerData);
  const teams = members(EVENT_ARCHIVES.trainerTeams);
  const bad: string[] = [];
  data.forEach((d, i) => {
    const type = d[0]!;
    const count = d[3]!;
    const size = 8 + (type & 2 ? 2 : 0) + (type & 1 ? 8 : 0);
    if (d.length !== 20) bad.push(`#${i} data has ${d.length} bytes`);
    else if (type > 3) bad.push(`#${i} type ${type}`);
    else if (count > 0 && teams[i]!.length !== ((count * size + 3) & ~3)) bad.push(`#${i} team has ${teams[i]!.length} bytes, expected ${count} x ${size} rounded up to 4`);
  });
  report("trainers", data.length, bad);
}


// Headbutt files: 4 + 72 bytes of tables, then 24 bytes (six coordinate pairs) per tree group; 4 bytes means none.
{
  const files = members(HEADBUTT_ARCHIVE);
  const bad: string[] = [];
  files.forEach((b, i) => {
    if (b.length === 4) return;
    const trees = u16(b, 0) + u16(b, 2);
    if (b.length !== 76 + trees * 24) bad.push(`#${i} has ${b.length} bytes, expected ${76 + trees * 24}`);
  });
  report(`headbutt ${HEADBUTT_ARCHIVE}`, files.length, bad);
}
