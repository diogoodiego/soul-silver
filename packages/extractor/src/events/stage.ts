// The events stage: per map events and level scripts, the scripts those events run, wild encounter
// and headbutt tables, trainers and a coverage report. See specs/008-events-scripts-encounters/data-model.md.
import {
  EVENTS_FORMAT_VERSION,
  parseEventsFile,
  serializeEventsFile,
  type EncounterRecord,
  type EventsFileKind,
  type HeadbuttRecord,
  type RockSmashRecord,
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
import { CODE_INPUT, FILESYSTEM_INPUT, listNarcIndices, NARC_INPUT, readArm9, readFileSystemFile, readNarcMember, readOverlay } from "../data/inputs.ts";
import { SOULSILVER_US_LAYOUT } from "../data/layout.ts";
import { MAP_HEADER_OFFSET, MAP_HEADER_SIZE } from "../maps/header.ts";
import type { Stage, StageContext } from "../pipeline/stage.ts";
import { readScriptTable } from "./command-table.ts";
import { readEncounter, readHeadbutt } from "./encounter.ts";
import { readRockSmash } from "./rock-smash.ts";
import {
  CLASS_MUSIC,
  EVENT_ARCHIVES,
  HEADBUTT_ARCHIVE,
  ROCK_SMASH_ARCHIVE,
  AZALEA_GYM,
  FLY_POINTS,
  HIDDEN_ITEMS,
  APRICORN_TREES,
  BERRY_DATA,
  PHONE,
  INIT_SCRIPT,
  LEVEL_SCRIPT_FIELD,
  NEW_GAME_LOCATION,
  NPC_TRADES,
  PRIZE_TABLE,
  SCRIPT_BANKS,
  SHOPS,
  STD_MESSAGES,
  TRAINER_CLASS_COUNT,
  TRAINER_MESSAGES,
  ZERO_SCRIPT,
} from "./layout.ts";
import { readFlyPoints } from "./fly-points.ts";
import { gymLevers, readAzaleaGym } from "./azalea-gym.ts";
import { readMatrix } from "../maps/grid.ts";
import { readPiece } from "../maps/piece.ts";
import { MAP_ARCHIVES } from "../maps/stage.ts";

/** A map's pieces with their cell in its matrix (spec 030.5: the Azalea Gym's ropes and levers). */
async function mapCells(ctx: StageContext, matrixId: number) {
  const matrix = readMatrix(await readNarcMember(ctx, MAP_ARCHIVES.matrices, matrixId), matrixId);
  const cells = matrix.pieces.map((piece, i) => ({ x: i % matrix.width, z: Math.floor(i / matrix.width), piece }));
  return Promise.all(cells.filter((c): c is typeof c & { piece: number } => c.piece !== null).map(async (c) => ({ ...c, piece: readPiece(await readNarcMember(ctx, MAP_ARCHIVES.pieces, c.piece)) })));
}
import { readApricornTrees, readBerryGrowth, readHiddenItems } from "./field-items.ts";
import { readPhoneBook } from "./phone.ts";
import { PHONE_FORMAT_VERSION, serializePhoneFile } from "@soulsilver/shared/phone";
import { readNewGameStart, readStdMessageBanks } from "./new-game.ts";
import { readNpcTrade } from "./npc-trades.ts";
import { readShops } from "./shops.ts";
import { readTrainerClasses, readTrainerMessages } from "./trainer-classes.ts";
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
  // Trainer classes and lines (spec 022).
  const overlay12 = await readOverlay(ctx, PRIZE_TABLE.overlay);
  const classes = readTrainerClasses({
    prize: overlay12.subarray(PRIZE_TABLE.offset, PRIZE_TABLE.offset + TRAINER_CLASS_COUNT * 4),
    musicClasses: arm9.subarray(CLASS_MUSIC.classes, CLASS_MUSIC.classes + CLASS_MUSIC.classCount * 2),
    musicList: arm9.subarray(CLASS_MUSIC.list, CLASS_MUSIC.list + CLASS_MUSIC.listCount * 4),
    classes: TRAINER_CLASS_COUNT,
  });
  await write("trainer-classes.json", "trainer-classes", { kind: "trainer-classes", formatVersion: EVENTS_FORMAT_VERSION, records: classes });
  // Poké Mart stock (spec 023).
  await write("shops.json", "shops", { kind: "shops", formatVersion: EVENTS_FORMAT_VERSION, records: readShops(arm9, SHOPS) });
  // New game start and the std message banks (spec 024).
  await write("new-game.json", "new-game", { kind: "new-game", formatVersion: EVENTS_FORMAT_VERSION, ...readNewGameStart(arm9, NEW_GAME_LOCATION), initScript: INIT_SCRIPT });
  const banks = readStdMessageBanks(await readOverlay(ctx, STD_MESSAGES.overlay), STD_MESSAGES);
  await write("std-messages.json", "std-messages", { kind: "std-messages", formatVersion: EVENTS_FORMAT_VERSION, banks });
  // Fly destinations (spec 025).
  await write("fly-points.json", "fly-points", { kind: "fly-points", formatVersion: EVENTS_FORMAT_VERSION, points: readFlyPoints(arm9, FLY_POINTS) });
  // The Azalea Gym's Spinarak threads (spec 030.5).
  const gymMap = maps.find((m) => m.id === AZALEA_GYM.map);
  if (!gymMap) ctx.log.warn(`Map ${AZALEA_GYM.map} is not in map-headers.json: the Azalea Gym gets no ropes or levers`, "events");
  const gymCells = gymMap ? await mapCells(ctx, gymMap.matrix) : [];
  await write("azalea-gym.json", "azalea-gym", {
    kind: "azalea-gym",
    formatVersion: EVENTS_FORMAT_VERSION,
    ...readAzaleaGym(await readOverlay(ctx, AZALEA_GYM.overlay), AZALEA_GYM),
    levers: gymLevers(gymCells, AZALEA_GYM.levers),
  });
  // In-game trades (item 030.10).
  const trades = await Promise.all((await listNarcIndices(ctx, NPC_TRADES.narc)).map(async (id) => readNpcTrade(await readNarcMember(ctx, NPC_TRADES.narc, id), id, NPC_TRADES.namesBank)));
  await write("npc-trades.json", "npc-trades", { kind: "npc-trades", formatVersion: EVENTS_FORMAT_VERSION, records: trades });
  // Hidden items, apricorn trees and Berry Pot growth (spec 027).
  const berryData = await Promise.all((await listNarcIndices(ctx, BERRY_DATA)).map((id) => readNarcMember(ctx, BERRY_DATA, id)));
  await write("field-items.json", "field-items", {
    kind: "field-items",
    formatVersion: EVENTS_FORMAT_VERSION,
    hidden: readHiddenItems(arm9, HIDDEN_ITEMS),
    apricornTrees: readApricornTrees(arm9, APRICORN_TREES),
    berries: readBerryGrowth(berryData),
  });
  const messages = readTrainerMessages(await readNarcMember(ctx, TRAINER_MESSAGES.narc, TRAINER_MESSAGES.member));
  await write("trainer-messages.json", "trainer-messages", { kind: "trainer-messages", formatVersion: EVENTS_FORMAT_VERSION, records: messages });
  const trainerIds = new Set(trainers.map((t) => t.id));
  // The phone book (spec 026).
  const phoneInput = { book: await readFileSystemFile(ctx, PHONE.book), arm9, overlay101: await readOverlay(ctx, PHONE.scripts.overlay), overlay26: await readOverlay(ctx, PHONE.rematch.overlay) };
  await writeFile(join(out, "phone.json"), serializePhoneFile("phone", { kind: "phone", formatVersion: PHONE_FORMAT_VERSION, value: readPhoneBook(phoneInput, PHONE, trainerIds) }));
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
  const rockSmash: RockSmashRecord[] = [];
  for (const id of await listNarcIndices(ctx, ROCK_SMASH_ARCHIVE)) {
    const record = readRockSmash(await readNarcMember(ctx, ROCK_SMASH_ARCHIVE, id), id);
    if (record) rockSmash.push(record);
  }
  await write("rock-smash.json", "rock-smash", { kind: "rock-smash", formatVersion: EVENTS_FORMAT_VERSION, records: rockSmash });

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
  // 3: trainer classes and trainer lines (spec 022). 4: Poké Mart stock (spec 023).
  // 5: new-game start and std message table (spec 024).
  // 6: Fly destinations (spec 025). 7: Rock Smash item odds (spec 025). 8: the phone book (spec 026). 9: its greetings.
  // 10: the Azalea Gym's threads (spec 030.5). 11: its ropes and levers.
  version: 11,
  weight: 6,
  inputs: [NARC_INPUT, CODE_INPUT, FILESYSTEM_INPUT, MAPS_INPUT, TEXT_INPUT],
  outputs: ["events"],
  estimateBytes: () => 100 * MIB,
  run,
};
