import { parseEventsJson, type EventsFileKind } from "@soulsilver/shared/events";
import { serializeMapFile } from "@soulsilver/shared/maps";
import { serializeTextFile } from "@soulsilver/shared/text";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eventsStage } from "../../src/events/stage.ts";
import { MAP_HEADER_OFFSET, MAP_HEADER_SIZE } from "../../src/maps/header.ts";
import type { StageContext } from "../../src/pipeline/stage.ts";
import { buildEncounter, buildHeadbutt, buildLevelScripts, buildScriptFile, buildTrainerData, buildTrainerTeam, buildZone, cmd, concat, rel } from "../fixtures/events/builders.ts";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "events-stage-"));
});
afterEach(() => rm(root, { recursive: true }));

const name = (i: number) => `${String(i).padStart(4, "0")}.bin`;

async function narc(path: string, members: Uint8Array[]): Promise<void> {
  const dir = join(root, "rom-unpack", "narc", ...path.split("/"));
  await mkdir(dir, { recursive: true });
  await Promise.all(members.map((m, i) => writeFile(join(dir, name(i)), Buffer.from(m))));
}

const stub = new Uint8Array(4);
const twelve = (value: number) => Array.from({ length: 12 }, () => value);
const header = (id: number, refs: { events: number; scripts: number; messages: number; encounters: number | null }) => ({
  id,
  mapsec: 0,
  areaType: "outdoor" as const,
  area: 0,
  matrix: 0,
  musicDay: 0,
  musicNight: 0,
  weather: 0,
  refs,
});

interface Options {
  /** Message index the script of map 0 shows; the text bank of map 0 has 10 texts. */
  message?: number;
  zoneOverride?: Uint8Array;
}

/** Two maps. Map 0 has a script file (member 5) with two scripts, a level script (member 6), a trainer NPC and a warp. */
async function fakeRom(options: Options = {}): Promise<StageContext> {
  // Script file 2: script 1 shows a text and ends; script 2 jumps back to script 1.
  const body = concat(cmd(45, [1, options.message ?? 3]), cmd(2), cmd(22, rel(0, 7)));
  await narc("a/0/1/2", [stub, stub, stub, stub, stub, buildScriptFile([0, 5], body), buildLevelScripts({ fixed: [[4, 2]], frames: [[0x4001, 1, 1]] }), stub]);
  await narc("a/0/3/2", [
    options.zoneOverride ??
      buildZone({
        objects: [{ id: 1, script: 1, x: 3, z: 4 }, { id: 2, script: 3001, hideFlag: 9 }],
        warps: [{ x: 1, z: 1, header: 1 }],
        coords: [{ script: 2, variable: 0x4000, value: 2 }],
        bgs: [{ script: 0, type: 1 }],
      }),
    buildZone({}),
  ]);
  await narc("a/0/3/7", [buildEncounter({ rates: [10, 0, 0, 0, 0, 0], levels: twelve(3), morning: twelve(16), day: twelve(16), night: twelve(19) })]);
  await narc("a/0/5/5", [buildTrainerData({ type: 0, class: 0, count: 0 }), buildTrainerData({ type: 0, class: 3, count: 1 }), buildTrainerData({ type: 2, class: 4, count: 2, aiFlags: 7 })]);
  await narc("a/0/5/6", [new Uint8Array(8), buildTrainerTeam(0, [{ level: 5, species: 16 }]), buildTrainerTeam(2, [{ level: 8, species: 19, item: 4 }, { level: 9, species: 20 }])]);
  await narc("a/2/5/2", [buildHeadbutt({}), buildHeadbutt({ common: [{ species: 163, minLevel: 2, maxLevel: 3 }], regular: [[[4, 5]]] })]);

  const arm9 = new Uint8Array(MAP_HEADER_OFFSET + 2 * MAP_HEADER_SIZE + 16);
  new DataView(arm9.buffer).setUint16(MAP_HEADER_OFFSET + 8, 6, true); // map 0 level script file
  new DataView(arm9.buffer).setUint16(MAP_HEADER_OFFSET + MAP_HEADER_SIZE + 8, 7, true); // map 1: a stub
  await mkdir(join(root, "code-decompress", "code"), { recursive: true });
  await writeFile(join(root, "code-decompress", "code", "arm9.bin"), arm9);

  await mkdir(join(root, "maps", "maps"), { recursive: true });
  await writeFile(
    join(root, "maps", "maps", "map-headers.json"),
    serializeMapFile("map-headers", {
      kind: "map-headers",
      formatVersion: 1,
      records: [header(0, { events: 0, scripts: 5, messages: 5, encounters: 0 }), header(1, { events: 1, scripts: 7, messages: 6, encounters: null })],
    }),
  );
  await mkdir(join(root, "text-catalog", "catalog"), { recursive: true });
  await writeFile(join(root, "text-catalog", "catalog", "index.json"), serializeTextFile("text-index", { kind: "text-index", formatVersion: 1, language: "en", records: [{ id: 5, name: null, count: 10 }] }));

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

/** Reads an output file through its schema, so the assertions are typed. */
async function read<K extends EventsFileKind>(kind: K, path: string) {
  const result = parseEventsJson(kind, await readFile(join(root, "out", path), "utf8"), path);
  if (!result.ok) throw new Error(`${path}: ${result.error.path}: ${result.error.problem}`);
  return result.data;
}

describe("events stage", () => {
  it("writes one events file per map, with scripts resolved to their file and entry and the trainer linked", async () => {
    await eventsStage.run(await fakeRom());
    const map = await read("map-events", "maps/0000.json");
    expect(map.map).toBe(0);
    expect(map.npcs[0]).toMatchObject({ id: 1, x: 3, z: 4, script: { id: 1, file: 5, entry: 0 }, trainer: null });
    expect(map.npcs[1]).toMatchObject({ hideFlag: 9, script: { id: 3001, file: 953, entry: 1 }, trainer: 2 });
    expect(map.warps).toEqual([{ x: 1, z: 1, destMap: 1, destAnchor: 0, y: 0 }]);
    expect(map.triggers[0]).toMatchObject({ variable: 0x4000, value: 2, script: { id: 2, file: 5, entry: 1 } });
    expect(map.signs[0]!.script).toBeNull();
    expect(map.levelScripts.onLoad).toEqual({ id: 2, file: 5, entry: 1 });
    expect(map.levelScripts.frames).toEqual([{ variable: 0x4001, value: 1, script: { id: 1, file: 5, entry: 0 } }]);
    expect((await read("map-events", "maps/0001.json")).npcs).toEqual([]);
  });

  it("writes each script file once, in the message bank of the map that uses it", async () => {
    await eventsStage.run(await fakeRom());
    expect((await readdir(join(root, "out", "scripts"))).sort()).toEqual(["0005.json"]);
    const script = await read("script-file", "scripts/0005.json");
    expect(script.messageBank).toBe(5);
    expect(script.entries).toHaveLength(2);
    expect(script.code[0]).toEqual({ name: "NPCMsg", args: { msg_id: { text: "0005:3" } } });
  });

  it("writes encounters, headbutt tables and trainers", async () => {
    await eventsStage.run(await fakeRom());
    const encounters = await read("encounters", "encounters.json");
    expect(encounters.records).toHaveLength(1);
    expect(encounters.records[0]!.grass!.night[0]).toMatchObject({ species: 19, minLevel: 3, maxLevel: 3, chance: 20 });
    const headbutt = await read("headbutt", "headbutt.json");
    expect(headbutt.records.map((r) => r.id)).toEqual([1]);
    const trainers = await read("trainers", "trainers.json");
    expect(trainers.records.map((r) => r.id)).toEqual([1, 2]);
    expect(trainers.records[1]).toMatchObject({ aiFlags: 7, class: { id: 4, text: "0730:4" }, name: "0729:2" });
    expect(trainers.records[1]!.team[0]).toMatchObject({ species: 19, item: 4 });
  });

  it("reports command coverage by map and lists a reference the text catalog does not have", async () => {
    await eventsStage.run(await fakeRom({ message: 99 }));
    const report = await read("events-report", "report.json");
    expect(report.ok).toBe(true);
    expect(report.decodedPercent).toBe(100);
    expect(report.counts).toMatchObject({ maps: 2, npcs: 2, warps: 1, triggers: 1, signs: 1, scriptFiles: 1, scripts: 2, commands: 3, encounterBanks: 1, trainers: 2 });
    expect(report.commands).toContainEqual({ name: "NPCMsg", count: 1, maps: [0], globalFiles: [] });
    expect(report.unresolved).toEqual([{ file: 5, kind: "text", detail: "0005:99 não está no catálogo de textos" }]);
  });

  it("fails with the zone number when an event file is damaged", async () => {
    const bad = buildZone({ objects: [{}] });
    new DataView(bad.buffer).setUint32(4, 50, true);
    await expect(eventsStage.run(await fakeRom({ zoneOverride: bad }))).rejects.toThrow(/zone 0/);
  });

  it("writes the same bytes on every run", async () => {
    const ctx = await fakeRom();
    await eventsStage.run(ctx);
    const second = join(root, "out2");
    await mkdir(second, { recursive: true });
    await eventsStage.run({ ...ctx, outputDir: () => second });
    const files = async (dir: string) => (await readdir(dir, { recursive: true })).filter((f) => f.endsWith(".json")).sort();
    const names = await files(join(root, "out"));
    expect(names.length).toBeGreaterThan(5);
    expect(await files(second)).toEqual(names);
    for (const file of names) expect(await readFile(join(second, file))).toEqual(await readFile(join(root, "out", file)));
  });

  it("declares the inputs it reads", () => {
    const inputs = eventsStage.inputs.map((i) => (i.kind === "stage" ? `${i.stage}/${i.output}` : i.kind));
    expect(inputs).toEqual(["rom-unpack/narc", "code-decompress/code", "maps/maps", "text-catalog/catalog"]);
  });
});
