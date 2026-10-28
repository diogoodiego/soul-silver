// A map with scripted events for the session tests (spec 020). Synthetic: no ROM data (principle II).
import { BUTTON, type CollisionMap, type ServerMessage } from "@soulsilver/shared/game";
import type { MapEventsFile, ScriptCommand, ScriptFile } from "@soulsilver/shared/events";
import type { ScriptData } from "../src/scripts";
import { flatWorld, setup } from "./harness";

type Line = string | [string, Record<string, unknown>?] | ScriptCommand;

/** Code in order; "Ln:" labels the next command; entries are L1, L2... in order. */
export function scriptFile(file: number, lines: Line[], movements: ScriptFile["movements"] = {}): ScriptFile {
  const code: ScriptCommand[] = [];
  const labels: Record<string, number> = {};
  for (const line of lines) {
    if (typeof line === "string") labels[line.replace(/:$/, "")] = code.length;
    else if (Array.isArray(line)) code.push({ name: line[0], args: (line[1] ?? {}) as Record<string, never> });
    else code.push(line);
  }
  const entries = Object.keys(labels).filter((l) => /^L\d+$/.test(l)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  return { kind: "script-file", formatVersion: 1, file, messageBank: 7, entries, code, labels, movements, unreachableBytes: 0, partial: false };
}

const ref = (entry: number) => ({ id: entry + 1, file: 100, entry });
export const npc = (id: number, x: number, z: number, entry: number | null, hideFlag = 0): MapEventsFile["npcs"][number] => ({
  id,
  sprite: 3,
  movement: 0,
  type: 0,
  hideFlag,
  script: entry === null ? null : ref(entry),
  facing: 0,
  param: [0, 0, 0],
  xRange: 0,
  yRange: 0,
  x,
  z,
  y: 0,
  trainer: null,
});

export function mapEvents(over: Partial<MapEventsFile> = {}): MapEventsFile {
  return { kind: "map-events", formatVersion: 1, map: 60, npcs: [], warps: [], triggers: [], signs: [], levelScripts: { onTransition: null, onResume: null, onLoad: null, frames: [] }, ...over };
}

export function scriptData(files: ScriptFile[], events: Record<number, MapEventsFile>, std: Record<number, { file: number; entry: number }> = {}): ScriptData {
  const byId = new Map(files.map((f) => [f.file, f]));
  return {
    file: (id) => byId.get(id),
    events: (map) => events[map],
    resolve: (id) => std[id],
  };
}

const grid: CollisionMap = { width: 16, height: 16, tiles: Array.from({ length: 256 }, () => ({ category: "free" as const, raw: 0 })) };
export const world = flatWorld(grid);

/** Feet position of a tile's center. */
export const at = (t: number) => t * 16 + 8;

export function story(data: ScriptData, extra: Parameters<typeof setup>[0] = {}) {
  const s = setup({ world, scripts: data, spawn: () => ({ area: "60", x: at(1), y: at(1) }), ...extra });
  let seq = 0;
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) s.session.step();
  };
  /** Presses interact (and releases it the next tick). */
  const press = (c: ReturnType<typeof s.connect>) => {
    c.conn.send({ type: "input", seq: ++seq, move: { x: 0, y: 0 }, run: false, buttons: BUTTON.interact });
    step();
    c.conn.send({ type: "input", seq: ++seq, move: { x: 0, y: 0 }, run: false, buttons: 0 });
    step();
  };
  const walk = (c: ReturnType<typeof s.connect>, dir: { x: number; y: number }, ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      c.conn.send({ type: "input", seq: ++seq, move: dir, run: false, buttons: 0 });
      step();
    }
  };
  const of = <T extends ServerMessage["type"]>(c: ReturnType<typeof s.connect>, type: T) => c.got.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);
  return { ...s, step, press, walk, of };
}
