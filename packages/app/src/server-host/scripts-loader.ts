import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEventsJson, resolveScript, type MapEventsFile, type NpcTradesFile, type ScriptFile } from "@soulsilver/shared/events";
import { parseMapJson } from "@soulsilver/shared/maps";
import { parsePhoneFile, type PhoneBook } from "@soulsilver/shared/phone";
import { parseTextId, parseTextJson } from "@soulsilver/shared/text";
import type { NpcTrade, ScriptData } from "@soulsilver/server";

// Reads the extracted event scripts for the game server (spec 020): files load on first use and stay cached.

/** FIRST_DEFAULT_NAME_RIVAL in SoulSilver (naming_screen.c), the only version the extractor takes. */
const DEFAULT_RIVAL_TEXT = { bank: 254, id: 85 };

/** A text bank of the catalog by record id; undefined when the extraction lacks it. */
function readBank(stagesDir: string, bank: number, log: (message: string) => void): Map<number, string> | undefined {
  const path = join(stagesDir, "text-catalog", "catalog", "en", `${String(bank).padStart(4, "0")}.json`);
  if (!existsSync(path)) return undefined;
  const parsed = parseTextJson("text-bank", readFileSync(path, "utf8"), path);
  if (parsed.ok) return new Map(parsed.data.records.map((r) => [r.id, r.text]));
  log(`${parsed.error.file}: ${parsed.error.path}: ${parsed.error.problem}`);
  return undefined;
}

/** Item 030.10: the in-game trades, their nicknames read from the game's text; undefined in older extractions. */
function readNpcTrades(file: NpcTradesFile | undefined, stagesDir: string, log: (message: string) => void): Map<number, NpcTrade> | undefined {
  if (!file) return undefined;
  const banks = new Map<number, Map<number, string> | undefined>();
  const text = (id: string) => {
    const { bank, index } = parseTextId(id);
    if (!banks.has(bank)) banks.set(bank, readBank(stagesDir, bank, log));
    return banks.get(bank)?.get(index) ?? "";
  };
  return new Map(file.records.map(({ nickname, ot: _ot, ...t }) => [t.id, { ...t, nickname: text(nickname) }]));
}

/** The phone book (spec 026); an extraction from before it has no file, and an invalid one is logged and left out. */
function readPhone(path: string, log: (message: string) => void): PhoneBook | undefined {
  if (!existsSync(path)) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    log(`${path}: ${(error as Error).message}`);
    return undefined;
  }
  const parsed = parsePhoneFile("phone", raw, path);
  if (parsed.ok) return parsed.data.value;
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
  function read<K extends "script-file" | "map-events" | "new-game" | "std-messages" | "fly-points" | "headbutt" | "rock-smash" | "field-items" | "azalea-gym" | "npc-trades">(kind: K, path: string) {
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
  // Rock Smash item odds by map (spec 025); an extraction from before it has no file.
  const rockSmash = new Map(read("rock-smash", join(eventsDir, "rock-smash.json"))?.records.map((r) => [r.id, r]));
  // Spec 027: hidden items, apricorn trees and berry growth; an extraction from before it has no file.
  const fieldItems = read("field-items", join(eventsDir, "field-items.json"));
  // Spec 030.5: the Azalea Gym's threads; an extraction from before it has no file.
  const azaleaGym = read("azalea-gym", join(eventsDir, "azalea-gym.json"));
  return {
    azaleaGym: azaleaGym && { stations: azaleaGym.stations, routes: azaleaGym.routes, spiders: azaleaGym.spiders, levers: azaleaGym.levers },
    fieldItems: fieldItems && { hidden: fieldItems.hidden, apricornTrees: fieldItems.apricornTrees, berries: fieldItems.berries },
    phone: readPhone(join(eventsDir, "phone.json"), log),
    newGame: newGame && { map: newGame.map, tx: newGame.tx, ty: newGame.ty, facing: newGame.facing, initScript: newGame.initScript },
    stdMessageBanks: std?.banks,
    flyPoints: fly?.points,
    headbutt: (map) => headbutt.get(map),
    rockSmash: (map) => rockSmash.get(map),
    defaultRival: readBank(stagesDir, DEFAULT_RIVAL_TEXT.bank, log)?.get(DEFAULT_RIVAL_TEXT.id),
    npcTrades: readNpcTrades(read("npc-trades", join(eventsDir, "npc-trades.json")), stagesDir, log),
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
