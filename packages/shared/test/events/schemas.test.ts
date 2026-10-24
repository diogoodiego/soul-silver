import { describe, expect, it } from "vitest";
import { parseEventsJson, serializeEventsFile } from "../../src/events/schemas.ts";

const ref = { id: 3001, file: 7, entry: 2 };

const mapEvents = (extra: Record<string, unknown> = {}) => ({
  kind: "map-events",
  formatVersion: 1,
  map: 4,
  npcs: [
    { id: 1, sprite: 5, movement: 2, type: 0, hideFlag: 0, script: ref, facing: 1, param: [0, 0, 0], xRange: 0, yRange: 0, x: 3, z: 4, y: 0, trainer: null },
  ],
  warps: [{ x: 1, z: 2, destMap: 9, destAnchor: 0, y: 0 }],
  triggers: [{ script: ref, x: 5, z: 6, w: 1, h: 2, y: 0, variable: 0x4000, value: 1 }],
  signs: [{ script: ref, kind: 1, x: 7, z: 8, y: 0, dir: 0 }],
  levelScripts: { onTransition: null, onResume: null, onLoad: ref, frames: [{ variable: 0x4001, value: 2, script: ref }] },
  ...extra,
});

const scriptFile = (extra: Record<string, unknown> = {}) => ({
  kind: "script-file",
  formatVersion: 1,
  file: 7,
  messageBank: 12,
  entries: ["L1"],
  code: [
    { name: "LockAll", args: {} },
    { name: "NPCMsg", args: { msg_id: { text: "0012:3" } } },
    { name: "ApplyMovement", args: { arg0: 255, movement: { movement: "M1" } } },
    { name: "GoToIf", args: { condition: 1, dest: { label: "L1" } } },
    { raw: true, id: 9999 },
    { name: "End", args: {} },
  ],
  labels: { L1: 0 },
  movements: { M1: [{ action: "StepUp", count: 2 }] },
  unreachableBytes: 0,
  partial: true,
  ...extra,
});

const slot = (extra: Record<string, unknown> = {}) => ({ species: 16, form: 0, minLevel: 2, maxLevel: 4, chance: 20, ...extra });
const encounter = (extra: Record<string, unknown> = {}) => ({
  id: 0,
  rates: { walking: 10, surfing: 0, rockSmash: 0, oldRod: 0, goodRod: 0, superRod: 0 },
  grass: { morning: [slot()], day: [slot()], night: [slot()] },
  ...extra,
});
const encounters = (records: unknown[] = [encounter()]) => ({ kind: "encounters", formatVersion: 1, records });

const headbutt = (records: unknown[] = [{ id: 3, common: [slot()], rare: [slot()], secret: [slot()], regularTrees: [[[4, 5]]], secretTrees: [] }]) => ({ kind: "headbutt", formatVersion: 1, records });

const member = (extra: Record<string, unknown> = {}) => ({
  difficulty: 10,
  genderOverride: 0,
  abilityOverride: 0,
  level: 5,
  species: 16,
  form: 0,
  item: null,
  moves: null,
  capsule: 0,
  ...extra,
});
const trainer = (extra: Record<string, unknown> = {}) => ({
  id: 1,
  class: { id: 2, text: "0730:2" },
  name: "0729:1",
  items: [],
  aiFlags: 0,
  doubleBattle: false,
  team: [member()],
  ...extra,
});
const trainers = (records: unknown[] = [trainer()]) => ({ kind: "trainers", formatVersion: 1, records });

const commandTable = (extra: Record<string, unknown> = {}) => ({
  kind: "script-commands",
  formatVersion: 1,
  commands: [{ id: 2, name: "End", args: [] }, { id: 28, name: "GoToIf", args: [{ name: "condition", type: "number", size: 1 }, { name: "dest", type: "jump", size: 4 }] }],
  movements: [{ id: 0, name: "FaceNorth" }],
  ...extra,
});

const report = (extra: Record<string, unknown> = {}) => ({
  kind: "events-report",
  formatVersion: 1,
  ok: true,
  counts: { maps: 1, npcs: 1, warps: 1, triggers: 1, signs: 1, scriptFiles: 1, scripts: 1, commands: 6, encounterBanks: 1, trainers: 1 },
  commands: [{ name: "End", count: 1, maps: [4], globalFiles: [] }],
  unknownCommands: [{ name: "raw:9999", count: 1, maps: [4], globalFiles: [] }],
  undecodedScripts: [{ file: 7, reason: "unknown command 9999" }],
  unresolved: [],
  unreachableBytes: 0,
  decodedPercent: 100,
  ...extra,
});

const parse = (kind: Parameters<typeof parseEventsJson>[0], value: unknown) => parseEventsJson(kind, JSON.stringify(value), `${kind}.json`);

describe("events schemas", () => {
  it.each([
    ["map-events", mapEvents()],
    ["script-file", scriptFile()],
    ["encounters", encounters()],
    ["headbutt", headbutt()],
    ["trainers", trainers()],
    ["script-commands", commandTable()],
    ["events-report", report()],
  ] as const)("accepts a valid %s file", (kind, value) => {
    const result = parse(kind, value);
    expect(result.ok).toBe(true);
  });

  it("round-trips through serialize with a trailing newline", () => {
    const text = serializeEventsFile("encounters", encounters() as never);
    expect(text.endsWith("\n")).toBe(true);
    expect(parseEventsJson("encounters", text, "e.json").ok).toBe(true);
  });

  it.each([
    ["missing formatVersion", "script-file", Object.fromEntries(Object.entries(scriptFile()).filter(([key]) => key !== "formatVersion")), "formatVersion"],
    ["jump to a missing label", "script-file", scriptFile({ code: [{ name: "GoToIf", args: { condition: 1, dest: { label: "L9" } } }] }), "code.0.args.dest"],
    ["movement to a missing sequence", "script-file", scriptFile({ movements: {} }), "code.2.args.movement"],
    ["label past the end of the code", "script-file", scriptFile({ labels: { L1: 99 } }), "labels.L1"],
    ["entry without a label", "script-file", scriptFile({ entries: ["L7"] }), "entries.0"],
    ["command with neither name nor raw id", "script-file", scriptFile({ code: [{ raw: true }] }), "code.0.name"],
    ["minLevel above maxLevel", "encounters", encounters([encounter({ grass: { morning: [slot({ minLevel: 9, maxLevel: 3 })], day: [slot()], night: [slot()] } })]), "records.0.grass.morning.0"],
    ["headbutt tree outside the s16 range", "headbutt", headbutt([{ id: 3, common: [], rare: [], secret: [], regularTrees: [[[70000, 1]]], secretTrees: [] }]), "records.0.regularTrees.0.0.0"],
    ["encounter ids out of order", "encounters", encounters([encounter({ id: 3 }), encounter({ id: 3 })]), "records.1.id"],
    ["team level above 100", "trainers", trainers([trainer({ team: [member({ level: 101 })] })]), "records.0.team.0.level"],
    ["team level below 1", "trainers", trainers([trainer({ team: [member({ level: 0 })] })]), "records.0.team.0.level"],
    ["repeated command id", "script-commands", commandTable({ commands: [{ id: 2, name: "End", args: [] }, { id: 2, name: "Nop", args: [] }] }), "commands.1.id"],
    ["unknown argument type", "script-commands", commandTable({ commands: [{ id: 2, name: "End", args: [{ name: "x", type: "u64", size: 1 }] }] }), "commands.0.args.0.type"],
    ["unknown field", "map-events", mapEvents({ extra: 1 }), "extra"],
  ] as const)("reports file, field path and problem: %s", (_name, kind, value, path) => {
    const result = parse(kind, value);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.file).toBe(`${kind}.json`);
      expect(result.error.path).toBe(path);
      expect(result.error.problem.length).toBeGreaterThan(0);
    }
  });
});
