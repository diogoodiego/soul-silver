import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEventsJson, resolveScript, type MapEventsFile, type ScriptFile } from "@soulsilver/shared/events";
import { parseMapJson } from "@soulsilver/shared/maps";
import type { ScriptData } from "@soulsilver/server";

// Reads the extracted event scripts for the game server (spec 020): files load on first use and stay cached.

/** `stagesDir` is the extraction's `stages` folder; undefined when it has no events. */
export function loadScripts(stagesDir: string, log: (message: string) => void): ScriptData | undefined {
  const eventsDir = join(stagesDir, "events", "events");
  const headersPath = join(stagesDir, "maps", "maps", "map-headers.json");
  if (!existsSync(join(eventsDir, "scripts")) || !existsSync(headersPath)) return undefined;
  const headers = parseMapJson("map-headers", readFileSync(headersPath, "utf8"), headersPath);
  if (!headers.ok) {
    log(`${headers.error.file}: ${headers.error.path}: ${headers.error.problem}`);
    return undefined;
  }
  const refs = new Map(headers.data.records.map((h) => [h.id, h.refs]));
  const files = new Map<number, ScriptFile | undefined>();
  const events = new Map<number, MapEventsFile | undefined>();
  function read<K extends "script-file" | "map-events">(kind: K, path: string) {
    if (!existsSync(path)) return undefined;
    const parsed = parseEventsJson(kind, readFileSync(path, "utf8"), path);
    if (parsed.ok) return parsed.data;
    log(`${parsed.error.file}: ${parsed.error.path}: ${parsed.error.problem}`);
    return undefined;
  }
  const padded = (n: number) => String(n).padStart(4, "0");
  return {
    file(id) {
      if (!files.has(id)) files.set(id, read("script-file", join(eventsDir, "scripts", `${padded(id)}.json`)));
      return files.get(id);
    },
    events(map) {
      if (!events.has(map)) events.set(map, read("map-events", join(eventsDir, "maps", `${padded(map)}.json`)));
      return events.get(map);
    },
    resolve(scriptId, map) {
      const r = refs.get(map);
      return resolveScript(scriptId, { scriptFile: r?.scripts ?? null, messageBank: r?.messages ?? null }) ?? undefined;
    },
  };
}
