// R0 probe (specs/006-map-prerender/research.md): checks the map archive layout
// against an existing rom-unpack output. Prints counts only, never ROM bytes.
// Usage: node packages/extractor/src/maps/probe.ts <rom-unpack narc dir>
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? "assets/stages/rom-unpack/narc";

function members(rel: string): Uint8Array[] {
  const dir = join(root, rel);
  return readdirSync(dir).filter((f) => f.endsWith(".bin")).sort().map((f) => readFileSync(join(dir, f)));
}

const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u32 = (b: Uint8Array, o: number) => (u16(b, o) | (u16(b, o + 2) << 16)) >>> 0;
const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));

function report(name: string, total: number, bad: string[]) {
  console.log(`${name}: ${total - bad.length}/${total} ok`);
  for (const line of bad.slice(0, 5)) console.log(`  ${line}`);
}

// Land data: 4 x u32 section sizes, HGSS extra block (u16 0x1234, u16 size), then sections.
{
  const files = members("a/0/6/5");
  const bad: string[] = [];
  files.forEach((b, i) => {
    const [perm, bld, model, bdhc] = [0, 4, 8, 12].map((o) => u32(b, o)) as [number, number, number, number];
    const extra = u16(b, 0x12);
    const modelAt = 0x14 + extra + perm + bld;
    const size = modelAt + model + bdhc;
    if (u16(b, 0x10) !== 0x1234) bad.push(`#${i} missing 0x1234`);
    else if (perm !== 0x800) bad.push(`#${i} permissions ${perm}`);
    else if (bld % 48 !== 0) bad.push(`#${i} buildings ${bld} not 48-byte records`);
    else if (size !== b.length) bad.push(`#${i} size ${size} != ${b.length}`);
    else if (model > 0 && ascii(b, modelAt, 4) !== "BMD0") bad.push(`#${i} no BMD0 at model offset`);
    else if (bdhc > 0 && ascii(b, modelAt + model, 4) !== "BDHC") bad.push(`#${i} no BDHC at height offset`);
  });
  report("land data a/0/6/5", files.length, bad);
}

// Map matrix: u8 width, height, hasHeaders, hasHeights, nameLen, name,
// then u16 headers grid, u8 heights grid, u16 land grid.
{
  const files = members("a/0/4/1");
  const bad: string[] = [];
  files.forEach((b, i) => {
    const [w, h, hasHeaders, hasHeights, nameLen] = [b[0]!, b[1]!, b[2]!, b[3]!, b[4]!];
    const cells = w * h;
    const size = 5 + nameLen + (hasHeaders ? cells * 2 : 0) + (hasHeights ? cells : 0) + cells * 2;
    if (size !== b.length) bad.push(`#${i} ${w}x${h} size ${size} != ${b.length}`);
  });
  report("map matrix a/0/4/1", files.length, bad);
}

// Map headers: 540 x 24-byte entries in the decompressed ARM9; every index must
// point into the archive it references.
{
  const arm9 = readFileSync(join(root, "../../code-decompress/code/arm9.bin"));
  const limits: [string, number, number, boolean][] = [
    ["area", 1, members("a/0/4/2").length, true],
    ["matrix", 4, members("a/0/4/1").length, false],
    ["scripts", 6, members("a/0/1/2").length, false],
    ["messages", 10, members("a/0/2/7").length, false],
    ["events", 16, members("a/0/3/2").length, false],
  ];
  const bad: string[] = [];
  for (let i = 0; i < 540; i++) {
    const o = 0xf6be0 + i * 24;
    for (const [field, offset, max, byte] of limits) {
      const value = byte ? arm9[o + offset]! : u16(arm9, o + offset);
      if (value >= max) bad.push(`#${i} ${field} ${value} >= ${max}`);
    }
  }
  report("map headers arm9@0xf6be0", 540, bad);
}

// Permission values present in land data: low byte behavior, high byte flags.
{
  const counts = new Map<number, number>();
  for (const b of members("a/0/6/5")) {
    const start = 0x14 + u16(b, 0x12);
    for (let t = 0; t < 1024; t++) {
      const v = u16(b, start + t * 2);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
  }
  const behaviors = new Map<number, number>();
  const flags = new Map<number, number>();
  for (const [v, n] of counts) {
    behaviors.set(v & 0xff, (behaviors.get(v & 0xff) ?? 0) + n);
    flags.set(v >> 8, (flags.get(v >> 8) ?? 0) + n);
  }
  const hex = (m: Map<number, number>) =>
    [...m].sort((a, b) => a[0] - b[0]).map(([k, n]) => `${k.toString(16).padStart(2, "0")}:${n}`).join(" ");
  console.log(`permission behaviors (low byte): ${hex(behaviors)}`);
  console.log(`permission flags (high byte): ${hex(flags)}`);
}

// Area data: 8 bytes per area; texture set index must point into a/0/4/4.
{
  const areas = members("a/0/4/2");
  const textures = members("a/0/4/4").length;
  const builds = members("a/0/4/3").length;
  const bad: string[] = [];
  areas.forEach((b, i) => {
    if (b.length !== 8) bad.push(`#${i} size ${b.length}`);
    else if (u16(b, 0) >= builds) bad.push(`#${i} building set ${u16(b, 0)} >= ${builds}`);
    else if (u16(b, 2) >= textures) bad.push(`#${i} texture set ${u16(b, 2)} >= ${textures}`);
  });
  report(`area data a/0/4/2 (build sets ${builds}, texture sets ${textures})`, areas.length, bad);
}
