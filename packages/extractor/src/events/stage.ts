// The events stage: per map events and level scripts, the scripts those events run, wild encounter
// and headbutt tables, trainers and a coverage report. See specs/008-events-scripts-encounters/data-model.md.
import {
  EVENTS_FORMAT_VERSION,
  parseEventsFile,
  serializeEventsFile,
  type EncounterRecord,
  type EventsFileKind,
  type HeadbuttRecord,
  type MapEventsFile,
  type ScriptFile,
  type ScriptRef,
  type TrainerRecord,
} from "@soulsilver/shared/events";
import { parseMapFile } from "@soulsilver/shared/maps";
import { parseTextFile, parseTextId } from "@soulsilver/shared/text";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readU16 } from "../binary.ts";
import { CODE_INPUT, listNarcIndices, NARC_INPUT, readArm9, readNarcMember } from "../data/inputs.ts";
import { SOULSILVER_US_LAYOUT } from "../data/layout.ts";
import { MAP_HEADER_OFFSET, MAP_HEADER_SIZE } from "../maps/header.ts";
import type { Stage, StageContext } from "../pipeline/stage.ts";
import { readScriptTable } from "./command-table.ts";
import { readEncounter, readHeadbutt } from "./encounter.ts";
import { EVENT_ARCHIVES, HEADBUTT_ARCHIVE, LEVEL_SCRIPT_FIELD, SCRIPT_BANKS, ZERO_SCRIPT } from "./layout.ts";
import { resolveScript, trainerOfScript, type MapScripts } from "./refs.ts";
import { buildEventsReportFile, type ScriptFileResult } from "./report.ts";
import { decodeScriptFile } from "./script.ts";
import { readTrainer } from "./trainer.ts";
import { readLevelScripts, readZone } from "./zone.ts";

const MIB = 1024 * 1024;

const MAPS_INPUT = { kind: "stage", stage: "maps", output: "maps" } as const;
const TEXT_INPUT = { kind: "stage", stage: "text-catalog", output: "catalog" } as const;

const padded = (n: number) => String(n).padStart(4, "0");
/** A script file this small with no script table is an empty placeholder, not a failure. */
const STUB_SIZE = 8;

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function run(ctx: StageContext): Promise<void> {
  const out = ctx.outputDir("events");
  await Promise.all([mkdir(join(out, "maps"), { recursive: true }), mkdir(join(out, "scripts"), { recursive: true })]);
  const write = <K extends EventsFileKind>(path: string, kind: K, data: Parameters<typeof serializeEventsFile<K>>[1]) => writeFile(join(out, path), serializeEventsFile(kind, data));
  const unresolved: { file: number | null; kind: string; detail: string }[] = [];

  const table = readScriptTable();
  const headers = parseMapFile("map-headers", await readJson(join(ctx.inputDir("maps", "maps"), "map-headers.json")), "map-headers.json");
  if (!headers.ok) throw new Error(`map-headers.json: ${headers.error.path}: ${headers.error.problem}`);
  const textIndex = parseTextFile("text-index", await readJson(join(ctx.inputDir("text-catalog", "catalog"), "index.json")), "index.json");
  if (!textIndex.ok) throw new Error(`index.json: ${textIndex.error.path}: ${textIndex.error.problem}`);
  const textCounts = new Map(textIndex.data.records.map((r) => [r.id, r.count]));
  const arm9 = await readArm9(ctx);
  const maps = headers.data.records;
  const levelFile = (mapId: number) => readU16(arm9, MAP_HEADER_OFFSET + mapId * MAP_HEADER_SIZE + LEVEL_SCRIPT_FIELD);

  // Which maps use each script file, and which message bank its text belongs to.
  const mapsOfFile = new Map<number, number[]>();
  const messageBankOf = new Map<number, number>([[ZERO_SCRIPT.file, ZERO_SCRIPT.messageBank], ...SCRIPT_BANKS.map((b): [number, number] => [b.file, b.messageBank])]);
  for (const map of maps) {
    mapsOfFile.set(map.refs.scripts, [...(mapsOfFile.get(map.refs.scripts) ?? []), map.id]);
    const known = messageBankOf.get(map.refs.scripts);
    if (known === undefined) messageBankOf.set(map.refs.scripts, map.refs.messages);
    else if (known !== map.refs.messages) unresolved.push({ file: map.refs.scripts, kind: "message-bank", detail: `o arquivo ${map.refs.scripts} é usado com os bancos ${known} e ${map.refs.messages}; vale ${known}` });
  }
  const levelFiles = new Set(maps.map((m) => levelFile(m.id)));

  // Scripts.
  const decoded = new Map<number, ScriptFile>();
  const results: ScriptFileResult[] = [];
  const scriptIndices = await listNarcIndices(ctx, EVENT_ARCHIVES.scripts);

  const checkReferences = (script: ScriptFile) => {
    const seen = new Set<string>();
    const note = (kind: string, detail: string) => {
      if (seen.has(`${kind} ${detail}`)) return;
      seen.add(`${kind} ${detail}`);
      unresolved.push({ file: script.file, kind, detail });
    };
    const limits = { species: SOULSILVER_US_LAYOUT.counts.species, move: SOULSILVER_US_LAYOUT.counts.moves, item: SOULSILVER_US_LAYOUT.counts.items };
    for (const command of script.code) {
      if (!("args" in command)) continue;
      for (const arg of Object.values(command.args)) {
        if (typeof arg !== "object") continue;
        if ("text" in arg) {
          const { bank, index } = parseTextId(arg.text);
          if ((textCounts.get(bank) ?? 0) <= index) note("text", `${arg.text} não está no catálogo de textos`);
        }
        for (const kind of ["species", "move", "item"] as const) {
          const value = (arg as Record<string, number | undefined>)[kind];
          if (value !== undefined && value > limits[kind]) note(kind, `${kind} ${value} passa de ${limits[kind]}`);
        }
      }
    }
  };

  for (const [done, file] of scriptIndices.entries()) {
    ctx.signal.throwIfAborted();
    ctx.progress(0.5 * (done / scriptIndices.length));
    if (levelFiles.has(file)) continue;
    const bytes = await readNarcMember(ctx, EVENT_ARCHIVES.scripts, file);
    try {
      const script = decodeScriptFile(bytes, table, file, messageBankOf.get(file) ?? null);
      decoded.set(file, script);
      results.push({ file, maps: mapsOfFile.get(file) ?? [], script });
      await write(`scripts/${padded(file)}.json`, "script-file", script);
      checkReferences(script);
    } catch (error) {
      if (bytes.length <= STUB_SIZE) continue;
      try {
        readLevelScripts(bytes, `file ${file}`);
        continue; // a level script file no map points at
      } catch {
        results.push({ file, maps: mapsOfFile.get(file) ?? [], error: (error as Error).message });
      }
    }
  }

  // Trainers (needed to link npcs).
  const trainers: TrainerRecord[] = [];
  for (const id of await listNarcIndices(ctx, EVENT_ARCHIVES.trainerData)) {
    const trainer = readTrainer(await readNarcMember(ctx, EVENT_ARCHIVES.trainerData, id), await readNarcMember(ctx, EVENT_ARCHIVES.trainerTeams, id), id);
    if (trainer) trainers.push(trainer);
  }
  await write("trainers.json", "trainers", { kind: "trainers", formatVersion: EVENTS_FORMAT_VERSION, records: trainers });
  const trainerIds = new Set(trainers.map((t) => t.id));
  ctx.progress(0.6);

  // Maps.
  const zoneCache = new Map<number, ReturnType<typeof readZone>>();
  const counts = { maps: maps.length, npcs: 0, warps: 0, triggers: 0, signs: 0 };
  for (const map of maps) {
    ctx.signal.throwIfAborted();
    const scripts: MapScripts = { scriptFile: map.refs.scripts, messageBank: map.refs.messages };
    const ref = (id: number): ScriptRef | null => {
      const target = resolveScript(id, scripts);
      if (!target) return null;
      const file = decoded.get(target.file);
      if (file && target.entry >= file.entries.length) unresolved.push({ file: target.file, kind: "script-entry", detail: `o mapa ${map.id} usa o script ${id}, mas o arquivo ${target.file} só tem ${file.entries.length}` });
      return { id: target.id, file: target.file, entry: target.entry };
    };
    let zone = zoneCache.get(map.refs.events);
    if (!zone) {
      zone = readZone(await readNarcMember(ctx, EVENT_ARCHIVES.events, map.refs.events), `zone ${map.refs.events}`);
      zoneCache.set(map.refs.events, zone);
    }
    const levels = readLevelScripts(await readNarcMember(ctx, EVENT_ARCHIVES.scripts, levelFile(map.id)), `level scripts of map ${map.id}`);
    const file: MapEventsFile = {
      kind: "map-events",
      formatVersion: EVENTS_FORMAT_VERSION,
      map: map.id,
      npcs: zone.objects.map((o) => {
        const trainer = trainerOfScript(o.script);
        if (trainer !== null && !trainerIds.has(trainer)) unresolved.push({ file: null, kind: "trainer", detail: `o mapa ${map.id} usa o treinador ${trainer}, que não existe` });
        return { ...o, script: ref(o.script), trainer };
      }),
      warps: zone.warps,
      triggers: zone.triggers.map((t) => ({ ...t, script: ref(t.script) })),
      signs: zone.signs.map((s) => ({ ...s, script: ref(s.script) })),
      levelScripts: {
        onTransition: levels.onTransition === null ? null : ref(levels.onTransition),
        onResume: levels.onResume === null ? null : ref(levels.onResume),
        onLoad: levels.onLoad === null ? null : ref(levels.onLoad),
        frames: levels.frames.map((f) => ({ ...f, script: ref(f.script)! })),
      },
    };
    counts.npcs += file.npcs.length;
    counts.warps += file.warps.length;
    counts.triggers += file.triggers.length;
    counts.signs += file.signs.length;
    await write(`maps/${padded(map.id)}.json`, "map-events", file);
  }
  ctx.progress(0.8);

  // Encounters and headbutt trees.
  const encounters: EncounterRecord[] = [];
  for (const id of await listNarcIndices(ctx, EVENT_ARCHIVES.encounters)) encounters.push(readEncounter(await readNarcMember(ctx, EVENT_ARCHIVES.encounters, id), id));
  await write("encounters.json", "encounters", { kind: "encounters", formatVersion: EVENTS_FORMAT_VERSION, records: encounters });
  const headbutt: HeadbuttRecord[] = [];
  for (const id of await listNarcIndices(ctx, HEADBUTT_ARCHIVE)) {
    const record = readHeadbutt(await readNarcMember(ctx, HEADBUTT_ARCHIVE, id), id);
    if (record) headbutt.push(record);
  }
  await write("headbutt.json", "headbutt", { kind: "headbutt", formatVersion: EVENTS_FORMAT_VERSION, records: headbutt });

  // Report.
  const report = buildEventsReportFile({ counts: { ...counts, encounterBanks: encounters.length, trainers: trainers.length }, files: results, unresolved });
  const checked = parseEventsFile("events-report", report, "report.json");
  if (!checked.ok) throw new Error(`report.json: ${checked.error.path}: ${checked.error.problem}`);
  await write("report.json", "events-report", report);
  ctx.progress(1);
  if (!report.ok) throw new Error(`Perda de scripts acima do limite: ${report.undecodedScripts.length} de ${results.length} arquivos de script não foram decodificados (veja report.json)`);
}

export const eventsStage: Stage = {
  id: "events",
  title: "Lendo eventos, scripts e encontros",
  version: 2,
  weight: 6,
  inputs: [NARC_INPUT, CODE_INPUT, MAPS_INPUT, TEXT_INPUT],
  outputs: ["events"],
  estimateBytes: () => 100 * MIB,
  run,
};
