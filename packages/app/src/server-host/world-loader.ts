import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEventsJson } from "@soulsilver/shared/events";
import { buildWorldMap, DYNAMIC_WARP_MAP, type WorldLookup, type WorldMap } from "@soulsilver/shared/game";
import { parseMapJson, type MapArea, type MapFileKind, type MapHeader } from "@soulsilver/shared/maps";

// Reads the world from an extraction (features 006 and 008). Maps load on first use and stay
// cached; the first use of a map reads a few small files synchronously, inside a tick.

const padded = (id: number | string) => String(id).padStart(4, "0");

function readMap<K extends MapFileKind>(kind: K, path: string) {
  const parsed = parseMapJson(kind, readFileSync(path, "utf8"), path);
  if (!parsed.ok) throw new Error(`${parsed.error.file}: ${parsed.error.path}: ${parsed.error.problem}`);
  return parsed.data;
}

/** `stagesDir` is the extraction's `stages` folder. */
export function loadWorld(stagesDir: string, log: (message: string) => void): WorldLookup {
  const mapsDir = join(stagesDir, "maps", "maps");
  const eventsDir = join(stagesDir, "events", "events", "maps");
  let headers: Map<number, MapHeader>;
  let areas: Map<number, MapArea>;
  try {
    headers = new Map(readMap("map-headers", join(mapsDir, "map-headers.json")).records.map((h) => [h.id, h]));
    areas = new Map(readMap("map-areas", join(mapsDir, "map-areas.json")).records.map((a) => [a.id, a]));
  } catch (error) {
    log(`No usable extracted maps in ${mapsDir} (${(error as Error).message}); the world is open ground`);
    return () => undefined;
  }
  const cache = new Map<string, WorldMap | undefined>();
  const warpCounts = new Map<number, number | undefined>();

  function warpsOf(map: number) {
    const path = join(eventsDir, `${padded(map)}.json`);
    if (!existsSync(path)) return undefined;
    const parsed = parseEventsJson("map-events", readFileSync(path, "utf8"), path);
    if (!parsed.ok) throw new Error(`${parsed.error.file}: ${parsed.error.path}: ${parsed.error.problem}`);
    return parsed.data.warps;
  }

  function warpCount(map: number): number | undefined {
    if (!warpCounts.has(map)) warpCounts.set(map, headers.has(map) ? warpsOf(map)?.length : undefined);
    return warpCounts.get(map);
  }

  function load(mapId: string): WorldMap | undefined {
    const id = Number(mapId);
    const header = headers.get(id);
    const area = header && areas.get(header.matrix);
    const collisionDir = join(mapsDir, padded(id), "collision");
    if (!area || !existsSync(collisionDir)) return undefined;
    const levels: WorldMap["levels"] = [];
    for (const f of readdirSync(collisionDir).filter((f) => f.endsWith(".json"))) {
      const grid = readMap("map-collision", join(collisionDir, f));
      // The schema guarantees the cell shape; zod types optional fields as "| undefined".
      levels[grid.level] = grid as WorldMap["levels"][number];
    }
    if (!levels[0]) return undefined;
    // Every warp is kept: destAnchor indexes this list. Movement skips warps that lead nowhere.
    const warps = warpsOf(id) ?? [];
    warps.forEach((w, i) => {
      // Map 4095 is the player's dynamic warp (elevator doors), resolved while walking.
      if (String(w.destMap) === DYNAMIC_WARP_MAP) return;
      const count = warpCount(w.destMap);
      if (count === undefined || w.destAnchor >= count) log(`Map ${id}: warp ${i} to map ${w.destMap} anchor ${w.destAnchor} has no destination; ignored`);
    });
    return { ...buildWorldMap(area, id, levels, warps), areaType: header.areaType, weather: header.weather, bikeAllowed: header.bikeAllowed, flyAllowed: header.flyAllowed, incomingCalls: header.incomingCalls, escapeRopeAllowed: header.escapeRopeAllowed, mapsec: header.mapsec, encounters: header.refs.encounters ?? undefined };
  }

  return (mapId) => {
    if (!cache.has(mapId)) {
      try {
        cache.set(mapId, load(mapId));
      } catch (error) {
        // A broken map must not stop the tick loop; it stays missing until the next extraction.
        log(`Map ${mapId} could not be loaded: ${(error as Error).message}`);
        cache.set(mapId, undefined);
      }
    }
    return cache.get(mapId);
  };
}
