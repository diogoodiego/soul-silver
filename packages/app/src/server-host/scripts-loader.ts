import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEventsJson, resolveScript, type MapEventsFile, type ScriptFile } from "@soulsilver/shared/events";
import { parseMapJson } from "@soulsilver/shared/maps";
import { parseTextJson } from "@soulsilver/shared/text";
import type { ScriptData } from "@soulsilver/server";

// Reads the extracted event scripts for the game server (spec 020): files load on first use and stay cached.

/** FIRST_DEFAULT_NAME_RIVAL in SoulSilver (naming_screen.c), the only version the extractor takes. */
const DEFAULT_RIVAL_TEXT = { bank: 254, id: 85 };

function readDefaultRival(stagesDir: string, log: (message: string) => void): string | undefined {
  const path = join(stagesDir, "text-catalog", "catalog", "en", `${String(DEFAULT_RIVAL_TEXT.bank).padStart(4, "0")}.json`);
  if (!existsSync(path)) return undefined;
  const parsed = parseTextJson("text-bank", readFileSync(path, "utf8"), path);
  if (parsed.ok) return parsed.data.records.find((r) => r.id === DEFAULT_RIVAL_TEXT.id)?.text;
  log(`${parsed.error.file}: ${parsed.error.path}: ${parsed.error.problem}`);
  return undefined;
}

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
  function read<K extends "script-file" | "map-events" | "new-game" | "std-messages" | "fly-points" | "headbutt">(kind: K, path: string) {
    if (!existsSync(path)) return undefined;
    const parsed = parseEventsJson(kind, readFileSync(path, "utf8"), path);
    if (parsed.ok) return parsed.data;
    log(`${parsed.error.file}: ${parsed.error.path}: ${parsed.error.problem}`);
    return undefined;
  }
  const padded = (n: number) => String(n).padStart(4, "0");
  // Spec 024: read once; an extraction from before it has neither file.
  const newGame = read("new-game", join(eventsDir, "new-game.json"));
  const std = read("std-messages", join(eventsDir, "std-messages.json"));
  // Spec 025: Fly destinations; an extraction from before it has no file.
  const fly = read("fly-points", join(eventsDir, "fly-points.json"));
  // Headbutt tables and trees, by map id (spec 015's extraction; read by spec 025).
  const headbutt = new Map(read("headbutt", join(eventsDir, "headbutt.json"))?.records.map((r) => [r.id, r]));
  return {
    newGame: newGame && { map: newGame.map, tx: newGame.tx, ty: newGame.ty, facing: newGame.facing, initScript: newGame.initScript },
    stdMessageBanks: std?.banks,
    flyPoints: fly?.points,
    headbutt: (map) => headbutt.get(map),
    defaultRival: readDefaultRival(stagesDir, log),
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
