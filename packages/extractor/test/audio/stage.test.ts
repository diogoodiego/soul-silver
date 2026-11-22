import { decodeWav, parseAudioJson, type AudioIndexFile, type AudioReportFile } from "@soulsilver/shared/audio";
import { serializeEventsFile } from "@soulsilver/shared/events";
import { serializeMapFile } from "@soulsilver/shared/maps";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runAudio } from "../../src/audio/stage.ts";
import type { StageContext } from "../../src/pipeline/stage.ts";
import { buildSbnk, buildSdat, buildSseq, buildSwar, ev, sine8 } from "../fixtures/audio/builders.ts";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "audio-stage-"));
});
afterEach(() => rm(root, { recursive: true }));

const cryEvents = [...ev.tempo(100), ...ev.program(0), ...ev.note(60, 127, 0), ...ev.end()];
const short = (key: number) => [...ev.tempo(240), ...ev.note(key, 127, 12), ...ev.end()];
// Intro note, then a looped note: the track jumps back to offset 6.
const looped = [...ev.tempo(240), ...ev.note(55, 127, 24), ...ev.note(60, 127, 48), ...ev.jump(6)];

interface Options {
  missingBank?: number;
  brokenEffect?: boolean;
  notSdat?: boolean;
}

async function fakeWorkspace(options: Options = {}): Promise<StageContext> {
  const seqs: Parameters<typeof buildSdat>[0]["seqs"] = [null, { name: "SEQ_PV001", data: buildSseq(cryEvents), bank: 1 }, { name: "SEQ_PV", data: buildSseq(cryEvents), bank: 1 }, { name: "SEQ_PV_END", data: buildSseq(cryEvents), bank: 1 }];
  while (seqs.length < 1001) seqs.push(null);
  seqs.push({ name: "SEQ_GS_TOWN", data: buildSseq(looped), bank: 0 }); // 1001
  seqs.push({ name: "SEQ_ME_ITEM", data: buildSseq(short(72)), bank: 0 }); // 1002
  seqs.push({ data: buildSseq(short(64)), bank: 0 }); // 1003, no name
  seqs.push({ name: "SEQ_BGM_END", data: buildSseq(cryEvents), bank: 0 }); // 1004: a marker, not a track
  for (let i = 0; i < 60; i++) seqs.push({ name: `SEQ_SE_${i}`, data: buildSseq(options.brokenEffect && i === 0 ? [0xe5] : short(60 + (i % 12))), bank: 0 });
  // Bank 0 (music and effects) plays a looped sine; the cry banks a one-shot wave, as in the game.
  const music = buildSbnk([{ type: 1, baseKey: 60, release: 127 }]);
  const cry = buildSbnk([{ type: 1, wave: 1, baseKey: 60 }]);
  const banks = Array.from({ length: 495 }, (_, i) => (i === options.missingBank ? null : { data: i === 0 ? music : cry, waveArcs: [0] }));
  const sdat = options.notSdat ? new Uint8Array(64) : buildSdat({ seqs, banks, waveArcs: [{ data: buildSwar([{ type: 0, rate: 8000, data: sine8(32, 1), loopWords: 0 }, { type: 0, rate: 8000, data: sine8(64, 2) }]) }] });

  const sound = join(root, "rom-unpack", "filesystem", "data", "sound");
  await mkdir(sound, { recursive: true });
  await writeFile(join(sound, "gs_sound_data.sdat"), sdat);

  const header = (id: number, musicDay: number, musicNight: number) => ({
    id,
    mapsec: 0,
    areaType: "outdoor" as const,
    area: 0,
    matrix: 0,
    musicDay,
    musicNight,
    weather: 0,
    bikeAllowed: true,
    escapeRopeAllowed: false,
    flyAllowed: true,
    refs: { events: 0, scripts: 0, messages: 0, encounters: null },
  });
  await mkdir(join(root, "maps", "maps"), { recursive: true });
  await writeFile(join(root, "maps", "maps", "map-headers.json"), serializeMapFile("map-headers", { kind: "map-headers", formatVersion: 1, records: [header(0, 1001, 1999)] }));

  const scripts = join(root, "events", "events", "scripts");
  await mkdir(scripts, { recursive: true });
  const code = [
    { name: "PlayBGM", args: { bgm: 1998 } },
    { name: "PlaySE", args: { arg0: 1003 } },
    { name: "PlaySE", args: { arg0: 0x8004 } },
    { name: "PlayCry", args: { arg0: 25, arg1: 0 } },
    { name: "End", args: {} },
  ];
  await writeFile(
    join(scripts, "0842.json"),
    serializeEventsFile("script-file", { kind: "script-file", formatVersion: 1, file: 842, messageBank: null, entries: ["L1"], code, labels: { L1: 0 }, movements: {}, unreachableBytes: 0, partial: false }),
  );

  await mkdir(join(root, "out"), { recursive: true });
  const noop = () => {};
  return {
    rom: new Uint8Array(0),
    inputDir: (stage: string, output: string) => join(root, stage, output),
    outputDir: () => join(root, "out"),
    signal: new AbortController().signal,
    progress: noop,
    log: { info: noop, warn: noop, error: noop },
  };
}

async function read<K extends "audio-index" | "audio-report">(kind: K, dir = "out") {
  const result = parseAudioJson(kind, await readFile(join(root, dir, kind === "audio-index" ? "index.json" : "report.json"), "utf8"), kind);
  if (!result.ok) throw new Error(`${result.error.path}: ${result.error.problem}`);
  return result.data as K extends "audio-index" ? AudioIndexFile : AudioReportFile;
}

describe("audio stage", { timeout: 60_000 }, () => {
  it("writes music, jingles, effects and cries with an index the schema accepts", async () => {
    await runAudio(await fakeWorkspace(), 1);
    const index = await read("audio-index");
    expect(index.tracks.map((t) => [t.id, t.kind, t.name])).toEqual(
      expect.arrayContaining([
        [1001, "music", "SEQ_GS_TOWN"],
        [1002, "jingle", "SEQ_ME_ITEM"],
        [1003, "music", "SEQ_1003"],
        [1005, "effect", "SEQ_SE_0"],
      ]),
    );
    expect(index.tracks).toHaveLength(63);
    expect(index.tracks.some((t) => t.id <= 3 || t.id === 1004)).toBe(false); // cry sequences and end markers are not tracks
    expect(index.cries).toHaveLength(494);
    expect(index.cries.at(-1)).toMatchObject({ species: 493, form: 0, file: "cry/493.wav" });
    expect(index.cries.find((c) => c.form === 1)).toMatchObject({ species: 492, bank: 494, file: "cry/492-1.wav" });
    const effect = await readFile(join(root, "out", "effect", "1005.wav"));
    expect(decodeWav(new Uint8Array(effect)).channels[0]!.length).toBe(index.tracks.find((t) => t.id === 1005)!.samples);
    expect((await readdir(join(root, "out", "cry")))).toHaveLength(494);
  });

  it("keeps the loop of a music track in the index", async () => {
    await runAudio(await fakeWorkspace(), 1);
    const town = (await read("audio-index")).tracks.find((t) => t.id === 1001)!;
    expect(town.loop).not.toBeNull();
    expect(town.loop!.end).toBe(town.samples);
    expect(town.loop!.start).toBeGreaterThan(0);
  });

  it("reports counts, sizes and the ids maps and scripts ask for without a track", async () => {
    await runAudio(await fakeWorkspace(), 1);
    const report = await read("audio-report");
    expect(report.ok).toBe(true);
    expect(report.counts).toEqual({ music: 2, jingle: 1, effect: 60, cry: 494 });
    expect(report.bytes.total).toBe(report.bytes.music + report.bytes.jingle + report.bytes.effect + report.bytes.cry);
    expect(report.missingForMaps).toEqual([{ map: 0, field: "musicNight", id: 1999 }]);
    expect(report.missingForScripts).toEqual([{ file: 842, command: "PlayBGM", id: 1998 }]);
    expect(report.loopless).toEqual([1003]);
    expect(report.fallbackCries.length).toBeGreaterThan(0);
  });

  it("lists a track that does not render and goes on, within the 2% limit", async () => {
    await runAudio(await fakeWorkspace({ brokenEffect: true }), 1);
    const report = await read("audio-report");
    expect(report.unconverted).toHaveLength(1);
    expect(report.unconverted[0]).toMatchObject({ kind: "effect", id: 1005, name: "SEQ_SE_0" });
    expect(report.unconverted[0]!.reason).toMatch(/0xe5/);
    expect(report.ok).toBe(true);
  });

  it("fails when a cry is lost, naming the species in the report", async () => {
    await expect(runAudio(await fakeWorkspace({ missingBank: 7 }), 1)).rejects.toThrow(/1 cries/);
    const { missingCries } = await read("audio-report");
    expect(missingCries.map((m) => m.species)).toEqual([7]);
    expect(missingCries[0]!.reason).toMatch(/banco 7/);
  });

  it("fails clearly when the sound archive is not an SDAT", async () => {
    await expect(runAudio(await fakeWorkspace({ notSdat: true }), 1)).rejects.toThrow(/SDAT/);
  });

  it("writes the same bytes with one worker and with several", async () => {
    const ctx = await fakeWorkspace();
    await runAudio(ctx, 1);
    await mkdir(join(root, "out2"), { recursive: true });
    await runAudio({ ...ctx, outputDir: () => join(root, "out2") }, 3);
    const files = async (dir: string) => (await readdir(join(root, dir), { recursive: true })).filter((f) => f.includes(".")).sort();
    const names = await files("out");
    expect(await files("out2")).toEqual(names);
    for (const file of names) expect((await readFile(join(root, "out2", file))).equals(await readFile(join(root, "out", file)))).toBe(true);
  });
});
