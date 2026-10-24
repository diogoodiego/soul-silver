import { parseEventsFile } from "@soulsilver/shared/events";
import { buildWorldMap, type WorldLookup, type WorldMap } from "@soulsilver/shared/game";
import { MESH_VERTEX_FLOATS, parseMapFile, type MapArea, type MapFileKind, type MapHeader, type MapMeshFile } from "@soulsilver/shared/maps";

// The extraction as the renderer sees it, through the read-only assets:// protocol (spec 011, T010).
// Mirrors packages/server/src/world-loader.ts so prediction simulates the same maps and warps.
// Maps load asynchronously: until a warp's destination is loaded, prediction does not start that warp.

const STAGES = "assets://stages";
/** Collision levels are probed in order, since the renderer cannot list folders. */
const MAX_LEVELS = 4;

const padded = (id: number | string) => String(id).padStart(4, "0");
const mapDir = (mapId: number | string) => `${STAGES}/maps/maps/${padded(mapId)}`;

async function fetchJson(url: string): Promise<unknown> {
  try {
    const response = await fetch(url);
    return response.ok ? await response.json() : undefined;
  } catch {
    return undefined;
  }
}

async function fetchMap<K extends MapFileKind>(kind: K, url: string) {
  const json = await fetchJson(url);
  if (json === undefined) return undefined;
  const parsed = parseMapFile(kind, json, url);
  if (!parsed.ok) throw new Error(`${parsed.error.file}: ${parsed.error.path}: ${parsed.error.problem}`);
  return parsed.data;
}

async function fetchWarps(map: number) {
  const url = `${STAGES}/events/events/maps/${padded(map)}.json`;
  const json = await fetchJson(url);
  if (json === undefined) return undefined;
  const parsed = parseEventsFile("map-events", json, url);
  if (!parsed.ok) throw new Error(`${parsed.error.file}: ${parsed.error.path}: ${parsed.error.problem}`);
  return parsed.data.warps;
}

export const spriteUrl = (file: string) => `${STAGES}/sprites/sprites/${file}`;

export async function loadBitmap(url: string): Promise<ImageBitmap | undefined> {
  try {
    const response = await fetch(url);
    // Texels as stored: no premultiplied alpha or color conversion, so the pixels stay the ROM's.
    return response.ok ? await createImageBitmap(await response.blob(), { premultiplyAlpha: "none", colorSpaceConversion: "none" }) : undefined;
  } catch {
    return undefined;
  }
}

export interface MapMesh {
  file: MapMeshFile;
  /** MESH_VERTEX_FLOATS per vertex. */
  vertices: Float32Array;
  /** By index; undefined where an image did not load. */
  textures: (ImageBitmap | undefined)[];
}

/** The map's 3D scene (shared/maps/mesh.ts), or undefined when it was not extracted. */
export async function loadMapMesh(mapId: string): Promise<MapMesh | undefined> {
  const file = await fetchMap("map-mesh", `${mapDir(mapId)}/mesh.json`);
  if (!file) return undefined;
  const response = await fetch(`${mapDir(mapId)}/mesh.bin`);
  if (!response.ok) throw new Error(`mesh.bin: ${response.status}`);
  const vertices = new Float32Array(await response.arrayBuffer());
  const needed = file.groups.reduce((most, g) => Math.max(most, g.first + g.count), 0) * MESH_VERTEX_FLOATS;
  if (vertices.length < needed) throw new Error(`mesh.bin: ${vertices.length} floats, the groups need ${needed}`);
  const textures = await Promise.all(Array.from({ length: file.textures }, (_, i) => loadBitmap(`${mapDir(mapId)}/textures/${i}.png`)));
  return { file, vertices, textures };
}

export function createClientWorld(log: (message: string) => void) {
  const maps = new Map<string, WorldMap | undefined>();
  const loading = new Map<string, Promise<WorldMap | undefined>>();
  const index = (async () => {
    const headers = await fetchMap("map-headers", `${STAGES}/maps/maps/map-headers.json`);
    const areas = await fetchMap("map-areas", `${STAGES}/maps/maps/map-areas.json`);
    if (!headers || !areas) log("No extracted maps; the world is open ground");
    return {
      headers: new Map<number, MapHeader>(headers?.records.map((h) => [h.id, h]) ?? []),
      areas: new Map<number, MapArea>(areas?.records.map((a) => [a.id, a]) ?? []),
    };
  })();

  async function load(mapId: string): Promise<WorldMap | undefined> {
    const id = Number(mapId);
    const { headers, areas } = await index;
    const header = headers.get(id);
    const area = header && areas.get(header.matrix);
    if (!area) return undefined;
    const levels: WorldMap["levels"] = [];
    for (let level = 0; level < MAX_LEVELS; level++) {
      const grid = await fetchMap("map-collision", `${mapDir(id)}/collision/${level}.json`);
      if (!grid) break;
      // The schema guarantees the cell shape; zod types optional fields as "| undefined".
      levels[level] = grid as WorldMap["levels"][number];
    }
    if (!levels[0]) return undefined;
    return buildWorldMap(area, id, levels, (await fetchWarps(id)) ?? []);
  }

  return {
    /** Only maps already loaded; prediction treats the rest as open ground until they arrive. */
    lookup: ((mapId) => maps.get(mapId)) as WorldLookup,
    ensure(mapId: string): Promise<WorldMap | undefined> {
      if (!loading.has(mapId)) {
        loading.set(
          mapId,
          load(mapId).then(
            (map) => {
              maps.set(mapId, map);
              return map;
            },
            (error: unknown) => {
              log(`Map ${mapId} could not be loaded: ${(error as Error).message}`);
              maps.set(mapId, undefined);
              return undefined;
            },
          ),
        );
      }
      return loading.get(mapId)!;
    },
  };
}

export type ClientWorld = ReturnType<typeof createClientWorld>;
