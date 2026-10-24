// The maps stage: map headers, area matrices and, per map, pre-rendered layers and collision
// by level, plus a report of every map. See specs/006-map-prerender/data-model.md.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ANIMATION_FRAMES,
  mapCells,
  MAP_FORMAT_VERSION,
  serializeMapFile,
  type MapAnimation,
  type MapAnimationsFile,
  type MapAreasFile,
  type MapReportEntry,
  type MapReportFile,
} from "@soulsilver/shared/maps";
import { CODE_INPUT, countNarcMembers, listNarcIndices, NARC_INPUT, readArm9, readNarcMember } from "../data/inputs.ts";
import type { Stage, StageContext } from "../pipeline/stage.ts";
import { readAnimations } from "./animation.ts";
import { changedRegions } from "./frames.ts";
import { readMatrix } from "./grid.ts";
import { readMapHeaders } from "./header.ts";
import { buildCollision } from "./levels.ts";
import { readNitroBlocks } from "./nitro.ts";
import { readModels } from "./nsbmd.ts";
import { readPiece, type Piece } from "./piece.ts";
import { encodePng } from "./png.ts";
import { renderLayers } from "./render.ts";
import { buildMapScene, type BuildingSource } from "./scene.ts";
import { readTextureSet, type TextureSet } from "./texture.ts";

const MIB = 1024 * 1024;

/** Archive paths confirmed on the ROM (research.md R0). */
export const MAP_ARCHIVES = {
  areas: "a/0/4/2",
  matrices: "a/0/4/1",
  pieces: "a/0/6/5",
  areaTextures: "a/0/4/4",
  fieldBuildings: "a/0/4/0",
  roomBuildings: "a/1/4/8",
  animations: "a/1/0/6",
  scripts: "a/0/1/2",
  messages: "a/0/2/7",
  events: "a/0/3/2",
  encounters: "a/0/3/7",
} as const;

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
      const { layers, sceneWarnings, used, changed } = await step("render", async () => {
        const areaData = areaBytes[header.area]!;
        const archive = header.areaType === "indoor" ? MAP_ARCHIVES.roomBuildings : MAP_ARCHIVES.fieldBuildings;
        const source = await buildings(archive, mapCellsWithPieces.flatMap((c) => c.piece.buildings.map((b) => b.model)));
        const sceneInput = {
          cells: mapCellsWithPieces,
          areaTextures: await textureSet(areaData[2]! | (areaData[3]! << 8)),
          buildings: source,
          animated,
        };
        const scene = buildMapScene(sceneInput);
        const used = [...scene.materials].sort().flatMap((name) => animationsByMaterial.get(name) ?? []);
        // The cycle resampled in ANIMATION_FRAMES frames; only what changes is kept (frames.ts).
        const changed =
          used.length === 0
            ? []
            : changedRegions(
                Array.from({ length: ANIMATION_FRAMES }, (_, k) =>
                  renderLayers(buildMapScene({ ...sceneInput, animations: animationsByMaterial, time: k / ANIMATION_FRAMES }).input),
                ),
              );
        return { layers: renderLayers(scene.input), sceneWarnings: scene.warnings, used, changed };
      });
      const collision = await step("collision", () => buildCollision(header.id, mapCellsWithPieces));

      await mkdir(join(folder, "layers"), { recursive: true });
      await mkdir(join(folder, "collision"), { recursive: true });
      for (const layer of layers) {
        await writeFile(join(folder, "layers", `${layer.level}-lower.png`), encodePng(layer.lower));
        await writeFile(join(folder, "layers", `${layer.level}-upper.png`), encodePng(layer.upper));
      }
      for (const level of collision.levels) {
        await writeFile(join(folder, "collision", `${level.level}.json`), serializeMapFile("map-collision", level));
      }
      if (used.length > 0) {
        for (const { region, crops } of changed) {
          for (const [k, crop] of crops.entries()) {
            await writeFile(join(folder, "layers", `${region.level}-${region.layer}-anim-${k}.png`), encodePng(crop));
          }
        }
        const file: MapAnimationsFile = {
          kind: "map-animations",
          formatVersion: MAP_FORMAT_VERSION,
          map: header.id,
          frames: ANIMATION_FRAMES,
          regions: changed.map((c) => c.region),
          animations: used,
        };
        await writeFile(join(folder, "animations.json"), serializeMapFile("map-animations", file));
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

  const report: MapReportFile = { kind: "map-report", formatVersion: MAP_FORMAT_VERSION, records };
  await writeFile(join(out, "report.json"), serializeMapFile("map-report", report));
}

export const mapsStage: Stage = {
  id: "maps",
  title: "Desenhando os mapas",
  version: 3,
  weight: 20,
  inputs: [NARC_INPUT, CODE_INPUT],
  outputs: ["maps"],
  estimateBytes: () => 600 * MIB,
  run,
};
