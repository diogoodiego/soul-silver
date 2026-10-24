// The audio stage: every music, jingle and effect sequence and every cry rendered to WAV, an index
// with the loop points and a report. See specs/009-audio-extraction/data-model.md.
import {
  AUDIO_FORMAT_VERSION,
  AUDIO_SAMPLE_RATE,
  cryFile,
  parseAudioFile,
  serializeAudioFile,
  trackFile,
  type AudioIndexFile,
  type AudioReportFile,
  type Cry,
  type Track,
} from "@soulsilver/shared/audio";
import { parseEventsJson } from "@soulsilver/shared/events";
import { parseMapFile } from "@soulsilver/shared/maps";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FILESYSTEM_INPUT } from "../data/inputs.ts";
import { SOULSILVER_US_LAYOUT } from "../data/layout.ts";
import type { Stage, StageContext } from "../pipeline/stage.ts";
import { CRY_FORMS, cryBank } from "./cries.ts";
import { CRY_SEQUENCES, MARKER_NAMES, SCRIPT_SOUND_ARGS, SOUND_ARCHIVE, trackKind } from "./layout.ts";
import { buildAudioReportFile, type ReportInput } from "./report.ts";
import { readSdat } from "./sdat.ts";
import { defaultWorkers, renderAll, type Job, type JobResult } from "./worker.ts";

const MIB = 1024 * 1024;
const SPECIES = SOULSILVER_US_LAYOUT.counts.species;
/** Script arguments from 0x4000 up name variables, not tracks. */
const VAR_BASE = 0x4000;

const MAPS_INPUT = { kind: "stage", stage: "maps", output: "maps" } as const;
const EVENTS_INPUT = { kind: "stage", stage: "events", output: "events" } as const;

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

/** Track ids the maps ask for, by day and by night. */
async function mapMusic(ctx: StageContext): Promise<ReportInput["mapMusic"]> {
  const headers = parseMapFile("map-headers", await readJson(join(ctx.inputDir("maps", "maps"), "map-headers.json")), "map-headers.json");
  if (!headers.ok) throw new Error(`map-headers.json: ${headers.error.path}: ${headers.error.problem}`);
  return headers.data.records.flatMap((h) => [
    { map: h.id, field: "musicDay" as const, id: h.musicDay },
    { map: h.id, field: "musicNight" as const, id: h.musicNight },
  ]);
}

/** Tracks and cries the scripts ask for by number (arguments that are variables are left out). */
async function scriptSounds(ctx: StageContext): Promise<ReportInput["scriptSounds"]> {
  const dir = join(ctx.inputDir("events", "events"), "scripts");
  const found: ReportInput["scriptSounds"] = [];
  for (const name of (await readdir(dir)).filter((n) => n.endsWith(".json")).sort()) {
    const parsed = parseEventsJson("script-file", await readFile(join(dir, name), "utf8"), name);
    if (!parsed.ok) throw new Error(`${name}: ${parsed.error.path}: ${parsed.error.problem}`);
    for (const command of parsed.data.code) {
      if (!("args" in command)) continue;
      const arg = SCRIPT_SOUND_ARGS[command.name];
      const value = arg === undefined ? undefined : command.args[arg];
      if (typeof value === "number" && value > 0 && value < VAR_BASE) found.push({ file: parsed.data.file, command: command.name, id: value });
    }
  }
  return found;
}

export async function runAudio(ctx: StageContext, workers: number): Promise<void> {
  const out = ctx.outputDir("audio");
  await Promise.all(["music", "jingle", "effect", "cry"].map((dir) => mkdir(join(out, dir), { recursive: true })));
  const sdatPath = join(ctx.inputDir("rom-unpack", "filesystem"), ...SOUND_ARCHIVE.split("/"));
  const sdat = readSdat(new Uint8Array(await readFile(sdatPath)));

  const tracks = new Map<string, Omit<Track, "channels" | "samples" | "loop" | "bytes">>();
  const cries = new Map<string, Omit<Cry, "channels" | "samples" | "bytes">>();
  const jobs: Job[] = [];
  sdat.seqs.forEach((seq, id) => {
    if (!seq || CRY_SEQUENCES.has(id)) return;
    const name = sdat.names.seq[id] ?? `SEQ_${id}`;
    if (MARKER_NAMES.has(name)) return;
    const kind = trackKind(name);
    tracks.set(`t${id}`, { id, name, kind, file: trackFile(kind, id) });
    jobs.push({ key: `t${id}`, seq: id });
  });
  const cryForms = [...Array.from({ length: SPECIES }, (_, i) => [i + 1, 0] as const), ...CRY_FORMS].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const [species, form] of cryForms) {
    const key = `c${species}-${form}`;
    cries.set(key, { species, form, bank: 0, file: cryFile(species, form) });
    jobs.push({ key, species, form });
  }

  const results = new Map<string, JobResult>();
  await renderAll(
    sdatPath,
    jobs,
    workers,
    async (result) => {
      results.set(result.key, result);
      if ("bytes" in result) await writeFile(join(out, (tracks.get(result.key) ?? cries.get(result.key))!.file), result.bytes);
      ctx.progress(results.size / jobs.length);
    },
    ctx.signal,
  );

  const index: AudioIndexFile = { kind: "audio-index", formatVersion: AUDIO_FORMAT_VERSION, sampleRate: AUDIO_SAMPLE_RATE, tracks: [], cries: [] };
  const unconverted: AudioReportFile["unconverted"] = [];
  const missingCries: AudioReportFile["missingCries"] = [];
  for (const [key, track] of tracks) {
    const r = results.get(key)!;
    if ("error" in r) unconverted.push({ kind: track.kind, id: track.id, name: track.name, reason: r.error });
    else index.tracks.push({ ...track, channels: r.channels, samples: r.samples, loop: r.loop, bytes: r.bytes.length });
  }
  for (const [key, cry] of cries) {
    const r = results.get(key)!;
    if ("error" in r) missingCries.push({ species: cry.species, reason: r.error });
    else index.cries.push({ ...cry, bank: cryBank(cry.species, cry.form), channels: r.channels, samples: r.samples, bytes: r.bytes.length });
  }

  const own = new Set(CRY_FORMS.map(([s, f]) => `${s}-${f}`));
  const report = buildAudioReportFile({
    index,
    unconverted,
    missingCries,
    fallbackCries: SOULSILVER_US_LAYOUT.forms.filter((f) => !own.has(`${f.species}-${f.form}`)).map((f) => ({ species: f.species, form: f.form })),
    mapMusic: await mapMusic(ctx),
    scriptSounds: await scriptSounds(ctx),
  });
  for (const [kind, file, data] of [["audio-index", "index.json", index], ["audio-report", "report.json", report]] as const) {
    const checked = parseAudioFile(kind, data, file);
    if (!checked.ok) throw new Error(`${file}: ${checked.error.path}: ${checked.error.problem}`);
    await writeFile(join(out, file), serializeAudioFile(kind, data as never));
  }
  ctx.progress(1);
  if (!report.ok) {
    throw new Error(`Perda de áudio acima do limite: ${missingCries.length} cries e ${unconverted.length} de ${tracks.size} faixas não foram convertidos (veja report.json)`);
  }
}


export const audioStage: Stage = {
  id: "audio",
  title: "Convertendo músicas e sons",
  version: 1,
  weight: 30,
  inputs: [FILESYSTEM_INPUT, MAPS_INPUT, EVENTS_INPUT],
  outputs: ["audio"],
  estimateBytes: () => 800 * MIB,
  run: (ctx) => runAudio(ctx, defaultWorkers()),
};
