import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serializeEventsFile, type MapEventsFile } from "@soulsilver/shared/events";
import { serializeMapFile, type CollisionCell, type MapArea, type MapHeader } from "@soulsilver/shared/maps";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadWorld } from "../src/world-loader";

// Synthetic extraction (no ROM data): maps 1 and 2 side by side on matrix 0, map 3 indoors on matrix 5.

const free: CollisionCell = { category: "free", raw: 0 };
const header = (id: number, matrix: number): MapHeader => ({
  id,
  mapsec: 0,
  areaType: matrix === 0 ? "outdoor" : "indoor",
  area: 0,
  matrix,
  musicDay: 0,
  musicNight: 0,
  weather: 0,
  refs: { events: id, scripts: 0, messages: 0, encounters: null },
});
const areas: MapArea[] = [
  { id: 0, name: "johto", width: 2, height: 1, pieces: [0, 1], heights: null, maps: [1, 2] },
  { id: 5, name: "house", width: 1, height: 1, pieces: [2], heights: null, maps: null },
];
const events = (map: number, warps: MapEventsFile["warps"]): MapEventsFile => ({
  kind: "map-events",
  formatVersion: 1,
  map,
  npcs: [],
  warps,
  triggers: [],
  signs: [],
  levelScripts: { onTransition: null, onResume: null, onLoad: null, frames: [] },
});
const warp = (x: number, z: number, destMap: number, destAnchor: number) => ({ x, z, destMap, destAnchor, y: 0 });

let stages: string;
const logs: string[] = [];

async function collision(map: number, level: number) {
  const dir = join(stages, "maps", "maps", String(map).padStart(4, "0"), "collision");
  await mkdir(dir, { recursive: true });
  const file = { kind: "map-collision" as const, formatVersion: 1 as const, map, level, width: 32, height: 32, tiles: Array<CollisionCell>(32 * 32).fill(free) };
  await writeFile(join(dir, `${level}.json`), serializeMapFile("map-collision", file));
}

beforeAll(async () => {
  stages = await mkdtemp(join(tmpdir(), "world-loader-"));
  const maps = join(stages, "maps", "maps");
  const eventMaps = join(stages, "events", "events", "maps");
  await mkdir(maps, { recursive: true });
  await mkdir(eventMaps, { recursive: true });
  await writeFile(join(maps, "map-headers.json"), serializeMapFile("map-headers", { kind: "map-headers", formatVersion: 1, records: [header(1, 0), header(2, 0), header(3, 5), header(4, 5)] }));
  await writeFile(join(maps, "map-areas.json"), serializeMapFile("map-areas", { kind: "map-areas", formatVersion: 1, records: areas }));
  await collision(1, 0);
  await collision(1, 1);
  await collision(2, 0);
  await collision(3, 0);
  const write = (file: MapEventsFile) => writeFile(join(eventMaps, `${String(file.map).padStart(4, "0")}.json`), serializeEventsFile("map-events", file));
  await write(events(1, [warp(5, 5, 3, 0), warp(6, 5, 99, 0), warp(7, 5, 3, 4)]));
  await write(events(2, []));
  await write(events(3, [warp(2, 2, 1, 0)]));
  // Map 4 has a broken collision file.
  const broken = join(maps, "0004", "collision");
  await mkdir(broken, { recursive: true });
  await writeFile(join(broken, "0.json"), JSON.stringify({ kind: "map-collision", width: 1 }));
  await write(events(4, []));
});

afterAll(async () => {
  await rm(stages, { recursive: true, force: true });
});

describe("loadWorld", () => {
  it("builds a map with its levels, neighbors and warps", () => {
    const world = loadWorld(stages, (m) => logs.push(m));
    const map = world("1")!;
    expect(map.levels).toHaveLength(2);
    expect(map.neighbors).toEqual([{ map: "2", dx: 512, dy: 0 }]);
    expect(map.warps[0]).toEqual({ tx: 5, ty: 5, destMap: "3", destAnchor: 0 });
  });

  it("keeps every warp, so anchors keep their index, and logs those that lead nowhere", () => {
    const lines: string[] = [];
    expect(loadWorld(stages, (m) => lines.push(m))("1")!.warps).toHaveLength(3);
    expect(lines).toHaveLength(2);
    expect(lines.join("\n")).toMatch(/99/);
  });

  it("caches each map", () => {
    const world = loadWorld(stages, () => {});
    expect(world("3")).toBe(world("3"));
  });

  it("returns undefined for a map that was not extracted", () => {
    expect(loadWorld(stages, () => {})("77")).toBeUndefined();
  });

  it("logs the file and leaves the map missing when one is invalid", () => {
    const lines: string[] = [];
    const world = loadWorld(stages, (m) => lines.push(m));
    expect(world("4")).toBeUndefined();
    expect(world("4")).toBeUndefined();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/0\.json/);
  });

  it("is empty, with one log line, when there is no extraction", () => {
    const lines: string[] = [];
    const world = loadWorld(join(stages, "missing"), (m) => lines.push(m));
    expect(world("1")).toBeUndefined();
    expect(world("2")).toBeUndefined();
    expect(lines).toHaveLength(1);
  });
});
