// The maps stage: map headers, area matrices and, per map, the 3D mesh and collision by
// level, plus a report of every map. See specs/006-map-prerender/data-model.md.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ANIMATION_STEP_TICKS,
  mapCells,
  MAP_FORMAT_VERSION,
  serializeMapFile,
  type MapAnimation,
  type MapAreasFile,
  type MapReportEntry,
  type MapReportFile,
} from "@soulsilver/shared/maps";
import { CODE_INPUT, countNarcMembers, listNarcIndices, NARC_INPUT, readArm9, readNarcMember } from "../data/inputs.ts";
import type { Stage, StageContext } from "../pipeline/stage.ts";
import { readAnimations, readFieldTextureAnimations } from "./animation.ts";
import { readMatrix } from "./grid.ts";
import { readMapHeaders } from "./header.ts";
import { buildCollision } from "./levels.ts";
import { readNitroBlocks } from "./nitro.ts";
import { buildMapMesh } from "./mesh.ts";
import { readModels } from "./nsbmd.ts";
import { readPiece, type Piece } from "./piece.ts";
import { encodePng } from "./png.ts";
import { buildPropMesh, posePatterns } from "./props.ts";
import { readJointPose } from "./joint-animation.ts";
import { readAscii } from "../binary.ts";
import { AZALEA_GYM } from "../events/layout.ts";
import { buildMapScene, type BuildingSource } from "./scene.ts";
import { readTextureSet, type TextureSet } from "./texture.ts";

const MIB = 1024 * 1024;

/** Models scripts place at run time, with the map whose building archive and area textures they use (spec 024). */
export const SCRIPT_PROPS: readonly { model: number; map: number; poses?: readonly number[] }[] = [
  { model: 0x8d, map: 61 },
  // Spec 030.5: gym02lift, the Azalea Gym's Spinarak cart (SPIDER_MODEL).
  { model: 118, map: 180 },
  // Its ropes and levers, one prop per animation of a/1/0/6 they end in (props/<model>-<pose>): AzaleaGymSwitch
  // plays the first for a clear lever bit, the second for a set one. Matched by name (g2rope_1ani1, g2switch1...).
  { model: 115, map: 180, poses: [25, 26] },
  { model: 116, map: 180, poses: [27, 28] },
  { model: 117, map: 180, poses: [23, 24] },
  { model: 122, map: 180, poses: [41, 42] },
];
/** Buildings left out of a map's mesh because a script shows them as props (spec 030.5). */
const SCRIPT_BUILDINGS = new Map<number, Set<number>>([[AZALEA_GYM.map, new Set(Object.keys(AZALEA_GYM.levers).map(Number))]]);

/** Spec 030.5: a building in the pose an animation ends in: a joint pose (BCA0) or a texture pattern (BTP0). */
function posedSource(model: number, bytes: Uint8Array, anim: Uint8Array): BuildingSource {
  const tex0 = readNitroBlocks(bytes, "BMD0").get("TEX0");
  const joint = readAscii(anim, 0, 4) === "BCA0";
  const read = readModels(bytes, joint ? readJointPose(anim) : undefined);
  const models = joint ? read : posePatterns(read, readAnimations(anim).filter((a) => a.type === "pattern"));
  const entry = tex0 === undefined ? { models } : { models, textures: readTextureSet(bytes, tex0) };
  return (id) => (id === model ? entry : undefined);
}

async function writeMesh(folder: string, mesh: ReturnType<typeof buildMapMesh>): Promise<void> {
  await mkdir(join(folder, "textures"), { recursive: true });
  await writeFile(join(folder, "mesh.json"), serializeMapFile("map-mesh", mesh.file));
  await writeFile(join(folder, "mesh.bin"), new Uint8Array(mesh.vertices.buffer));
  for (const [i, image] of mesh.textures.entries()) await writeFile(join(folder, "textures", `${i}.png`), encodePng(image));
}

/** Archive paths confirmed on the ROM (research.md R0). */
export const MAP_ARCHIVES = {
  areas: "a/0/4/2",
  matrices: "a/0/4/1",
  pieces: "a/0/6/5",
  areaTextures: "a/0/4/4",
  fieldBuildings: "a/0/4/0",
  roomBuildings: "a/1/4/8",
  animations: "a/1/0/6",
  /** Ground texture scroll (sea, river, pond), one file per kind, picked by the area's u16 at 4 (0xffff: none). */
  groundAnimations: "a/1/4/0",
  /** Field texture swaps (sea, flowers): a frame table, then one BTX0 of frames per entry. */
  fieldTextureFrames: "data/fldtanime.narc",
  scripts: "a/0/1/2",
  messages: "a/0/2/7",
  events: "a/0/3/2",
  encounters: "a/0/3/7",
} as const;

/** shortcut: a map whose animations only loop together later is cut here, so those jump at the loop; none seen past it in the ROM's water. */
const MAX_CYCLE_TICKS = 1080;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;

const STAGE_LABELS: Record<NonNullable<MapReportEntry["stage"]>, string> = {
  header: "Header",
  grid: "Matriz",
  pieces: "Pedaços",
  render: "Renderização",
  collision: "Colisão",
};

class MapStepError extends Error {
  readonly step: NonNullable<MapReportEntry["stage"]>;

  constructor(step: NonNullable<MapReportEntry["stage"]>, message: string) {
    super(message);
    this.step = step;
  }
}

async function step<T>(name: MapStepError["step"], work: () => T | Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof MapStepError) throw error;
    throw new MapStepError(name, (error as Error).message);
  }
}

/** Loads each member once, on first use. */
function cached<T>(load: (index: number) => Promise<T>): (index: number) => Promise<T> {
  const cache = new Map<number, Promise<T>>();
  return (index) => {
    let value = cache.get(index);
    if (!value) {
      value = load(index);
      cache.set(index, value);
    }
    return value;
  };
}

async function run(ctx: StageContext): Promise<void> {
  const out = ctx.outputDir("maps");
  const member = (path: string, index: number) => readNarcMember(ctx, path, index);

  const areaCount = await countNarcMembers(ctx, MAP_ARCHIVES.areas);
  const areaBytes = await Promise.all(Array.from({ length: areaCount }, (_, i) => member(MAP_ARCHIVES.areas, i)));
  const matrixCount = await countNarcMembers(ctx, MAP_ARCHIVES.matrices);
  const areas: MapAreasFile = {
    kind: "map-areas",
    formatVersion: MAP_FORMAT_VERSION,
    records: await Promise.all(Array.from({ length: matrixCount }, async (_, i) => readMatrix(await member(MAP_ARCHIVES.matrices, i), i))),
  };
  const headers = readMapHeaders(await readArm9(ctx), areaBytes, {
    areas: areaCount,
    matrices: matrixCount,
    scripts: await countNarcMembers(ctx, MAP_ARCHIVES.scripts),
    messages: await countNarcMembers(ctx, MAP_ARCHIVES.messages),
    events: await countNarcMembers(ctx, MAP_ARCHIVES.events),
    encounters: await countNarcMembers(ctx, MAP_ARCHIVES.encounters),
  });
  await writeFile(join(out, "map-headers.json"), serializeMapFile("map-headers", headers));
  await writeFile(join(out, "map-areas.json"), serializeMapFile("map-areas", areas));

  const animationsByMaterial = new Map<string, MapAnimation[]>();
  for (const index of await listNarcIndices(ctx, MAP_ARCHIVES.animations)) {
    for (const animation of readAnimations(await member(MAP_ARCHIVES.animations, index))) {
      animationsByMaterial.set(animation.material, [...(animationsByMaterial.get(animation.material) ?? []), animation]);
    }
  }
  const animated = new Set(animationsByMaterial.keys());
  const groundAnimations = cached<MapAnimation[]>(async (i) => readAnimations(await member(MAP_ARCHIVES.groundAnimations, i)));
  const fieldFrameSets = await Promise.all(
    (await listNarcIndices(ctx, MAP_ARCHIVES.fieldTextureFrames)).slice(1).map(async (i) => {
      const bytes = await member(MAP_ARCHIVES.fieldTextureFrames, i);
      return readTextureSet(bytes, readNitroBlocks(bytes, "BTX0").get("TEX0")!);
    }),
  );
  const textureAnimations = new Map(
    readFieldTextureAnimations(await member(MAP_ARCHIVES.fieldTextureFrames, 0), fieldFrameSets).map((a) => [a.material, [a]]),
  );
  // Every frame in one set, joined to the area textures when the cycle is drawn.
  const fieldFrames = {
    textures: new Map(fieldFrameSets.flatMap((s) => [...s.textures])),
    palettes: new Map(fieldFrameSets.flatMap((s) => [...s.palettes])),
  };

  const piece = cached<Piece>(async (i) => readPiece(await member(MAP_ARCHIVES.pieces, i)));
  const textureSet = cached<TextureSet>(async (i) => {
    const bytes = await member(MAP_ARCHIVES.areaTextures, i);
    return readTextureSet(bytes, readNitroBlocks(bytes, "BTX0").get("TEX0")!);
  });
  const buildingCounts = {
    [MAP_ARCHIVES.fieldBuildings]: await countNarcMembers(ctx, MAP_ARCHIVES.fieldBuildings),
    [MAP_ARCHIVES.roomBuildings]: await countNarcMembers(ctx, MAP_ARCHIVES.roomBuildings),
  };
  const buildingSets = new Map<string, Map<number, ReturnType<BuildingSource>>>();
  const buildings = async (archive: keyof typeof buildingCounts, ids: number[]): Promise<BuildingSource> => {
    const set = buildingSets.get(archive) ?? new Map<number, ReturnType<BuildingSource>>();
    buildingSets.set(archive, set);
    for (const id of ids) {
      if (set.has(id) || id >= buildingCounts[archive]) continue;
      const bytes = await member(archive, id);
      const tex0 = readNitroBlocks(bytes, "BMD0").get("TEX0");
      set.set(id, tex0 === undefined ? { models: readModels(bytes) } : { models: readModels(bytes), textures: readTextureSet(bytes, tex0) });
    }
    return (id) => set.get(id);
  };

  const records: MapReportEntry[] = [];
  for (const header of headers.records) {
    ctx.signal.throwIfAborted();
    const folder = join(out, String(header.id).padStart(4, "0"));
    try {
      const area = areas.records[header.matrix]!;
      const cells = await step("grid", () => {
        const found = mapCells(area, header.id);
        if (found.length === 0) throw new MapStepError("grid", `o mapa não ocupa nenhuma célula da matriz ${header.matrix}`);
        return found;
      });
      const mapCellsWithPieces = await step("pieces", async () =>
        Promise.all(cells.map(async (c) => ({ x: c.x, z: c.z, piece: await piece(c.piece) }))),
      );
      const { mesh, sceneWarnings } = await step("render", async () => {
        const areaData = areaBytes[header.area]!;
        const archive = header.areaType === "indoor" ? MAP_ARCHIVES.roomBuildings : MAP_ARCHIVES.fieldBuildings;
        const source = await buildings(archive, mapCellsWithPieces.flatMap((c) => c.piece.buildings.map((b) => b.model)));
        const hidden = SCRIPT_BUILDINGS.get(header.id);
        const sceneInput = {
          cells: hidden ? mapCellsWithPieces.map((c) => ({ ...c, piece: { ...c.piece, buildings: c.piece.buildings.filter((b) => !hidden.has(b.model)) } })) : mapCellsWithPieces,
          areaTextures: await textureSet(areaData[2]! | (areaData[3]! << 8)),
          buildings: source,
          animated,
        };
        const scene = buildMapScene(sceneInput);
        const ground = areaData[4]! | (areaData[5]! << 8);
        // Matched by material name across all buildings, so room models' generic names ("lambert10")
        // caught other buildings' scrolls and swaps. shortcut: rooms stay static (PC, TV screens too),
        // map animations to their building through the ROM's list when rooms need them.
        const animations = new Map(header.areaType === "indoor" ? [] : animationsByMaterial);
        if (ground !== 0xffff) {
          for (const a of await groundAnimations(ground)) animations.set(a.material, [...(animations.get(a.material) ?? []), a]);
        }
        const playing = [
          ...[...scene.materials].flatMap((name) => animations.get(name) ?? []),
          ...[...scene.textures].flatMap((name) => textureAnimations.get(name) ?? []),
        ];
        const areaTextures = {
          textures: new Map([...sceneInput.areaTextures.textures, ...fieldFrames.textures]),
          palettes: new Map([...sceneInput.areaTextures.palettes, ...fieldFrames.palettes]),
        };
        // Every animation at its own speed on one clock: the map loops once all of them have.
        const cycle = Math.min(MAX_CYCLE_TICKS, playing.reduce((l, a) => lcm(l, a.duration), 1));
        const ticks = Array.from({ length: Math.ceil(cycle / ANIMATION_STEP_TICKS) }, (_, k) => k * ANIMATION_STEP_TICKS);
        const drawn = playing.length > 0 ? buildMapScene({ ...sceneInput, areaTextures, animations, textureAnimations, ticks }) : scene;
        return { mesh: buildMapMesh(header.id, drawn.input), sceneWarnings: scene.warnings };
      });
      const collision = await step("collision", () => buildCollision(header.id, mapCellsWithPieces, header.areaType !== "cave"));

      await writeMesh(folder, mesh);
      await mkdir(join(folder, "collision"), { recursive: true });
      for (const level of collision.levels) {
        await writeFile(join(folder, "collision", `${level.level}.json`), serializeMapFile("map-collision", level));
      }
      const warnings = [...sceneWarnings, ...collision.warnings];
      records.push({ id: header.id, status: warnings.length > 0 ? "successWithWarnings" : "success", warnings });
    } catch (error) {
      if (!(error instanceof MapStepError)) throw error;
      records.push({ id: header.id, status: "failure", stage: error.step, reason: `${STAGE_LABELS[error.step]}: ${error.message}`, warnings: [] });
      ctx.log.warn(`Map ${header.id} failed at ${error.step}: ${error.message}`, "maps");
    }
    ctx.progress((header.id + 1) / headers.records.length);
  }

  for (const prop of SCRIPT_PROPS) {
    const header = headers.records.find((h) => h.id === prop.map);
    if (!header) continue;
    const areaData = areaBytes[header.area]!;
    const archive = header.areaType === "indoor" ? MAP_ARCHIVES.roomBuildings : MAP_ARCHIVES.fieldBuildings;
    const areaTextures = await textureSet(areaData[2]! | (areaData[3]! << 8));
    const name = String(prop.model).padStart(4, "0");
    const variants = prop.poses && prop.model < buildingCounts[archive]
      ? await Promise.all(prop.poses.map(async (anim, pose) => ({ folder: `${name}-${pose}`, source: posedSource(prop.model, await member(archive, prop.model), await member(MAP_ARCHIVES.animations, anim)) })))
      : [{ folder: name, source: await buildings(archive, [prop.model]) }];
    for (const { folder, source } of variants) {
      const { mesh, warnings } = buildPropMesh(prop.model, source, areaTextures);
      if (warnings.some((w) => w.code === "missing-model")) {
        ctx.log.warn(`Prop ${prop.model} is not in ${archive}`, "maps");
        break;
      }
      await writeMesh(join(out, "props", folder), mesh);
    }
  }

  const report: MapReportFile = { kind: "map-report", formatVersion: MAP_FORMAT_VERSION, records };
  await writeFile(join(out, "report.json"), serializeMapFile("map-report", report));
}

export const mapsStage: Stage = {
  id: "maps",
  title: "Desenhando os mapas",
  // 7: script props (spec 024). 8: weather without the region bit, and the bike, escape rope and fly bits (spec 025).
  // 9: the incoming-calls bit (spec 026). 10: the Azalea Gym's Spinarak cart (spec 030.5). 11: its ropes and levers as posed props.
  // 12: caves keep the top row of tall walls blocked (item 033.2).
  version: 12,
  weight: 20,
  inputs: [NARC_INPUT, CODE_INPUT],
  outputs: ["maps"],
  estimateBytes: () => 600 * MIB,
  run,
};
