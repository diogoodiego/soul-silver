import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { MESH_VERTEX_FLOATS, parseMapJson } from "@soulsilver/shared/maps";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAP_HEADER_COUNT, MAP_HEADER_OFFSET } from "../../src/maps/header.ts";
import { mapsStage } from "../../src/maps/stage.ts";
import { createRegistry } from "../../src/pipeline/registry.ts";
import { runPipeline } from "../../src/pipeline/run.ts";
import type { Stage } from "../../src/pipeline/stage.ts";
import { ByteWriter } from "../fixtures/byte-writer.ts";
import { displayList, texcoord, vtx16 } from "../fixtures/maps/build-gx.ts";
import { buildLand } from "../fixtures/maps/build-land.ts";
import { fieldTextureTable, scrollAnimation, scrollFile } from "../fixtures/maps/build-animation.ts";
import { buildModel, buildNitroFile, buildTex0 } from "../fixtures/maps/build-nitro.ts";
import { memoryLogger, sandbox, type Sandbox } from "../pipeline/helpers.ts";

/** A ground quad over the whole piece with one material. */
function groundModel(material: string, texture: string) {
  const quad = displayList([
    [0x40, 1],
    texcoord(0, 0), vtx16(-4, 0, -4),
    texcoord(8, 0), vtx16(4, 0, -4),
    texcoord(8, 8), vtx16(4, 0, 4),
    texcoord(0, 8), vtx16(-4, 0, 4),
    [0x41],
  ]);
  return buildModel({ name: "m", posScale: 64, nodes: [{ name: "n" }], sbc: [0x06, 0, 0, 0, 0x0b, 0x04, 0, 0x05, 0, 0x2b, 0x01], materials: [{ name: material, texture, repeat: [true, true] }], shapes: [quad] });
}

const flat = [{ kind: "const", value: 0x1000 }, { kind: "const", value: 0x1000 }, { kind: "const", value: 0x1000 }, { kind: "const", value: 0 }, { kind: "const", value: 0 }] as const;
const groundAnimations = scrollFile(["sea"], [scrollAnimation(4, [{ name: "g", tracks: [flat[0], flat[1], flat[2], { kind: "s16", values: [0, 0, 0.25, 0.25] }, flat[4]] }])]);
const animations = scrollFile(["water"], [scrollAnimation(4, [{ name: "wind_lm3", tracks: [flat[0], flat[1], flat[2], { kind: "s16", values: [0, 0, 0.125, 0.125] }, flat[4]] }, { name: "unused_material", tracks: [...flat] }])]);

/** Header table: header 0 on matrix 0, header 2 on the single-map matrix 1, every other one on matrix 0; header 3 on the single-map matrix 2 (flower piece), in area 1. */
function arm9() {
  const w = new ByteWriter();
  for (let i = 0; i < MAP_HEADER_OFFSET; i++) w.u8(0);
  for (let id = 0; id < MAP_HEADER_COUNT; id++) {
    w.u8(0xff).u8(id === 3 ? 1 : 0).u16(0).u16(id === 2 ? 1 : id === 3 ? 2 : 0).u16(0).u16(0).u16(0).u16(1000).u16(1001).u16(0).u8(126).u8(0).u8(0).u8(0).u8(0).u8(0);
  }
  return w.toBytes();
}

const matrix = (maps: number[] | null, piece: number) => {
  const w = new ByteWriter().u8(1).u8(1).u8(maps ? 1 : 0).u8(maps ? 1 : 0).u8(3).ascii("map");
  if (maps) w.u16(maps[0]!).u8(0);
  return w.u16(piece).toBytes();
};

const unknownPermission: number[] = [];
unknownPermission[5] = 0x0465;

const ARCHIVES: Record<string, Uint8Array[]> = {
  "a/0/4/2": [new Uint8Array([0, 0, 0, 0, 0xff, 0xff, 1, 1]), new Uint8Array([0, 0, 0, 0, 0, 0, 1, 1])],
  "a/0/4/1": [matrix([0], 0), matrix(null, 1), matrix(null, 2)],
  "a/0/6/5": [
    buildLand({ model: groundModel("g", "ground") }),
    buildLand({ model: groundModel("wind_lm3", "ground"), permissions: unknownPermission }),
    buildLand({ model: groundModel("g", "flower01") }),
  ],
  "a/0/4/4": [
    buildNitroFile("BTX0", [
      buildTex0(
        [{ name: "ground", format: 3, width: 8, height: 8, texels: new Uint8Array(32).fill(0x10) }, { name: "flower01", format: 3, width: 8, height: 8, texels: new Uint8Array(32).fill(0x11) }],
        [{ name: "ground_pl", colors: [0x03e0, 0x7c00] }],
      ),
    ]),
  ],
  "data/fldtanime.narc": [
    fieldTextureTable([{ name: "flower01", keys: [[0, 2], [1, 4]] }]),
    buildNitroFile("BTX0", [
      buildTex0(
        [{ name: "flower01.1", format: 3, width: 8, height: 8, texels: new Uint8Array(32).fill(0x01) }, { name: "flower01.2", format: 3, width: 8, height: 8, texels: new Uint8Array(32).fill(0x10) }],
        [{ name: "flower01_pl", colors: [0x001f, 0x7fff] }],
      ),
    ]),
  ],
  "a/0/4/0": [],
  "a/1/4/8": [],
  "a/1/0/6": [animations],
  "a/1/4/0": [groundAnimations],
  "a/0/1/2": [new Uint8Array(4)],
  "a/0/2/7": [new Uint8Array(4)],
  "a/0/3/2": [new Uint8Array(4)],
  "a/0/3/7": [new Uint8Array(4)],
};

function stub(id: string, outputs: string[], write: (dir: (output: string) => string) => Promise<void>): Stage {
  return {
    id,
    title: id,
    version: 1,
    weight: 1,
    inputs: [{ kind: "rom" }],
    outputs,
    estimateBytes: () => 1024,
    run: async (ctx) => {
      for (const output of outputs) await mkdir(ctx.outputDir(output), { recursive: true });
      await write((output) => ctx.outputDir(output));
    },
  };
}

const unpack = stub("rom-unpack", ["binaries", "filesystem", "narc"], async (dir) => {
  for (const [path, members] of Object.entries(ARCHIVES)) {
    const folder = join(dir("narc"), ...path.split("/"));
    await mkdir(folder, { recursive: true });
    for (const [i, bytes] of members.entries()) await writeFile(join(folder, `${String(i).padStart(4, "0")}.bin`), bytes);
  }
});
const decompress = stub("code-decompress", ["code"], async (dir) => writeFile(join(dir("code"), "arm9.bin"), arm9()));

let box: Sandbox;
beforeEach(async () => {
  box = await sandbox();
});
afterEach(async () => {
  await box.cleanup();
});

async function run(target: Sandbox) {
  return runPipeline({
    workspaceDir: target.workspaceDir,
    romPath: target.romPath,
    registry: createRegistry([unpack, decompress, mapsStage]),
    log: memoryLogger(),
    references: [target.romSha1],
  });
}

const out = (target: Sandbox, ...path: string[]) => join(target.workspaceDir, "stages", "maps", "maps", ...path);
const report = async () => {
  const parsed = parseMapJson("map-report", await readFile(out(box, "report.json"), "utf8"), "report.json");
  if (!parsed.ok) throw new Error(parsed.error.problem);
  return parsed.data;
};

async function files(dir: string): Promise<string[]> {
  return (await readdir(dir, { recursive: true, withFileTypes: true }))
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).replaceAll("\\", "/"))
    .sort();
}

describe("mapsStage", () => {
  it("declares its inputs and output", () => {
    expect(mapsStage).toMatchObject({
      id: "maps",
      version: 9,
      inputs: [{ kind: "stage", stage: "rom-unpack", output: "narc" }, { kind: "stage", stage: "code-decompress", output: "code" }],
      outputs: ["maps"],
    });
  });

  it("writes headers, areas, report and, per map, the mesh and collision that pass their schemas", async () => {
    expect((await run(box)).status).toBe("completed");
    for (const [kind, name] of [["map-headers", "map-headers.json"], ["map-areas", "map-areas.json"]] as const) {
      expect(parseMapJson(kind, await readFile(out(box, name), "utf8"), name).ok).toBe(true);
    }
    const collision = parseMapJson("map-collision", await readFile(out(box, "0000", "collision", "0.json"), "utf8"), "0.json");
    expect(collision.ok && [collision.data.width, collision.data.height]).toEqual([32, 32]);
    const mesh = parseMapJson("map-mesh", await readFile(out(box, "0000", "mesh.json"), "utf8"), "mesh.json");
    if (!mesh.ok) throw new Error(mesh.error.problem);
    expect([mesh.data.width, mesh.data.height, mesh.data.ground[0]!.length]).toEqual([32, 32, 1024]);
    const vertices = mesh.data.groups.reduce((n, g) => n + g.count, 0);
    expect(vertices).toBeGreaterThan(0);
    expect((await readFile(out(box, "0000", "mesh.bin"))).length).toBe(vertices * MESH_VERTEX_FLOATS * 4);
    expect(await files(out(box, "0000"))).toEqual([
      "collision/0.json",
      "mesh.bin",
      "mesh.json",
      ...Array.from({ length: mesh.data.textures }, (_, i) => `textures/${i}.png`),
    ]);
  });

  it("reports every map, isolating failures and listing warnings", async () => {
    await run(box);
    const { records } = await report();
    expect(records).toHaveLength(MAP_HEADER_COUNT);
    expect(records[0]).toEqual({ id: 0, status: "success", warnings: [] });
    expect(records[1]).toMatchObject({ id: 1, status: "failure", stage: "grid" });
    expect(records[1]!.reason).toMatch(/célula/);
    expect(records[2]).toEqual({
      id: 2,
      status: "successWithWarnings",
      warnings: [{ code: "animated-texture", detail: "wind_lm3" }, { code: "unknown-permission", detail: "0x65" }],
    });
    expect(await readdir(out(box))).not.toContain("0001");
  });

  it("gives the triangles of an animated material one frame per step of the cycle, and only them", async () => {
    await run(box);
    const still = parseMapJson("map-mesh", await readFile(out(box, "0000", "mesh.json"), "utf8"), "mesh.json");
    expect(still.ok && still.data.groups.every((g) => g.frames.length === 1)).toBe(true);
    const parsed = parseMapJson("map-mesh", await readFile(out(box, "0002", "mesh.json"), "utf8"), "mesh.json");
    if (!parsed.ok) throw new Error(parsed.error.problem);
    const moving = parsed.data.groups.filter((g) => g.frames.length > 1);
    expect(moving.map((g) => g.frames.length)).toEqual([2]);
    expect(moving[0]!.frames.map((f) => f.translate[0])).toEqual([0, 0.125]);
  });

  it("plays the ground animations of the map's area", async () => {
    await run(box);
    const parsed = parseMapJson("map-mesh", await readFile(out(box, "0003", "mesh.json"), "utf8"), "mesh.json");
    if (!parsed.ok) throw new Error(parsed.error.problem);
    const moving = parsed.data.groups.filter((g) => g.frames.length > 1);
    // Scroll of 4 ticks and swap of 6 on one material: 12 ticks, each at its own speed.
    expect(moving[0]!.frames.map((f) => f.translate[0])).toEqual([0, 0.25, 0, 0.25, 0, 0.25]);
  });

  it("swaps the field textures by name, through the frames of data/fldtanime.narc", async () => {
    await run(box);
    const parsed = parseMapJson("map-mesh", await readFile(out(box, "0003", "mesh.json"), "utf8"), "mesh.json");
    if (!parsed.ok) throw new Error(parsed.error.problem);
    const [a, b] = [...new Set(parsed.data.groups.flatMap((g) => g.frames.map((f) => f.texture)))];
    expect(parsed.data.groups.find((g) => g.frames.length > 1)!.frames.map((f) => f.texture)).toEqual([a, b, b, a, b, b]);
  });

  it("gives byte-identical output for the same input", async () => {
    await run(box);
    const other = await sandbox();
    try {
      await run(other);
      const names = await files(out(box));
      expect(await files(out(other))).toEqual(names);
      for (const name of names) expect(await readFile(out(other, name))).toEqual(await readFile(out(box, name)));
    } finally {
      await other.cleanup();
    }
  });
});
