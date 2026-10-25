// Usage: node scripts/combat-coverage.ts <extraction stages folder>
// Writes content/combat/coverage.json: every move the Pokémon of the playable slice can learn
// (spec 013, research R11). Exit codes: 0 written, 2 usage or data error.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseEventsFile, type EncounterRecord } from "../packages/shared/src/events/index.ts";
import { parseGameDataFile, type LearnsetRecord, type MachineRecord, type TutorRecord } from "../packages/shared/src/game-data/index.ts";
import { parseMapFile } from "../packages/shared/src/maps/index.ts";
import { serializeCombatFile } from "../packages/shared/src/combat/index.ts";

export const SLICE_ROUTES = ["Route 29", "Route 30", "Route 31"];
/** Chikorita, Cyndaquil and Totodile with their evolutions. */
export const STARTERS = [152, 153, 154, 155, 156, 157, 158, 159, 160];
export const COVERAGE_SOURCE = "Route 29, Route 30, Route 31 (all encounter tables) + starters and their evolutions";

/** Every species an encounter table can produce, radio and swarm swaps included. */
export function encounterSpecies(e: EncounterRecord): number[] {
  const slots = [...(e.grass ? [...e.grass.morning, ...e.grass.day, ...e.grass.night] : []), ...(e.surf ?? []), ...(e.rockSmash ?? []), ...(e.oldRod ?? []), ...(e.goodRod ?? []), ...(e.superRod ?? [])];
  return [
    ...slots.map((s) => s.species),
    ...(e.sounds ? [...e.sounds.hoenn, ...e.sounds.sinnoh] : []),
    ...(e.swarm ? [e.swarm.grass, e.swarm.surf, e.swarm.fish] : []),
    ...(e.nightFish ? [e.nightFish] : []),
  ].filter((s) => s > 0);
}

/** Move ids, increasing, learnable by the species by level, machine, egg or tutor. */
export function learnableMoves(species: Iterable<number>, learnsets: LearnsetRecord[], machines: MachineRecord[], tutors: TutorRecord[]): number[] {
  const moves = new Set<number>();
  for (const id of species) {
    const l = learnsets.find((r) => r.id === id);
    if (!l) throw new Error(`Sem learnset para a espécie ${id}`);
    for (const m of l.levelUp) moves.add(m.move);
    for (const m of l.machines) moves.add(machines.find((r) => r.id === m)!.move);
    for (const m of l.egg) moves.add(m);
    for (const t of l.tutors) moves.add(tutors.find((r) => r.id === t)!.move);
  }
  return [...moves].sort((a, b) => a - b);
}

function read<T>(parsed: { ok: true; data: T } | { ok: false; error: { file: string; path: string; problem: string } }): T {
  if (!parsed.ok) throw new Error(`${parsed.error.file}: ${parsed.error.path}: ${parsed.error.problem}`);
  return parsed.data;
}

export function computeCoverage(stagesDir: string): number[] {
  const json = (...parts: string[]) => JSON.parse(readFileSync(join(stagesDir, ...parts), "utf8")) as unknown;
  const names = json("text-catalog", "catalog", "en", "0279.json") as { name: string; records: { id: number; text: string }[] };
  if (names.name !== "map-names") throw new Error("O banco 279 não é map-names");
  const headers = read(parseMapFile("map-headers", json("maps", "maps", "map-headers.json"), "map-headers.json")).records;
  const encounters = read(parseEventsFile("encounters", json("events", "events", "encounters.json"), "encounters.json")).records;
  const ids = new Set(headers.filter((h) => SLICE_ROUTES.includes(names.records[h.mapsec]?.text ?? "") && h.refs.encounters !== null).map((h) => h.refs.encounters!));
  if (ids.size !== SLICE_ROUTES.length) throw new Error(`Esperadas ${SLICE_ROUTES.length} tabelas de encontro, achadas ${ids.size}`);
  const species = new Set(STARTERS);
  for (const e of encounters.filter((r) => ids.has(r.id))) for (const s of encounterSpecies(e)) species.add(s);
  return learnableMoves(
    species,
    read(parseGameDataFile("learnsets", json("data-learnsets", "json", "learnsets.json"), "learnsets.json")).records,
    read(parseGameDataFile("machines", json("data-learnsets", "json", "machines.json"), "machines.json")).records,
    read(parseGameDataFile("tutors", json("data-learnsets", "json", "tutors.json"), "tutors.json")).records,
  );
}

export const COVERAGE_FILE = join(import.meta.dirname, "..", "content", "combat", "coverage.json");

if (import.meta.main) {
  const stagesDir = process.argv[2];
  if (!stagesDir) {
    console.error("Uso: node scripts/combat-coverage.ts <pasta stages da extração>");
    process.exit(2);
  }
  try {
    const moves = computeCoverage(stagesDir);
    writeFileSync(COVERAGE_FILE, serializeCombatFile("coverage", { kind: "combat-coverage", formatVersion: 1, source: COVERAGE_SOURCE, moves }));
    console.log(`${moves.length} golpes em ${COVERAGE_FILE}`);
  } catch (error) {
    console.error((error as Error).message);
    process.exit(2);
  }
}
