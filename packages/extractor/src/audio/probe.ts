// R0 probe (specs/009-audio-extraction/research.md R0): reads the game's sound archive from an
// existing rom-unpack output and prints counts only, never ROM bytes.
// Usage: node packages/extractor/src/audio/probe.ts <rom-unpack filesystem dir>
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readSbnk } from "./sbnk.ts";
import { readSdat } from "./sdat.ts";
import { commandCensus } from "./sseq.ts";
import { readSwar } from "./swar.ts";
import { SOUND_ARCHIVE } from "./layout.ts";

const root = process.argv[2] ?? "assets/stages/rom-unpack/filesystem";
const sdat = readSdat(new Uint8Array(readFileSync(join(root, ...SOUND_ARCHIVE.split("/")))));
const count = <T>(list: (T | null)[]) => list.filter((x) => x !== null).length;
console.log(`records: ${count(sdat.seqs)} sequences, ${count(sdat.banks)} banks, ${count(sdat.waveArcs)} wave archives`);

const tally = new Map<string, number>();
const add = (key: string) => tally.set(key, (tally.get(key) ?? 0) + 1);
for (const bank of sdat.banks) {
  if (!bank) continue;
  for (const inst of readSbnk(sdat.file(bank.fileId), `bank ${bank.id}`)) {
    if (!inst) continue;
    add(`instrument ${inst.kind}`);
    const notes = inst.kind === "single" ? [inst.note] : inst.kind === "drums" ? inst.notes : inst.regions.map((r) => r.note);
    for (const note of notes) if (note) add(`note ${note.kind}`);
  }
}
let waves = 0;
let looped = 0;
for (const fileId of sdat.waveArcs) {
  if (fileId === null) continue;
  for (const wave of readSwar(sdat.file(fileId), `wave archive file ${fileId}`)) {
    waves++;
    if (wave.loopStart !== null) looped++;
  }
}
console.log([...tally].map(([k, v]) => `${k}: ${v}`).join(", "));
console.log(`waves: ${waves}, looped ${looped}`);

const census = commandCensus(sdat);
console.log(`commands: ${[...census.commands].sort((a, b) => a[0] - b[0]).map(([c, n]) => `0x${c.toString(16)}=${n}`).join(" ")}`);
for (const line of census.problems.slice(0, 10)) console.log(`  ${line}`);
console.log(`sequences read: ${census.read}, with problems: ${census.problems.length}`);
