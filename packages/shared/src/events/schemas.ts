// Event files: map-events, script-file, encounters, trainers, script-commands and events-report.
// See specs/008-events-scripts-encounters/data-model.md. Same envelope and codec as the game data (feature 004).
import { z } from "zod";
import { fileSchema, GAME_DATA_FORMAT_VERSION, id, int } from "../game-data/common.ts";
import { createGameDataCodec } from "../game-data/parse.ts";

/** Version of the event file format; bumped when an event schema changes. */
export const EVENTS_FORMAT_VERSION = GAME_DATA_FORMAT_VERSION;

const u16 = () => int(0, 0xffff);
const s16 = () => int(-0x8000, 0x7fff);
const s32 = () => int(-0x80000000, 0x7fffffff);

/** A script as the game addresses it, plus where it lives once resolved (research.md R3). */
const scriptRef = z.strictObject({ id: u16(), file: id(), entry: id() });

const npc = z.strictObject({
  id: u16(),
  sprite: u16(),
  movement: u16(),
  type: u16(),
  /** The object is hidden while this flag is set; 0 means always visible. */
  hideFlag: u16(),
  script: scriptRef.nullable(),
  facing: s16(),
  param: z.tuple([u16(), u16(), u16()]),
  xRange: s16(),
  yRange: s16(),
  x: u16(),
  z: u16(),
  y: s32(),
  /** Trainer id when the script id is a trainer script (3000 to 6999). */
  trainer: id().nullable(),
});

const warp = z.strictObject({ x: u16(), z: u16(), destMap: u16(), destAnchor: u16(), y: int(0, 0xffffffff) });

const trigger = z.strictObject({
  script: scriptRef.nullable(),
  x: s16(),
  z: s16(),
  w: u16(),
  h: u16(),
  y: u16(),
  /** The trigger fires when this variable holds `value`. */
  variable: u16(),
  value: u16(),
});

const sign = z.strictObject({ script: scriptRef.nullable(), kind: u16(), x: s32(), z: s32(), y: s32(), dir: u16() });

const levelScripts = z.strictObject({
  onTransition: scriptRef.nullable(),
  onResume: scriptRef.nullable(),
  onLoad: scriptRef.nullable(),
  /** Frame table: runs `script` when the value of `variable` equals `value` (a constant or a variable). */
  frames: z.array(z.strictObject({ variable: u16(), value: u16(), script: scriptRef })),
});

export const mapEventsFile = z.strictObject({
  kind: z.literal("map-events"),
  formatVersion: z.literal(EVENTS_FORMAT_VERSION),
  map: id(),
  npcs: z.array(npc),
  warps: z.array(warp),
  triggers: z.array(trigger),
  signs: z.array(sign),
  levelScripts,
});
export type MapEventsFile = z.infer<typeof mapEventsFile>;
export type ScriptRef = z.infer<typeof scriptRef>;

const value = z.union([
  int(0, 0xffffffff),
  z.strictObject({ text: z.string() }),
  z.strictObject({ species: id() }),
  z.strictObject({ move: id() }),
  z.strictObject({ item: id() }),
  z.strictObject({ trainer: id() }),
  z.strictObject({ flag: id() }),
  z.strictObject({ variable: id() }),
  z.strictObject({ label: z.string() }),
  z.strictObject({ movement: z.string() }),
]);

/** A command the table does not know is kept as `raw`, with its id (FR-007). */
const command = z.union([
  z.strictObject({ name: z.string().min(1), args: z.record(z.string(), value) }),
  z.strictObject({ raw: z.literal(true), id: u16() }),
]);
export type ScriptCommand = z.infer<typeof command>;

export const scriptFile = z
  .strictObject({
    kind: z.literal("script-file"),
    formatVersion: z.literal(EVENTS_FORMAT_VERSION),
    file: id(),
    /** Message bank (feature 005) the file's text arguments belong to; null when no map or table uses the file. */
    messageBank: id().nullable(),
    /** Label of each script of the file, in table order. */
    entries: z.array(z.string()),
    code: z.array(command),
    labels: z.record(z.string(), id()),
    movements: z.record(z.string(), z.array(z.strictObject({ action: z.string(), count: u16() }))),
    /** Bytes no entry reaches (dead code and alignment padding); not decoded. */
    unreachableBytes: id(),
    /** True when decoding stopped at a command the table does not know. */
    partial: z.boolean(),
  })
  .superRefine((file, ctx) => {
    file.entries.forEach((label, i) => {
      if (!(label in file.labels)) ctx.addIssue({ code: "custom", path: ["entries", i], message: `rótulo "${label}" não existe em labels` });
    });
    for (const [label, index] of Object.entries(file.labels)) {
      if (index >= file.code.length) ctx.addIssue({ code: "custom", path: ["labels", label], message: `posição ${index} fora do código (${file.code.length} comandos)` });
    }
    file.code.forEach((cmd, i) => {
      if (!("args" in cmd)) return;
      for (const [name, arg] of Object.entries(cmd.args)) {
        if (typeof arg !== "object") continue;
        const target = "label" in arg ? [arg.label, file.labels] : "movement" in arg ? [arg.movement, file.movements] : undefined;
        if (target && !(target[0] as string in (target[1] as object))) {
          ctx.addIssue({ code: "custom", path: ["code", i, "args", name], message: `destino "${target[0] as string}" não existe` });
        }
      }
    });
  });
export type ScriptFile = z.infer<typeof scriptFile>;

const encounterSlot = z
  .strictObject({
    species: int(0, 0x3ff),
    form: int(0, 63),
    minLevel: int(0, 100),
    maxLevel: int(0, 100),
    /** Percentage of the table this slot takes, in the game's fixed order. */
    chance: int(1, 100),
  })
  .superRefine((slot, ctx) => {
    if (slot.minLevel > slot.maxLevel) ctx.addIssue({ code: "custom", message: "minLevel não pode passar de maxLevel" });
  });
const slots = () => z.array(encounterSlot);

const encounter = z.strictObject({
  id: id(),
  /** Encounter rate of each way to meet wild Pokémon, as stored. */
  rates: z.strictObject({
    walking: int(0, 255),
    surfing: int(0, 255),
    rockSmash: int(0, 255),
    oldRod: int(0, 255),
    goodRod: int(0, 255),
    superRod: int(0, 255),
  }),
  /** A kind with no Pokémon is absent, never an empty table. */
  grass: z.strictObject({ morning: slots(), day: slots(), night: slots() }).optional(),
  surf: slots().optional(),
  rockSmash: slots().optional(),
  oldRod: slots().optional(),
  goodRod: slots().optional(),
  superRod: slots().optional(),
  /** Radio programs (Hoenn and Sinnoh sounds) swap these species into the grass table. */
  sounds: z.strictObject({ hoenn: z.array(u16()), sinnoh: z.array(u16()) }).optional(),
  /** Species an outbreak puts in the grass, surf and fishing tables. */
  swarm: z.strictObject({ grass: u16(), surf: u16(), fish: u16() }).optional(),
  /** Species that replaces a fishing slot at night. */
  nightFish: u16().optional(),
});
export type EncounterRecord = z.infer<typeof encounter>;
export type EncounterSlot = z.infer<typeof encounterSlot>;

export const encountersFile = fileSchema("encounters", encounter);
export type EncountersFile = z.infer<typeof encountersFile>;

/** A group of trees the game treats as one: up to six coordinate pairs. */
const treeGroup = z.array(z.tuple([s16(), s16()]));

/** Headbutt tables of one map (one record per map id), with the trees in groups. */
const headbutt = z.strictObject({
  id: id(),
  common: slots(),
  rare: slots(),
  secret: slots(),
  regularTrees: z.array(treeGroup),
  secretTrees: z.array(treeGroup),
});
export type HeadbuttRecord = z.infer<typeof headbutt>;

export const headbuttFile = fileSchema("headbutt", headbutt);
export type HeadbuttFile = z.infer<typeof headbuttFile>;

/** Rock Smash item lists in the original's order (ROCK_SMASH_TYPE_*); their items are in content/field/moves.json. */
export const ROCK_SMASH_ITEM_LISTS = ["default", "ruinsOfAlph", "cliffCave"] as const;

/** Chance (percent) that a smashed rock holds an item, and which list it draws from (spec 025, NARC a/2/5/3). */
const rockSmash = z.strictObject({ id: id(), odds: int(1, 100), items: z.enum(ROCK_SMASH_ITEM_LISTS) });
export type RockSmashRecord = z.infer<typeof rockSmash>;
export const rockSmashFile = fileSchema("rock-smash", rockSmash);
export type RockSmashFile = z.infer<typeof rockSmashFile>;

const teamMember = z.strictObject({
  difficulty: int(0, 255),
  genderOverride: int(0, 15),
  abilityOverride: int(0, 15),
  level: int(1, 100),
  species: int(0, 0x3ff),
  form: int(0, 63),
  item: id().nullable(),
  /** Four moves, or null when the original uses the default moves of the level. */
  moves: z.array(id()).length(4).nullable(),
  capsule: u16(),
});

const trainer = z.strictObject({
  id: id(),
  class: z.strictObject({ id: int(0, 255), text: z.string() }),
  name: z.string(),
  items: z.array(id()).max(4),
  /** Bit mask of the battle AI flags, as stored (feature 20 names the bits). */
  aiFlags: int(0, 0xffffffff),
  doubleBattle: z.boolean(),
  team: z.array(teamMember).min(1).max(6),
});
export type TrainerRecord = z.infer<typeof trainer>;
export type TeamMember = z.infer<typeof teamMember>;

export const trainersFile = fileSchema("trainers", trainer);
export type TrainersFile = z.infer<typeof trainersFile>;

/** The battle music a trainer class plays (spec 022, the ARM9 class music table). */
export const TRAINER_MUSIC = ["trainer", "rival", "leader", "rocket", "champion"] as const;
export type TrainerMusic = (typeof TRAINER_MUSIC)[number];

/** What a trainer class pays and plays (spec 022): sPrizeMoneyTbl in overlay 12, the music tables in ARM9. */
const trainerClass = z.strictObject({ id: int(0, 255), prizeBase: int(0, 0xffff), music: z.enum(TRAINER_MUSIC) });
export type TrainerClassRecord = z.infer<typeof trainerClass>;
export const trainerClassesFile = fileSchema("trainer-classes", trainerClass);

/**
 * A Poké Mart's stock (spec 023). Id 0 is the common list (MartBuy), filtered by badge count; id
 * n + 1 is special list n (SpecialMartBuy n). Prices come from items.json.
 */
export const COMMON_MART = 0;
const shop = z.strictObject({
  id: int(0, 255),
  items: z.array(z.strictObject({ item: id(), minBadges: int(0, 16) })).min(1),
});
export type ShopRecord = z.infer<typeof shop>;
export const shopsFile = fileSchema("shops", shop);

/**
 * One trainer line (spec 022): `kind` as the game numbers it (0 the challenge, 1 the line when it
 * loses, 2 after the battle; 3 to 10 the two trainers of a double), `text` a text id of bank 728.
 */
const trainerMessage = z.strictObject({ trainer: id(), kind: int(0, 0xffff), text: z.string().regex(/^\d{4}:\d+$/) });
export type TrainerMessageRecord = z.infer<typeof trainerMessage>;
export const trainerMessagesFile = fileSchema("trainer-messages", trainerMessage);

/**
 * Where a new game starts (spec 024, research R1): sLocation_PlayerRoom in ARM9, and the script the
 * original runs once on a new game (_std_init) to hide the characters' later versions.
 */
export const newGameFile = z.strictObject({
  kind: z.literal("new-game"),
  formatVersion: z.literal(EVENTS_FORMAT_VERSION),
  map: u16(),
  tx: u16(),
  ty: u16(),
  facing: z.enum(["north", "south", "east", "west"]),
  initScript: u16(),
});
export type NewGameFile = z.infer<typeof newGameFile>;

/** The message banks GetStdMsgNaix picks from, by index (spec 024): ov01_022067C8 in overlay 1. */
export const stdMessagesFile = z.strictObject({
  kind: z.literal("std-messages"),
  formatVersion: z.literal(EVENTS_FORMAT_VERSION),
  banks: z.array(u16()).min(1),
});
export type StdMessagesFile = z.infer<typeof stdMessagesFile>;

/**
 * The cities Fly can reach (spec 025, research R1): FLYPOINT_* ids as the original numbers them, and
 * the map and tile the player lands on.
 */
export const flyPointsFile = z.strictObject({
  kind: z.literal("fly-points"),
  formatVersion: z.literal(EVENTS_FORMAT_VERSION),
  points: z
    .array(z.strictObject({ flypoint: int(0, 37), map: u16(), tx: u16(), ty: u16() }))
    .refine((list) => new Set(list.map((p) => p.flypoint)).size === list.length, "ponto de voo repetido"),
});
export type FlyPointsFile = z.infer<typeof flyPointsFile>;

/**
 * Items the field holds (spec 027, research "Resultados da sondagem"): the hidden items (sHiddenItemParam,
 * by script id − 8000, flag = script − 7200), the colour of each apricorn tree (0 red … 6 black, by the tree
 * object's param 0) and the hours each Berry Pot stage takes per berry (NARC a/0/6/6, Cheri first).
 */
export const fieldItemsFile = z.strictObject({
  kind: z.literal("field-items"),
  formatVersion: z.literal(EVENTS_FORMAT_VERSION),
  hidden: z
    .array(z.strictObject({ index: u16(), item: int(1, 0xffff), count: int(1, 99), flag: int(1, 0xffff) }))
    .refine((list) => new Set(list.map((h) => h.index)).size === list.length, "item escondido repetido"),
  apricornTrees: z.array(int(0, 6)).max(64),
  berries: z.array(z.strictObject({ item: int(149, 212), hoursPerStage: int(1, 255) })).max(64),
});
export type FieldItemsFile = z.infer<typeof fieldItemsFile>;

/**
 * The Azalea Gym's Spinarak threads (spec 030.5, overlay 4): the stops, from each stop and per lever state
 * (the switches bits) the stop its thread leads to and the thread's points, and the spiders' first stops.
 */
const gymTile = z.strictObject({ x: u16(), z: u16() });
export const azaleaGymFile = z
  .strictObject({
    kind: z.literal("azalea-gym"),
    formatVersion: z.literal(EVENTS_FORMAT_VERSION),
    stations: z.array(gymTile).min(1),
    routes: z.array(z.array(z.strictObject({ to: u16(), path: z.array(gymTile).min(2) }).nullable()).length(4)),
    spiders: z.array(u16()).min(1),
    /** The ropes and levers each lever animates (AzaleaGymSwitch), where map 180's piece places them, in map pixels. */
    levers: z.array(z.strictObject({ model: u16(), lever: int(0, 1), x: z.number().finite(), y: z.number().finite(), z: z.number().finite() })).max(8).default([]),
  })
  .refine((f) => f.routes.length === f.stations.length, "uma lista de fios por parada")
  .refine((f) => [...f.spiders, ...f.routes.flat().map((r) => r?.to ?? 0)].every((stop) => stop < f.stations.length), "parada inexistente");
export type AzaleaGymFile = z.infer<typeof azaleaGymFile>;

export const SCRIPT_ARG_TYPES =["number", "text", "species", "move", "item", "trainer", "flag", "variable", "jump", "movement"] as const;

/** An argument is present only when an earlier one has (or lacks) certain values. */
const argWhen = z.strictObject({ arg: z.string(), in: z.array(id()).optional(), notIn: z.array(id()).optional() });

const commandSpec = z.strictObject({
  id: u16(),
  name: z.string().min(1),
  args: z.array(z.strictObject({ name: z.string().min(1), type: z.enum(SCRIPT_ARG_TYPES), size: z.union([z.literal(1), z.literal(2), z.literal(4)]), when: argWhen.optional() })),
});

export const scriptCommandsFile = z
  .strictObject({
    kind: z.literal("script-commands"),
    formatVersion: z.literal(EVENTS_FORMAT_VERSION),
    commands: z.array(commandSpec),
    movements: z.array(z.strictObject({ id: u16(), name: z.string().min(1) })),
  })
  .superRefine((table, ctx) => {
    for (const group of ["commands", "movements"] as const) {
      const seen = new Set<number>();
      table[group].forEach((entry, i) => {
        if (seen.has(entry.id)) ctx.addIssue({ code: "custom", path: [group, i, "id"], message: `id ${entry.id} repetido` });
        seen.add(entry.id);
      });
    }
  });
export type ScriptCommandsFile = z.infer<typeof scriptCommandsFile>;
export type CommandSpec = ScriptCommandsFile["commands"][number];

const coverage = z.strictObject({
  name: z.string(),
  count: id(),
  /** Maps whose script file holds the command, ascending. */
  maps: z.array(id()),
  /** Script files outside any map (shared scripts) that hold the command, ascending. */
  globalFiles: z.array(id()),
});
export type CommandCoverage = z.infer<typeof coverage>;

export const eventsReportFile = z.strictObject({
  kind: z.literal("events-report"),
  formatVersion: z.literal(EVENTS_FORMAT_VERSION),
  /** False when more than 2% of the script files were lost. */
  ok: z.boolean(),
  counts: z.strictObject({
    maps: id(),
    npcs: id(),
    warps: id(),
    triggers: id(),
    signs: id(),
    scriptFiles: id(),
    scripts: id(),
    commands: id(),
    encounterBanks: id(),
    trainers: id(),
  }),
  /** Every command the table knows that appears, most frequent first. */
  commands: z.array(coverage),
  unknownCommands: z.array(coverage),
  /** Script files that failed or stopped at an unknown command. */
  undecodedScripts: z.array(z.strictObject({ file: id(), reason: z.string().min(1) })),
  unresolved: z.array(z.strictObject({ file: id().nullable(), kind: z.string(), detail: z.string() })),
  unreachableBytes: id(),
  /** Script files decoded whole, over all script files. */
  decodedPercent: z.number().min(0).max(100),
});
export type EventsReportFile = z.infer<typeof eventsReportFile>;

const codec = createGameDataCodec({
  "map-events": mapEventsFile,
  "script-file": scriptFile,
  encounters: encountersFile,
  headbutt: headbuttFile,
  "rock-smash": rockSmashFile,
  trainers: trainersFile,
  "trainer-classes": trainerClassesFile,
  "trainer-messages": trainerMessagesFile,
  shops: shopsFile,
  "new-game": newGameFile,
  "std-messages": stdMessagesFile,
  "fly-points": flyPointsFile,
  "field-items": fieldItemsFile,
  "azalea-gym": azaleaGymFile,
  "script-commands": scriptCommandsFile,
  "events-report": eventsReportFile,
});

export type EventsFileKind =
  | "map-events"
  | "script-file"
  | "encounters"
  | "headbutt"
  | "rock-smash"
  | "trainers"
  | "trainer-classes"
  | "trainer-messages"
  | "shops"
  | "new-game"
  | "std-messages"
  | "fly-points"
  | "field-items"
  | "azalea-gym"
  | "script-commands"
  | "events-report";
export const parseEventsFile = codec.parseGameDataFile;
export const parseEventsJson = codec.parseGameDataJson;
export const serializeEventsFile = codec.serializeGameDataFile;
