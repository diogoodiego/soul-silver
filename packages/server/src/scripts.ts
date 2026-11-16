import type { EncounterRecord, EncounterSlot, MapEventsFile, FieldItemsFile, FlyPointsFile, HeadbuttRecord, NewGameFile, NpcTradeRecord, RockSmashRecord, ScriptFile, ScriptRef } from "@soulsilver/shared/events";
import { headbuttTree, pickUser, RIDER_OFFSET_PX, rideAt, gymProps, type AzaleaGym, type AzaleaGymState, type FieldMovesRules, type GymTile } from "@soulsilver/shared/field";
import { rollLevel, rollSlot } from "@soulsilver/shared/wild";
import { createRng, ringSource, stepMovement, tileAt, unstick, type Entity, type PlayerInput, type ServerMessage, type WorldLookup, BUTTON } from "@soulsilver/shared/game";
import { isCounter, isIce, isPc, MAP_TILE_PX, type Direction } from "@soulsilver/shared/maps";
import { starterMember } from "@soulsilver/shared/progression";
import { store } from "@soulsilver/shared/pc";
import { canFight, hasBadgeBit, PHOTO_ALBUM_MAX, SEAL_KINDS, SEAL_MAX, type PartyMember, type Save } from "@soulsilver/shared/save";
import { npcOccupied, type CutsceneActor, type CutsceneStep } from "@soulsilver/shared/npc";
import { createRunner, SCRIPT_DIRECTIONS, SCRIPT_HANDLERS, type MissingCommand, type Runner, type ScriptHost } from "@soulsilver/shared/script";
import { POCKET_KEYS } from "@soulsilver/shared/game-data";
import type { PhoneBook } from "@soulsilver/shared/phone";
import { addItem, canAdd, removeItem, type PocketOf } from "@soulsilver/shared/items";
import { compatibility, compatibilityScore, cyclesToSubtract, daycareStep, eggWalk, makeGiftEgg, deposit, eggCheckDue, eggRoll, eggSpecies, grownLevel, makeEgg, motherIsFirst, retrieve, rollGender, type Parent } from "@soulsilver/shared/daycare";
import type { ItemsData } from "./items";
import type { Npcs } from "./npcs";
import type { ProgressionData } from "./progression";
import type { World } from "./world";

// Event scripts per player (spec 020): what starts them, the effects they have on that player's
// progress, and which people each player sees. The interpreter itself is @soulsilver/shared/script.

/** The extracted scripts and events; the host reads them from disk (server-host/scripts-loader.ts). */
/** Item 030.10: an in-game trade as the server uses it; the nickname is the ROM's text, read when the scripts load. */
export type NpcTrade = Omit<NpcTradeRecord, "nickname" | "ot"> & { nickname: string };

export interface ScriptData {
  file(id: number): ScriptFile | undefined;
  events(map: number): MapEventsFile | undefined;
  /** Where a script id leads from `map` (global ids ignore the map). */
  resolve(scriptId: number, map: number): { file: number; entry: number } | undefined;
  /** Where a new game starts and the script it runs once (spec 024); absent in older extractions. */
  newGame?: Omit<NewGameFile, "kind" | "formatVersion"> | undefined;
  /** The message banks GetStdMsgNaix picks from, by index (spec 024). */
  stdMessageBanks?: readonly number[] | undefined;
  /** Where Fly lands, by FLYPOINT id (spec 025); absent in older extractions. */
  flyPoints?: FlyPointsFile["points"] | undefined;
  /** The rival's name when nothing is typed, from the game's text (spec 024). */
  defaultRival?: string | undefined;
  /** Headbutt tables and trees by map (spec 025); absent in tests that do not need them. */
  headbutt?: ((map: number) => HeadbuttRecord | undefined) | undefined;
  /** The phone book (spec 026); absent in older extractions and in tests that do not need it. */
  phone?: PhoneBook | undefined;
  /** Rock Smash item odds by map (spec 025); absent in older extractions and in tests that do not need them. */
  rockSmash?: ((map: number) => RockSmashRecord | undefined) | undefined;
  /** Spec 027: hidden items, apricorn tree colours and berry growth; absent in older extractions. */
  fieldItems?: Omit<FieldItemsFile, "kind" | "formatVersion"> | undefined;
  /** Spec 030.5: the Azalea Gym's Spinarak threads; absent in older extractions. */
  azaleaGym?: AzaleaGym | undefined;
  /** Item 030.10: the in-game trades by id; absent in older extractions. */
  npcTrades?: ReadonlyMap<number, NpcTrade> | undefined;
}

/** Temporary variables and map flags the game clears on every map change (vars.h, flags.h). */
const TEMP_VARS = { from: 0x4000, to: 0x401f };
const MAPTEMP_FLAGS = { from: 0x1, to: 0x40 };
/** A script waits this long for an answer before the player is let go: 60 s at 20 Hz. */
export const SCRIPT_TIMEOUT_TICKS = 1200;
/** Requests the server ends itself, never timed out: waits, trainer battles, shops and the PC (spec 024). */
const OPEN_ENDED = new Set(["wait", "battle", "wild", "shop", "pc"]);
const STEP: Record<Direction, [number, number]> = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
const OPPOSITE: Record<Direction, Direction> = { north: "south", south: "north", west: "east", east: "west" };
const BAG_MAX = 999;
/** Spec 027: a sign of this kind is a hidden item (bg_event type 2), its script 8000 + its index in field-items.json. */
const HIDDEN_SIGN = 2;
/** Item balls: map objects whose script is 7000 + n, all in this file. */
const ITEM_BALL_FILE = 141;
const HIDDEN_SCRIPT_BASE = 8000;
/** The hidden-item std script reads the item, the count and the flag from these (GetHiddenItemParams). */
const HIDDEN_VARS = [0x8000, 0x8001, 0x8002] as const;
/** Kurt's "making balls today" flag (scr_seq_0874): a daily flag in the original, here the day of his order. */
const KURT_DAILY_FLAG = 2722;
/** The Pokémon Centers' ground floors, the original's sPokemonCenterMaps: only there does healing set the respawn point. */
const POKEMON_CENTERS = new Set(["501", "475", "428", "434", "358", "393", "482", "508", "407", "69", "158", "166", "236", "185", "226", "81", "246", "293", "514", "511", "466", "169", "528", "534"]);
/** Map sprites chosen by script variable (the field table has no entry for them). */
const VAR_SPRITE_FIRST = 101;
const VAR_SPRITE_LAST = 116;
const VAR_SPRITE_BASE = 0x4020;
/** VAR_LAST_TALKED: the person a script was started on; field-move scripts hide it (spec 025). */
const VAR_LAST_TALKED = 0x800d;
/** Field-move scripts of file 146 started from the tile ahead (pokeheartgold metatile_behavior.h, spec 025). */
const TILE_SCRIPTS: ReadonlyMap<number, number> = new Map([
  [0x06, 10014], // headbutt tree
  [0x4b, 10003], // rock climb, north–south
  [0x4c, 10003], // rock climb, east–west
  [0x13, 10005], // waterfall
  [0x11, 10016], // whirlpool
]);
/** Waterfalls and whirlpools are faced from the water. */
const FROM_WATER = new Set([0x13, 0x11]);
/** The boulder's talk script: walking into it pushes it while Strength is on. */
const STRENGTH_SCRIPT = 10002;
/** The ice blocks of Mahogany's gym and the Ice Path (item 032.6): this sprite with no script; walking into one pushes it. */
const ICE_BLOCK_SPRITE = 406;
/** Rock Smash's move id: the companion that knows it swings at the rock itself. */
const ROCK_SMASH = 249;
/**
 * The original draws a 16-bit trainer id at a new game; saves have none, so it comes from the player's name
 * (FNV-1a), the same every session. Headbutt's tree tables read its last digit.
 * shortcut: two players with the same name share the id; store a drawn id in the save if that matters.
 */
export function trainerIdOf(name: string): number {
  let h = 0x811c9dc5;
  for (const c of name) h = Math.imul(h ^ c.codePointAt(0)!, 0x01000193);
  return (h >>> 0) & 0xffff;
}
const MONEY_MAX = 999999;
/**
 * Prof. Oak's introduction (text bank 219). In the original it is a screen of its own, not a field
 * script; here its speech runs as one, minus the gender and name questions the new-game menu asked.
 */
const INTRO_BANK = 219;
/** SEQ_ME_POKEGEAR_REGIST (sndseq.h): the jingle of a number registered. */
const REGISTER_FANFARE = 1206;
/** "Registered … in the Pokégear." (scr_seq_0953.s _0DF9). */
const REGISTERED_TEXT = "0040:101";

/**
 * A trainer's number offer (spec 026), the original's steps in scr_seq_0953.s: _0DCF after the first win
 * (message 1 of the contact's bank) or _0DE4 when talked to again (message 4), then _0DF9: yes plays the
 * jingle, registers and says message 2; no says message 3 (GetPhoneContactMsgIds k is message k + 1).
 */
export function numberOffer(contact: number, bank: number, again: boolean): ScriptFile {
  const msg = (n: number) => ({ name: "MsgBoxExtern", args: { arg0: bank, arg1: n } });
  return {
    kind: "script-file",
    formatVersion: 1,
    file: -2,
    messageBank: null,
    entries: ["L1"],
    labels: { L1: 0, L2: 9 },
    code: [
      msg(again ? 4 : 1),
      { name: "GetMenuChoice", args: { arg0: 0x8000 } },
      { name: "CompareVarToValue", args: { var: { variable: 0x8000 }, val: 0 } },
      { name: "GoToIf", args: { condition: 5, dest: { label: "L2" } } },
      { name: "PlayFanfare", args: { fanfare: REGISTER_FANFARE } },
      { name: "NPCMsg", args: { msg_id: { text: REGISTERED_TEXT } } },
      { name: "RegisterGearNumber", args: { arg0: contact } },
      msg(2),
      { name: "End", args: {} },
      msg(3),
      { name: "CloseMsg", args: {} },
      { name: "End", args: {} },
    ],
    movements: {},
    unreachableBytes: 0,
    partial: false,
  };
}

export const INTRO_SCRIPT: ScriptFile = {
  kind: "script-file",
  formatVersion: 1,
  file: -1,
  messageBank: INTRO_BANK,
  entries: ["L1"],
  labels: { L1: 0 },
  code: [
    { name: "NPCMsg", args: { msg_id: 6 } },
    { name: "NPCMsg", args: { msg_id: 34 } },
    { name: "NPCMsg", args: { msg_id: 35 } },
    { name: "BufferPlayersName", args: { slot: 0 } },
    { name: "NPCMsg", args: { msg_id: 43 } },
    { name: "CloseMsg", args: {} },
    { name: "End", args: {} },
  ],
  movements: {},
  unreachableBytes: 0,
  partial: false,
};

/** The PC's common script (std 2010: the menu, then the storage). */
const PC_SCRIPT = 2010;
/** Spec 029.4: the egg hatching common script ("Oh?", EggHatchAnim), std 2021. */
const HATCH_SCRIPT = 2021;
/** Spec 030.1: FLAG_GOT_EGG_FROM_ELMS_ASSISTANT and FLAG_SYS_HATCHED_TOGEPI_EGG (flags.h). */
const FLAG_GOT_TOGEPI_EGG = 112;
const FLAG_HATCHED_TOGEPI_EGG = 0x983;
const TOGEPI = 175;
const UNOWN = 201;

/** Default of content/trainer/tuning.json trainerFlagBase, for sessions without trainer data. */
const TRAINER_FLAG_BASE = 1360;

export interface Storyteller {
  playerId: number;
  entityId: number;
  /** The trainer's name: their trainer id comes from it (Headbutt). */
  name?: string | undefined;
  character: Save["character"];
  flags: Set<number>;
  vars: Map<number, number>;
  /** Where scripts moved people for good, the save's npcPlacement (spec 021); mutated in place. */
  placement?: Save["npcPlacement"] | undefined;
  /** A save that was just created: Prof. Oak's introduction runs once on entering the world (spec 021, FR-011). */
  intro?: boolean | undefined;
  /** The story has not started (a new save, or one restarted, spec 024): _std_init runs once on joining. */
  init?: boolean | undefined;
  progress: Pick<Save, "party" | "boxes" | "bag" | "money" | "badgeSet" | "pokedex" | "respawn" | "daycare" | "daycareEgg" | "eggWalk" | "photos" | "seals">;
  /** The save's rival name (spec 024); mutated in place, the session saves it. */
  rival?: Pick<Save, "rivalName"> | undefined;
  send(msg: ServerMessage): void;
}

export interface ScriptsOptions {
  data: ScriptData;
  world: World;
  lookup: WorldLookup;
  /** Gives the people their movement patterns (spec 021). */
  npcs?: Npcs | undefined;
  progression?: ProgressionData | undefined;
  seed: number;
  hpMax(m: PartyMember): number;
  /** The bag pocket of each item (spec 024: the receive-item std script). */
  items?: ItemsData | undefined;
  weekday(): number;
  hour(): number;
  /** ISO timestamp for what the save records (Cameron's photos). */
  clock: () => string;
  timeoutTicks?: number | undefined;
  /** Runs Prof. Oak's introduction for saves that were just created (off in tests that do not ask for it). */
  intro?: boolean | undefined;
  /** Development builds: the debugger may change flags. */
  devTools?: boolean | undefined;
  /** After the party or the bag changed, so the client gets them again. */
  changed(playerId: number, what: "party" | "bag"): void;
  onMissing?: ((m: MissingCommand & { player: number }) => void) | undefined;
  /** A script ended with the player unable to take a step (spec 024). */
  onStuck?: ((s: StuckPlayer) => void) | undefined;
  /** A script is about to run for this player: the state as it is now is what saves keep until it ends (spec 024). */
  onStart?: ((playerId: number) => void) | undefined;
  /** Starts a scripted trainer battle (spec 022); false when there is none to start. The script waits for battleEnded. */
  battle?: ((playerId: number, trainer: number, partner: number, ally: number) => boolean) | undefined;
  /** Spec 030.9: a static encounter, a wild Pokémon at (x, y) of `area` for this player to fight; false when none could appear. The script waits for wildBattleEnded. */
  wildBattle?: ((playerId: number, species: number, level: number, at: { area: string; x: number; y: number }, shiny?: boolean) => boolean) | undefined;
  /** Item 031.2: roamer `id` starts roaming for this player (CreateRoamer). */
  createRoamer?: ((playerId: number, id: number) => void) | undefined;
  /** Opens a Poké Mart (spec 023); false when there is none. The script waits for serviceClosed. */
  shop?: ((playerId: number, shop: number, sell: boolean) => boolean) | undefined;
  /** Opens the Pokémon PC (spec 023); the script waits for serviceClosed. */
  pc?: ((playerId: number) => boolean) | undefined;
  /** Talking to a trainer (spec 022): it challenges or says its after line; true when handled. */
  talkTrainer?: ((playerId: number, npc: Entity) => boolean) | undefined;
  /** Spec 025: the map's encounter table, and a wild Pokémon out of a rock or a tree; false when it could not appear. */
  fieldWild?: { encounter(area: string): EncounterRecord | undefined; spawn(area: string, x: number, y: number, species: number, level: number): boolean } | undefined;
  /** Spec 025: the items of each Rock Smash list and the chance of each place (content/field/moves.json). */
  rockSmashItems?: FieldMovesRules["rockSmashItems"] | undefined;
  /** Defeated trainer t is flag trainerFlagBase + t (spec 022, content/trainer/tuning.json). */
  trainerFlagBase?: number | undefined;
  /** Spec 026: the player's phone (server/src/phone.ts). `call` rings a script's call; the script waits for callEnded. */
  phone?:
    | {
        register(playerId: number, id: number): void;
        registered(playerId: number, id: number): boolean;
        rematch(playerId: number, id: number): number;
        rematchWon(playerId: number, id: number): void;
        scriptedCall(playerId: number, caller: number, script: number): boolean;
      }
    | undefined;
  /** The PHONE_SCRIPT of a scripted call by caller and index (content/phone/scripted-calls.json). */
  scriptedCall?: ((caller: number, index: number) => number | undefined) | undefined;
  /** Spec 027: the move of a TM or HM item, and the player's apricorns and Kurt (server/src/items.ts). */
  machineMove?: ((item: number) => number | undefined) | undefined;
  apricorns?: ((playerId: number) => ApricornHost) | undefined;
  log(message: string): void;
}

/** What scripts ask about apricorns and Kurt (server/src/items.ts, Items.apricorns). */
export interface ApricornHost {
  tree(color: number | undefined, tree: number): { color: number; ready: boolean } | undefined;
  pick(color: number, tree: number): boolean;
  counts(): number[];
  give(color: number): void;
  kurtCount(): number;
  kurtBall(): number;
  kurtWaiting(): boolean;
  clearKurt(): void;
}

/** Who was left stuck, by which script, on which tile (matrix coordinates), and whether unstick freed them. */
export interface StuckPlayer {
  player: number;
  file: number;
  entry: number;
  area: string;
  x: number;
  z: number;
  /** Visible people on or next to the player's tile, by person id. */
  people: number[];
  freed: boolean;
}

/** One step's input in each direction, to see whether the player can still walk. */
const PROBES = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];

interface State {
  who: Storyteller;
  runner: Runner | undefined;
  /** The script the runner started from, for the stuck check at its end. */
  script: { file: number; entry: number } | undefined;
  /** Id of the request the client must answer; ids only grow. */
  asked: number;
  askedAt: number;
  waitUntil: number | undefined;
  locked: boolean;
  /** The person talked to, for FacePlayer. */
  talkedTo: number | undefined;
  area: string | undefined;
  tile: string;
  /** Spec 029.4: where the player stood last tick while walking freely; undefined after a warp or a script. */
  walkedFrom: { area: string; x: number; y: number } | undefined;
  /** HidePerson / ShowPerson for this visit of the map, by person id. */
  shown: Map<number, boolean>;
  /** Where cutscenes left people for this visit of the map, in map tiles, by person id. */
  moved: Map<number, { tx: number; ty: number; facing: Direction }>;
  /** The frame table stops after one of its scripts failed, until the map is entered again. */
  framesOff: boolean;
  /** The field comes back after the starter scene: onResume runs again once the script ends, as the original. */
  resume: boolean;
  /** The running script came from the frame table. */
  frameRunning: boolean;
  debug: boolean;
  lastDebug: string;
  /** The script waits on a trainer battle: the player fights meanwhile. */
  inBattle: boolean;
  /** The script waits on a shop or a PC the server runs (spec 023). */
  inService: boolean;
  /** Result of the last trainer battle, for CheckBattleWon. */
  won: boolean;
  /** Spec 030.9: the last wild battle's BattleOutcome (GetStaticEncounterOutcome), and the map it was fought on. */
  outcome: number;
  wildArea: string | undefined;
  /** Strength is on for this visit of the map (spec 025). */
  strength: boolean;
  /** Spec 030.5: the Azalea Gym's spiders and levers, set by AzaleaGymInit on entering the gym. */
  gymmick: AzaleaGymState | undefined;
  /** Spec 030.5: the Spinarak ride under way, glided a step each tick while its script waits. */
  ride: { path: GymTile[]; spider: number; from: number } | undefined;
  /** The latest flag and variable changes for the debugger (spec 024), kept while it is off too. */
  changes: FlagChange[];
}

type DebugView = Extract<ServerMessage, { type: "script-debug" }>;
type FlagChange = DebugView["changes"][number];
const HISTORY = 64;
/** BattleOutcome of the original (pokeheartgold battle.h): a loss. */
const OUTCOME_LOST = 2;
const hex = (n: number) => `0x${n.toString(16)}`;
const scriptName = (file: number, entry: number) => `${String(file).padStart(4, "0")}:${entry}`;

export function createScripts(options: ScriptsOptions) {
  const { data, world, lookup } = options;
  const timeout = options.timeoutTicks ?? SCRIPT_TIMEOUT_TICKS;
  const trainerFlagBase = options.trainerFlagBase ?? TRAINER_FLAG_BASE;
  const rng = createRng(options.seed);
  const states = new Map<number, State>();
  /** Person entities by area, spawned the first time someone enters the map. */
  const people = new Map<string, Map<number, number>>();
  let tick = 0;

  const origin = (area: string) => lookup(area)?.origin ?? { tx: 0, ty: 0 };
  const eventsOf = (area: string) => (/^\d+$/.test(area) ? data.events(Number(area)) : undefined);
  const center = (t: number) => t * MAP_TILE_PX + MAP_TILE_PX / 2;
  /** The state of a player allowed to use a development command (spec 024, 025); otherwise logs the refusal. */
  function devState(playerId: number, command: string): State | undefined {
    const s = states.get(playerId);
    if (s?.debug && options.devTools) return s;
    options.log(`Refused ${command} from player ${playerId}: the script debugger is off or this is not a development build`);
    return undefined;
  }

  /** The player's tile in matrix coordinates, as events and scripts count them. */
  function tileOf(e: Entity): { x: number; z: number } {
    const o = origin(e.area);
    return { x: Math.floor(e.x / MAP_TILE_PX) + o.tx, z: Math.floor(e.y / MAP_TILE_PX) + o.ty };
  }

  function spawnPeople(area: string): void {
    if (people.has(area)) return;
    const ids = new Map<number, number>();
    people.set(area, ids);
    const o = origin(area);
    for (const n of eventsOf(area)?.npcs ?? []) {
      const e = world.add({ kind: "npc", area, x: center(n.x - o.tx), y: center(n.z - o.ty), level: 0, facing: SCRIPT_DIRECTIONS[n.facing] ?? "south", data: { sprite: n.sprite, person: n.id } });
      ids.set(n.id, e.id);
      options.npcs?.add(e.id, { person: n.id, movement: n.movement, xRange: n.xRange, yRange: n.yRange, tx: n.x - o.tx, ty: n.z - o.ty });
    }
  }

  const hiddenByIndex = new Map((data.fieldItems?.hidden ?? []).map((h) => [h.index, h]));
  const hiddenOf = (scriptId: number) => hiddenByIndex.get(scriptId - HIDDEN_SCRIPT_BASE);

  function personOf(area: string, person: number) {
    const id = people.get(area)?.get(person);
    return id === undefined ? undefined : world.get(id);
  }

  function visibleTo(s: State, e: Entity): boolean {
    if (e.kind !== "npc") return true;
    const person = e.data["person"] as number;
    const shown = s.shown.get(person);
    if (shown !== undefined) return shown;
    const hideFlag = eventsOf(e.area)?.npcs.find((n) => n.id === person)?.hideFlag ?? 0;
    return hideFlag === 0 || !s.who.flags.has(hideFlag);
  }

  /** A value from a frame or trigger condition: 0x4000 and up name a variable. */
  const operand = (s: State, v: number) => (v >= 0x4000 ? (s.who.vars.get(v) ?? 0) : v);
  const frameMet = (s: State, f: { variable: number; value: number }) => (s.who.vars.get(f.variable) ?? 0) === operand(s, f.value);
  const triggerMet = (s: State, g: { variable: number; value: number }) => (s.who.vars.get(g.variable) ?? 0) === g.value;

  /**
   * shortcut: only what scripts and the debugger write; the battle's defeated-trainer flag (trainer-battle.ts)
   * and the map's temporary resets are not listed. Route them through here when the golden path needs them.
   */
  function record(s: State, kind: FlagChange["kind"], id: number, value: number, script?: string): void {
    const at = s.runner?.snapshot();
    s.changes.push({ tick, kind, id, value, script: script ?? (at ? scriptName(at.file, at.entry) : "dev") });
    if (s.changes.length > HISTORY) s.changes.shift();
  }

  function writeFlag(s: State, id: number, on: boolean, script?: string): void {
    if (s.who.flags.has(id) === on) return;
    if (on) s.who.flags.add(id);
    else s.who.flags.delete(id);
    record(s, "flag", id, on ? 1 : 0, script);
  }

  function send(s: State, msg: ServerMessage): void {
    s.who.send(msg);
  }

  function lock(s: State, locked: boolean): void {
    if (s.locked === locked) return;
    s.locked = locked;
    send(s, { type: "script-lock", locked });
  }

  /** The tile n steps ahead of the entity, in map tiles, with its behavior (the permission's low byte). */
  function ahead(e: Entity, n = 1) {
    const x = Math.floor(e.x / MAP_TILE_PX) + STEP[e.facing][0] * n;
    const y = Math.floor(e.y / MAP_TILE_PX) + STEP[e.facing][1] * n;
    return { x, y, behavior: (tileAt(lookup, e.area, e.level, center(x), center(y))?.raw ?? 0) & 0xff };
  }

  /** Spec 029.2: a member with no gender gets one by its species' ratio (members from before v13, or new ones). */
  function withGender(m: PartyMember | undefined): void {
    const ratio = m && !m.gender ? options.progression?.species(m.species)?.gender?.raw : undefined;
    const gender = ratio === undefined ? undefined : rollGender(ratio, rng);
    if (m && gender) m.gender = gender;
  }

  /** A Day Care Pokémon as breeding sees it; a species without egg data counts as Undiscovered. */
  const parentOf = (m: PartyMember): Parent => ({ species: m.species, gender: m.gender, eggGroups: options.progression?.species(m.species)?.eggGroups ?? ["undiscovered"], held: m.held });

  function daycareCompatibility(who: Storyteller): number {
    const [a, b] = who.progress.daycare;
    return a && b ? compatibility(parentOf(a.mon), parentOf(b.mon)) : 0;
  }

  /** GiveEggToPlayer: the egg the two Day Care Pokémon make; undefined without two or without species data. */
  function breed(who: Storyteller): PartyMember | undefined {
    const [a, b] = who.progress.daycare;
    const data = options.progression;
    if (!a || !b || !data) return undefined;
    const [mother, father] = motherIsFirst(parentOf(a.mon), parentOf(b.mon)) ? [a.mon, b.mon] : [b.mon, a.mon];
    const species = eggSpecies(parentOf(a.mon), parentOf(b.mon), (id) => data.preEvolution(id), rng);
    return makeEgg(mother, father, species, {
      levelUp: (id) => data.levelUp(id),
      eggMoves: (id) => data.eggMoves(id),
      machineMoves: (id) => data.machines(id).flatMap((m) => data.machine(m)?.move ?? []),
      hatchCycles: (id) => data.species(id)?.hatchCycles ?? 0,
      genderRatio: (id) => data.species(id)?.gender?.raw ?? 255,
      hpMax: (m) => options.hpMax(m),
    }, rng);
  }

  function hostFor(s: State): ScriptHost {
    const { who } = s;
    const me = () => world.get(who.entityId)!;
    const bagRow = (item: number) => who.progress.bag.find((b) => b.item === item);
    const pocketOf: PocketOf | undefined = options.items ? (item) => options.items!.item(item)?.pocket : undefined;
    const fits = (item: number, count: number) => (pocketOf ? canAdd(who.progress.bag, item, count, pocketOf) : item >= 1 && (bagRow(item)?.count ?? 0) + count <= BAG_MAX);
    const apricorns = options.apricorns?.(who.playerId);
    /** The apricorn tree talked to: its object's param 0 is the tree's index (scr_seq_0150). */
    const treeIndex = () => {
      const npc = s.talkedTo === undefined ? undefined : world.get(s.talkedTo);
      return npc ? eventsOf(npc.area)?.npcs.find((n) => n.id === npc.data["person"])?.param[0] : undefined;
    };
    /** Item 030.10, _CreateTradeMon: the trade's IVs, personality (nature, gender), item and nickname at `level`; never shiny. */
    const tradeMember = (id: number, level: number): PartyMember | undefined => {
      const t = data.npcTrades?.get(id);
      const info = t && options.progression?.species(t.give);
      if (!t || !info) {
        options.log(`Script trade ${id} has no trade or species data; nothing given`);
        return undefined;
      }
      const ratio = info.gender?.raw ?? 255;
      const gender = ratio === 255 ? undefined : ratio === 0 ? "male" : ratio === 254 ? "female" : (t.pid & 0xff) < ratio ? "female" : "male";
      const m: PartyMember = {
        ...starterMember(info, options.progression!.levelUp(t.give), rng, Math.max(1, Math.min(100, level))),
        ivs: t.ivs,
        nature: t.pid % 25,
        trade: id,
        ...(t.nickname ? { nickname: t.nickname.slice(0, 10) } : {}),
        ...(t.heldItem ? { held: t.heldItem } : {}),
        ...(gender ? { gender } : {}),
      };
      return { ...m, hp: options.hpMax(m) };
    };
    /** UpdatePokedexWithReceivedSpecies. */
    const received = (species: number) => {
      const dex = who.progress.pokedex;
      if (!dex.seen.includes(species)) dex.seen.push(species);
      if (!dex.caught.includes(species)) dex.caught.push(species);
      options.changed(who.playerId, "party");
    };
    return {
      character: who.character,
      flag: (id) => (id === KURT_DAILY_FLAG && apricorns ? apricorns.kurtWaiting() : who.flags.has(id)),
      setFlag: (id, on) => (id === KURT_DAILY_FLAG && apricorns ? undefined : writeFlag(s, id, on)),
      getVar: (id) => who.vars.get(id) ?? 0,
      setVar(id, v) {
        if ((who.vars.get(id) ?? 0) === v) return;
        if (v === 0) who.vars.delete(id);
        else who.vars.set(id, v);
        record(s, "var", id, v);
      },
      money: () => who.progress.money,
      addMoney: (n) => void (who.progress.money = Math.max(0, Math.min(MONEY_MAX, who.progress.money + n))),
      hasItem: (item, count) => (bagRow(item)?.count ?? 0) >= count,
      itemCount: (item) => bagRow(item)?.count ?? 0,
      hasSpaceForItem: (item, count) => fits(item, count),
      giveItem(item, count) {
        if (!fits(item, count)) return false;
        if (pocketOf) addItem(who.progress.bag, item, count, pocketOf);
        else {
          const row = bagRow(item);
          if (row) row.count += count;
          else who.progress.bag.push({ item, count });
        }
        options.changed(who.playerId, "bag");
        return true;
      },
      takeItem(item, count) {
        if (!removeItem(who.progress.bag, item, count)) return false;
        options.changed(who.playerId, "bag");
        return true;
      },
      machineMove: (item) => options.machineMove?.(item) ?? 0,
      apricornTree: () => {
        const tree = treeIndex();
        return tree === undefined ? undefined : apricorns?.tree(data.fieldItems?.apricornTrees[tree], tree);
      },
      pickApricorn() {
        const tree = treeIndex();
        const color = tree === undefined ? undefined : data.fieldItems?.apricornTrees[tree];
        return tree !== undefined && color !== undefined && (apricorns?.pick(color, tree) ?? false);
      },
      apricorns: () => apricorns?.counts() ?? [0, 0, 0, 0, 0, 0, 0],
      giveKurt: (color) => apricorns?.give(color),
      kurtCount: () => apricorns?.kurtCount() ?? 0,
      kurtBall: () => apricorns?.kurtBall() ?? 0,
      clearKurt: () => apricorns?.clearKurt(),
      partyCount: () => who.progress.party.length,
      partySpecies: (slot) => who.progress.party[slot]?.species ?? 0,
      partyLeadAlive() {
        const i = who.progress.party.findIndex(canFight);
        return i === -1 ? who.progress.party.length : i;
      },
      partyNickname: (slot) => who.progress.party[slot]?.nickname,
      partyFriendship: (slot) => who.progress.party[slot]?.friendship ?? 0,
      rivalName: () => who.rival?.rivalName ?? "",
      setRivalName: (name) => void (who.rival && (who.rival.rivalName = name)),
      defaultRivalName: () => data.defaultRival ?? "",
      companionOut: () => companionOf(s) !== undefined,
      stdMessageBank: (i) => data.stdMessageBanks?.[i] ?? 0,
      itemPocket: (item) => Math.max(0, POCKET_KEYS.indexOf(options.items?.item(item)?.pocket ?? "items")),
      nicknamePartyMon(slot, name) {
        const mon = who.progress.party[slot];
        if (!mon) return;
        const trimmed = name.trim().slice(0, 10);
        if (trimmed === "") delete mon.nickname;
        else mon.nickname = trimmed;
        options.changed(who.playerId, "party");
      },
      giveMon(species, level) {
        const info = options.progression?.species(species);
        if (!info) {
          options.log(`Script gives species ${species} but there is no species data; nothing given`);
          return false;
        }
        // shortcut: held item and form are not kept, the party has no field for them yet; add both when a spec needs them.
        const mon = starterMember(info, options.progression!.levelUp(species), rng, Math.max(1, Math.min(100, level)));
        if (who.progress.party.length < 6) who.progress.party.push(mon);
        else if (!store(who.progress.boxes, mon)) return false;
        const dex = who.progress.pokedex;
        if (!dex.seen.includes(species)) dex.seen.push(species);
        if (!dex.caught.includes(species)) dex.caught.push(species);
        options.changed(who.playerId, "party");
        return true;
      },
      // Spec 029: the Day Care; growth curve and level-up moves from the species data.
      daycare: () =>
        who.progress.daycare.map((s) => {
          const info = options.progression?.species(s.mon.species);
          const level = info ? grownLevel(s, info.growthRate) : s.mon.level;
          return { species: s.mon.species, nickname: s.mon.nickname, level, gained: level - s.mon.level, gender: s.mon.gender };
        }),
      daycareDeposit(slot) {
        if (!who.progress.party[slot] || who.progress.daycare.length >= 2) return;
        withGender(who.progress.party[slot]);
        deposit(who.progress.party, slot, who.progress.daycare);
        options.changed(who.playerId, "party");
      },
      daycareRetrieve(index) {
        const kept = who.progress.daycare[index];
        const info = kept && options.progression?.species(kept.mon.species);
        if (!kept || !info || who.progress.party.length >= 6) return 0;
        who.progress.party.push(retrieve(who.progress.daycare, index, { rate: info.growthRate, levelUp: options.progression!.levelUp(kept.mon.species) }, (m) => options.hpMax(m)));
        options.changed(who.playerId, "party");
        return kept.mon.species;
      },
      aliveMons: (except) => who.progress.party.filter((m, i) => canFight(m) && i !== except).length,
      // Spec 029.2: the egg.
      daycareEgg: () => who.progress.daycareEgg,
      daycareCompatibility: () => compatibilityScore(daycareCompatibility(who)),
      resetDaycareEgg: () => void (who.progress.daycareEgg = false),
      giveDaycareEgg() {
        const egg = breed(who);
        who.progress.daycareEgg = false;
        if (!egg || who.progress.party.length >= 6) return;
        who.progress.party.push(egg);
        options.changed(who.playerId, "party");
      },
      partyIsEgg: (slot) => who.progress.party[slot]?.egg !== undefined,
      npcTrade: (id) => {
        const t = data.npcTrades?.get(id);
        return t && { give: t.give, ask: t.ask };
      },
      tradeMon: (id, slot) => {
        const old = who.progress.party[slot];
        const m = old && tradeMember(id, old.level);
        if (!m) return;
        who.progress.party[slot] = m;
        received(m.species);
      },
      giveLoanMon: (id, level, mail) => {
        const m = who.progress.party.length < 6 ? tradeMember(id, level) : undefined;
        if (!m) return;
        who.progress.party.push(mail ? { ...m, mail: id } : m);
        received(m.species);
      },
      // shortcut: the mail stays with the member when its item is taken; the original moves it to the PC mailbox, where this check finds it too. Look there when the save has a mailbox.
      hasTradeMail: (id) => who.progress.party.some((m) => m.mail === id),
      // Item 031.7. shortcut: no Ball Capsules yet, so result 3 (a capsule on its ball) never comes; check it with the capsules.
      loanMonCheck: (id, slot) => {
        const m = who.progress.party[slot];
        if (m?.trade !== id) return 1;
        if (m.held !== undefined) return 2;
        return who.progress.party.length === 1 ? 4 : 0;
      },
      returnLoanMon: (slot) => {
        if (!who.progress.party[slot]) return;
        who.progress.party.splice(slot, 1);
        options.changed(who.playerId, "party");
      },
      sealCount: (id) => who.progress.seals?.[String(id)] ?? 0,
      giveSeal: (id, amount) => {
        if (id < 1 || id > SEAL_KINDS) return;
        const seals = (who.progress.seals ??= {});
        const n = Math.max(0, Math.min(SEAL_MAX, (seals[String(id)] ?? 0) + amount));
        if (n === 0) delete seals[String(id)];
        else seals[String(id)] = n;
      },
      partyMoves: (slot) => who.progress.party[slot]?.moves ?? [],
      // PartyMonSetMoveInSlot: the move in the slot (or the first free one), its PP Ups cleared.
      setPartyMove: (slot, moveSlot, move) => {
        const m = who.progress.party[slot];
        if (!m || moveSlot > 3) return;
        const at = Math.min(moveSlot, m.moves.length);
        m.moves[at] = move;
        if (m.ppUps?.[at]) m.ppUps[at] = 0;
        options.changed(who.playerId, "party");
      },
      tutorMoves: (slot, npc) => {
        const m = who.progress.party[slot];
        return m && !m.egg ? (options.progression?.tutorMoves(m.species, npc) ?? []) : [];
      },
      giveEgg: (species, move) => {
        const data = options.progression;
        if (!data?.species(species)) {
          options.log(`Script gives an egg of species ${species} but there is no species data; nothing given`);
          return;
        }
        if (who.progress.party.length >= 6) return;
        const egg = makeGiftEgg(species, { levelUp: (id) => data.levelUp(id), hatchCycles: (id) => data.species(id)?.hatchCycles ?? 0, genderRatio: (id) => data.species(id)?.gender?.raw ?? 255, hpMax: (m) => options.hpMax(m) }, rng, move);
        who.progress.party.push(egg);
        options.changed(who.playerId, "party");
      },
      hatchEgg: () => {
        // Party_GetMonToHatch, then the hatched Pokémon (sub_0206D038): no longer an egg, friendship 120, in the Pokédex.
        const m = who.progress.party.find((p) => p.egg?.cycles === 0);
        if (!m) return undefined;
        delete m.egg;
        m.friendship = 120;
        const dex = who.progress.pokedex;
        if (!dex.seen.includes(m.species)) dex.seen.push(m.species);
        if (!dex.caught.includes(m.species)) dex.caught.push(m.species);
        // sub_02093134: the assistant's Togepi tells Elm (his Everstone, 843 L32).
        // shortcut: MonIsFromTogepiEgg compares the personality GiveTogepiEgg saved; members keep none, so the first Togepi to hatch after the gift counts. Compare it when members get a personality.
        if (m.species === TOGEPI && who.flags.has(FLAG_GOT_TOGEPI_EGG)) writeFlag(s, FLAG_HATCHED_TOGEPI_EGG, true);
        options.changed(who.playerId, "party");
        return m.species;
      },
      // Spec 030.2: ribbons on party members, and Cameron's photo of the party where the player stands.
      monHasRibbon: (slot, ribbon) => who.progress.party[slot]?.ribbons?.includes(ribbon) ?? false,
      giveRibbon(slot, ribbon) {
        const m = who.progress.party[slot];
        if (!m || m.ribbons?.includes(ribbon)) return;
        m.ribbons = [...(m.ribbons ?? []), ribbon];
        options.changed(who.playerId, "party");
      },
      photoAlbumFull: () => who.progress.photos.length >= PHOTO_ALBUM_MAX,
      takePhoto(spot) {
        if (who.progress.photos.length >= PHOTO_ALBUM_MAX) return;
        who.progress.photos.push({ map: Number(me().area), spot, species: who.progress.party.filter((m) => !m.egg).map((m) => m.species), takenAt: options.clock() });
      },
      // Spec 030.3, the Ruins of Alph.
      onBike: () => me().data["mode"] === "bike",
      // shortcut: the save's Pokédex keeps no forms, so a caught Unown counts as one; keep forms in the Pokédex when the puzzles make Unown catchable (Marco 6).
      unownForms: () => (who.progress.pokedex.caught.includes(UNOWN) ? 1 : 0),
      boxMonCount: () => who.progress.boxes.reduce((n, b) => n + b.slots.filter((m) => m !== null).length, 0),
      healParty() {
        for (const m of who.progress.party) m.hp = options.hpMax(m);
        // The nurse makes this Center the blackout respawn point, in front of her counter (spec 023); Mr. Pokémon and Mom heal too, but do not.
        const e = me();
        if (POKEMON_CENTERS.has(e.area)) who.progress.respawn = { area: e.area, x: e.x, y: e.y };
        options.changed(who.playerId, "party");
      },
      trainerFlag: (t) => who.flags.has(trainerFlagBase + t),
      setTrainerFlag: (t, on) => writeFlag(s, trainerFlagBase + t, on),
      battleWon: () => s.won,
      battleOutcome: () => s.outcome,
      hasBadge: (b) => hasBadgeBit(who.progress.badgeSet, b),
      giveBadge: (b) => void (b >= 0 && b < 16 && (who.progress.badgeSet |= 1 << b)),
      // The original answers PARTY_SIZE, not the party's length, and the scripts compare against 6.
      partySlotWithMove: (move) => pickUser(who.progress.party, move, companionOf(s) ? who.progress.party.findIndex(canFight) : undefined) ?? 6,
      strength: () => s.strength,
      setStrength: (on) => void (s.strength = on),
      fieldEncounter(kind) {
        const e = me();
        const front = ahead(e);
        let slots: readonly EncounterSlot[] | undefined;
        if (kind === "rockSmash") {
          const table = options.fieldWild?.encounter(e.area);
          if (!table?.rockSmash || rng.nextInt(100) >= table.rates.rockSmash) return false;
          slots = table.rockSmash;
        } else {
          const trees = data.headbutt?.(Number(e.area));
          const o = origin(e.area);
          const type = trees && headbuttTree(trees, front.x + o.tx, front.y + o.ty, trainerIdOf(who.name ?? ""));
          slots = type && trees[type];
        }
        slots = slots?.filter((slot) => slot.species > 0);
        if (!options.fieldWild || !slots?.length) return false;
        const slot = rollSlot(slots, rng);
        // Out of the rock, on its tile; a tree stays, so the Pokémon drops on the player's tile.
        const at = kind === "rockSmash" ? front : { x: Math.floor(e.x / MAP_TILE_PX), y: Math.floor(e.y / MAP_TILE_PX) };
        return options.fieldWild.spawn(e.area, center(at.x), center(at.y), slot.species, rollLevel(slot, rng));
      },
      rockSmashItem() {
        const record = data.rockSmash?.(Number(me().area));
        const lists = options.rockSmashItems;
        if (!record || !lists) return 0;
        // The companion swinging at the rock adds 5 (followMonUsingHm).
        // shortcut: Suction Cups, Magnet Pull, Keen Eye (+5) and Serene Grace, Super Luck (next place) are left out, the save keeps no ability; add them with abilities.
        const odds = Math.min(100, record.odds + (companionOf(s) && who.progress.party.find(canFight)?.moves.includes(ROCK_SMASH) ? 5 : 0));
        if (rng.nextInt(100) >= odds) return 0;
        let roll = rng.nextInt(100);
        const place = lists.weights.findIndex((w) => (roll -= w) < 0);
        return lists[record.items][place === -1 ? 7 : place]!;
      },
      crossing(kind) {
        const e = me();
        const vertical = e.facing === "north" || e.facing === "south";
        const crosses = (b: number) => (kind === "rockClimb" ? b === (vertical ? 0x4b : 0x4c) : b === (kind === "waterfall" ? 0x13 : 0x11));
        let n = 1;
        while (n < 32 && crosses(ahead(e, n).behavior)) n++;
        return n === 1 ? undefined : { dir: e.facing, count: n };
      },
      playerPosition() {
        const e = me();
        const t = tileOf(e);
        return { ...t, facing: SCRIPT_DIRECTIONS.indexOf(e.facing) };
      },
      warp(map, x, z, facing) {
        const area = String(map);
        if (!lookup(area)) {
          options.log(`Script warp to map ${map}, which does not exist; ignored`);
          return;
        }
        const o = origin(area);
        world.update({ ...me(), area, x: center(x - o.tx), y: center(z - o.ty), level: 0, facing: SCRIPT_DIRECTIONS[facing] ?? me().facing });
      },
      dynamicWarpMap() {
        const map = Number(String(me().data["dynamicWarp"] ?? "").split(":")[0]);
        return Number.isInteger(map) && map > 0 ? map : undefined;
      },
      setDynamicWarp: (map, anchor) => world.update({ ...me(), data: { ...me().data, dynamicWarp: `${map}:${anchor}` } }),
      ride: (path, spider) => void (s.ride = { path, spider, from: tick }),
      placePlayer(x, z, facing) {
        s.ride = undefined;
        const e = me();
        world.update({ ...e, x: center(x), y: center(z), facing: SCRIPT_DIRECTIONS[facing] ?? e.facing });
        // Already on the tile: stepping off a spider onto a stop's trigger must not ride it at once.
        const t = tileOf(me());
        s.tile = `${e.area}:${t.x},${t.z}`;
      },
      azaleaGym: () => data.azaleaGym,
      gymmick: () => s.gymmick,
      setGymmick: (state) => void (s.gymmick = state),
      facePlayer() {
        const npc = s.talkedTo === undefined ? undefined : world.get(s.talkedTo);
        if (npc) world.update({ ...npc, facing: OPPOSITE[me().facing] });
      },
      hidePerson(id) {
        s.shown.set(id, false);
        // Spec 027: an item ball (scr_seq_0141) is gone for good, as the original sets the object's flag when it removes it.
        const flag = s.script?.file === ITEM_BALL_FILE ? eventsOf(me().area)?.npcs.find((n) => n.id === id)?.hideFlag : undefined;
        if (flag) writeFlag(s, flag, true);
      },
      showPerson: (id) => void s.shown.set(id, true),
      // Where this player sees them: Ilex Forest's Farfetch'd (spec 030.7) are found by the tile their last flight left them on.
      personPosition(id) {
        const e = personOf(me().area, id);
        return e && visibleTo(s, e) ? tileOf(viewOf(s, e)) : undefined;
      },
      // Only for this player and kept in their save: the shared person stays put for the others (FR-009).
      movePerson(id, x, z, facing) {
        const area = me().area;
        const e = personOf(area, id);
        if (!e || !who.placement) return;
        s.moved.delete(id);
        (who.placement[area] ??= {})[String(id)] = { x, z, facing: (facing === undefined ? undefined : SCRIPT_DIRECTIONS[facing]) ?? e.facing };
      },
      weekday: () => options.weekday(),
      hour: () => options.hour(),
      registerContact: (id) => options.phone?.register(who.playerId, id),
      isRegistered: (id) => options.phone?.registered(who.playerId, id) ?? false,
      rematch: (id) => options.phone?.rematch(who.playerId, id) ?? 0,
      endRematch: (id) => options.phone?.rematchWon(who.playerId, id),
      scriptedCall: (caller, index) => options.scriptedCall?.(caller, index),
      random16: () => rng.nextInt(0x10000),
      // Props go with the map they are on: a map's onResume runs before the client draws it (spec 024).
      emit: (event) => send(s, { type: "script-event", event: event.kind === "props" ? { ...event, area: s.area ?? "" } : event }),
      createRoamer: (id) => options.createRoamer?.(who.playerId, id),
      // Nothing implements wild battles or marts yet: each ends the script as missing (FR-008).
      bridge: () => false,
      file: (id) => data.file(id),
      resolve: (id) => data.resolve(id, Number(me().area)),
    };
  }

  /** Acts on where the runner stopped: waits, asks the client, or lets the player go. */
  function settle(s: State): void {
    const state = s.runner!.state;
    const where = (m: { file: number; entry: number }) => `player ${s.who.playerId}, script file ${m.file} entry ${m.entry}`;
    switch (state.kind) {
      case "running":
        return;
      case "blocked":
        if (state.request.kind === "wait") {
          s.waitUntil = tick + state.request.ticks;
        } else if (state.request.kind === "battle") {
          if (!options.battle?.(s.who.playerId, state.request.trainer, state.request.partner, state.request.ally ?? 0)) {
            options.log(`Ended a script of player ${s.who.playerId}: trainer battle ${state.request.trainer} could not start`);
            break;
          }
          s.inBattle = true;
          // The player controls their Pokémon until the battle ends.
          lock(s, false);
          return;
        } else if (state.request.kind === "wild") {
          // Out of the person talked to (the overworld Sudowoodo), else the tile ahead.
          const me = world.get(s.who.entityId);
          const talked = s.talkedTo === undefined ? undefined : world.get(s.talkedTo);
          const at = talked ?? (me && { area: me.area, x: me.x + STEP[me.facing][0] * MAP_TILE_PX, y: me.y + STEP[me.facing][1] * MAP_TILE_PX });
          if (!at || !options.wildBattle?.(s.who.playerId, state.request.species, state.request.level, { area: at.area, x: at.x, y: at.y }, state.request.shiny)) {
            options.log(`Ended a script of player ${s.who.playerId}: wild battle ${state.request.species} could not start`);
            break;
          }
          s.wildArea = at.area;
          // The battle replaced the overworld one in the original: it is not there beside the wild one.
          const person = talked?.data["person"];
          if (typeof person === "number") s.shown.set(person, false);
          s.inBattle = true;
          lock(s, false);
          return;
        } else if (state.request.kind === "call") {
          if (!options.phone?.scriptedCall(s.who.playerId, state.request.caller, state.request.script)) {
            options.log(`Ended a script of player ${s.who.playerId}: call ${state.request.caller}:${state.request.script} could not ring`);
            break;
          }
          s.askedAt = tick;
        } else if (state.request.kind === "shop" || state.request.kind === "pc") {
          const r = state.request;
          if (!(r.kind === "shop" ? options.shop?.(s.who.playerId, r.shop, r.sell) : options.pc?.(s.who.playerId))) {
            options.log(`Ended a script of player ${s.who.playerId}: ${r.kind === "shop" ? `shop ${r.shop}` : "the PC"} could not open`);
            break;
          }
          s.inService = true;
          lock(s, true);
          return;
        } else {
          s.asked++;
          s.askedAt = tick;
          send(s, { type: "script", id: s.asked, request: state.request });
        }
        lock(s, true);
        return;
      case "missing":
        options.log(`Ended a script at a missing script command ${state.command} (${where(state)}, command ${state.index})`);
        options.onMissing?.({ command: state.command, file: state.file, entry: state.entry, index: state.index, player: s.who.playerId });
        break;
      case "aborted":
        options.log(`Stopped a script of player ${s.who.playerId}: ${state.reason}`);
        break;
      case "done":
        break;
    }
    if (state.kind !== "done") s.framesOff ||= s.frameRunning;
    finish(s);
  }

  /** A cutscene ended: the player and the people it moved stay where the steps left them. */
  function stage(s: State, steps: readonly CutsceneStep[]): void {
    const me = world.get(s.who.entityId)!;
    // In pixels from where each actor stands, as the client animates them, so the scene ends where it was drawn.
    const at = new Map<string, { x: number; y: number; facing: Direction }>();
    const key = (a: CutsceneActor) => (typeof a === "string" ? a : String(a.person));
    const where = (a: CutsceneActor) => {
      const k = key(a);
      if (!at.has(k)) {
        const e = a === "player" ? me : a === "companion" ? companionOf(s) : personOf(me.area, a.person);
        const v = e && (a === "player" ? e : viewOf(s, e));
        at.set(k, v ? { x: v.x, y: v.y, facing: v.facing } : { x: center(0), y: center(0), facing: "south" });
      }
      return at.get(k)!;
    };
    for (const step of steps) {
      if (step.kind === "walk" || step.kind === "jump" || step.kind === "face") {
        const p = where(step.actor);
        const n = step.kind === "face" ? 0 : step.count;
        p.x += STEP[step.dir][0] * n * MAP_TILE_PX;
        p.y += STEP[step.dir][1] * n * MAP_TILE_PX;
        p.facing = step.dir;
      } else if ((step.kind === "show" || step.kind === "hide") && typeof step.actor === "object") {
        s.shown.set(step.actor.person, step.kind === "show");
      }
    }
    for (const [k, p] of at) {
      const c = k === "companion" ? companionOf(s) : undefined;
      if (k === "player") world.update({ ...me, x: p.x, y: p.y, facing: p.facing });
      else if (c) world.update({ ...c, x: p.x, y: p.y, facing: p.facing });
      else if (k !== "companion") s.moved.set(Number(k), { tx: Math.floor(p.x / MAP_TILE_PX), ty: Math.floor(p.y / MAP_TILE_PX), facing: p.facing });
    }
  }

  /** The player's following Pokémon, when it is out. */
  function companionOf(s: State): Entity | undefined {
    return world.all().find((e) => e.kind === "pokemon" && e.data["owner"] === String(s.who.playerId) && e.data["role"] === "companion");
  }

  /** A person as this player sees it: moved by their cutscene, else by their save. */
  function viewOf(s: State, e: Entity): Entity {
    if (e.kind !== "npc") return e;
    const person = e.data["person"] as number;
    const m = s.moved.get(person);
    if (m) return { ...e, x: center(m.tx), y: center(m.ty), facing: m.facing };
    const p = s.who.placement?.[e.area]?.[String(person)];
    if (!p) return e;
    const o = origin(e.area);
    return { ...e, x: center(p.x - o.tx), y: center(p.z - o.ty), facing: p.facing };
  }

  function finish(s: State): void {
    s.runner = undefined;
    s.waitUntil = undefined;
    s.ride = undefined;
    s.talkedTo = undefined;
    s.frameRunning = false;
    lock(s, false);
    checkFree(s);
  }

  /** The player must be able to walk away from a finished script, by the same rules as movement; else it is logged and they go to the nearest free tile. */
  function checkFree(s: State): void {
    const me = world.get(s.who.entityId);
    if (!me || !lookup(me.area) || !s.script) return;
    const occupied = options.npcs && npcOccupied(world.all().filter((e) => visibleTo(s, e)).map((e) => viewOf(s, e)), me.area);
    const moves = PROBES.some((move) => {
      const n = stepMovement(me, { move, run: false }, lookup, occupied);
      return n.x !== me.x || n.y !== me.y || n.area !== me.area || n.data["warping"] !== me.data["warping"] || n.data["hop"] !== me.data["hop"];
    });
    if (moves) return;
    // The people on or next to the player's tile: a cutscene that ends with someone on top of them shows here.
    const near = (e: Entity) => Math.abs(Math.floor(e.x / MAP_TILE_PX) - Math.floor(me.x / MAP_TILE_PX)) <= 1 && Math.abs(Math.floor(e.y / MAP_TILE_PX) - Math.floor(me.y / MAP_TILE_PX)) <= 1;
    const people = world.all().filter((e) => e.kind === "npc" && e.area === me.area && visibleTo(s, e)).map((e) => viewOf(s, e)).filter(near).map((e) => e.data["person"] as number);
    const freed = unstick(me, lookup);
    if (freed !== me) world.update(freed);
    const t = tileOf(me);
    options.log(`Player ${s.who.playerId} cannot move after script ${s.script.file}:${s.script.entry}, at map ${me.area} (${t.x},${t.z}), people around: [${people.join(", ")}]${freed !== me ? "; moved to the nearest free tile" : ""}`);
    options.onStuck?.({ player: s.who.playerId, ...s.script, area: me.area, x: t.x, z: t.z, people, freed: freed !== me });
  }

  /** Starts a script for this player; false when it cannot (file missing, or one already runs). */
  function start(s: State, ref: { file: number; entry: number }, frame = false, file = data.file(ref.file), vars?: Map<number, number>): boolean {
    if (s.runner) return false;
    if (!file) {
      options.log(`Player ${s.who.playerId}: script file ${ref.file} is not in the extraction`);
      return false;
    }
    // The original moves on a grid: a script starts with the player on their tile's center, so its walks and the people it brings line up.
    const me = world.get(s.who.entityId);
    if (me) world.update({ ...me, x: center(Math.floor(me.x / MAP_TILE_PX)), y: center(Math.floor(me.y / MAP_TILE_PX)) });
    options.onStart?.(s.who.playerId);
    const talked = s.talkedTo === undefined ? undefined : world.get(s.talkedTo)?.data["person"];
    const special = new Map(vars);
    if (typeof talked === "number") special.set(VAR_LAST_TALKED, talked);
    s.runner = createRunner(hostFor(s), SCRIPT_HANDLERS, { file, entry: ref.entry, special: special.size > 0 ? special : undefined });
    s.script = { file: ref.file, entry: ref.entry };
    s.frameRunning = frame;
    s.runner.step();
    settle(s);
    return true;
  }

  /** Spec 030.5: the rider and their spider cart a tick further along the thread. */
  function glide(s: State, e: Entity, ride: NonNullable<State["ride"]>): void {
    const at = rideAt(ride.path, tick - ride.from);
    world.update({ ...e, x: at.x, y: at.z + RIDER_OFFSET_PX, facing: at.facing });
    const gym = data.azaleaGym;
    if (gym && s.gymmick) send(s, { type: "script-event", event: { kind: "props", area: e.area, props: gymProps(gym, s.gymmick, { spider: ride.spider, x: at.x, z: at.z }) } });
  }

  function enterMap(s: State, e: Entity): void {
    s.area = e.area;
    // Triggers fire on a step, as the original's coordinate events: arriving on one (a load, a door, a warp) does not run it,
    // walking over a map's edge onto one does (matrix tiles are shared across the overworld's maps).
    // shortcut: a warp between two maps whose tiles happen to touch counts as a step; tell warps apart if one shows up.
    const t = tileOf(e);
    const [x, z] = (s.tile.split(":")[1] ?? "").split(",").map(Number);
    if (x === undefined || z === undefined || Number.isNaN(x) || Math.abs(x - t.x) + Math.abs(z - t.z) > 1) s.tile = `${e.area}:${t.x},${t.z}`;
    s.shown.clear();
    s.moved.clear();
    s.strength = false;
    s.framesOff = false;
    for (let v = TEMP_VARS.from; v <= TEMP_VARS.to; v++) s.who.vars.delete(v);
    for (let f = MAPTEMP_FLAGS.from; f <= MAPTEMP_FLAGS.to; f++) s.who.flags.delete(f);
    spawnPeople(e.area);
    const level = eventsOf(e.area)?.levelScripts;
    // Each runs to its end before the next; a blocking one keeps the rest for after it (rare in the original).
    // onResume runs on every return to the field, the first included (it places the starter balls, spec 024).
    for (const ref of [level?.onTransition, level?.onLoad, level?.onResume]) if (ref && !s.runner) start(s, ref);
  }

  function frameScript(s: State, area: string): ScriptRef | undefined {
    return eventsOf(area)?.levelScripts.frames.find((f) => frameMet(s, f))?.script;
  }

  /** The debugger's panels for the player's map, from the checks the game itself makes (research R6). */
  function panels(s: State): Pick<DebugView, "objects" | "triggers"> {
    const area = s.area ?? "";
    const events = eventsOf(area);
    if (!events) return { objects: [], triggers: [] };
    const objects = events.npcs.map((n) => {
      const e = personOf(area, n.id);
      return { id: n.id, sprite: n.sprite, hideFlag: n.hideFlag || null, visible: e !== undefined && visibleTo(s, e) };
    });
    const frames = events.levelScripts.frames.map((f) => ({
      kind: "mapScript" as const,
      script: scriptName(f.script.file, f.script.entry),
      condition: `var ${hex(f.variable)} = ${f.value >= 0x4000 ? `var ${hex(f.value)}` : f.value}`,
      met: frameMet(s, f),
    }));
    const triggers = events.triggers.flatMap((g) =>
      g.script ? [{ kind: "trigger" as const, script: scriptName(g.script.file, g.script.entry), condition: `var ${hex(g.variable)} = ${g.value} @ (${g.x}, ${g.z}) ${g.w}×${g.h}`, met: triggerMet(s, g) }] : [],
    );
    return { objects, triggers: [...frames, ...triggers] };
  }

  function interact(s: State): boolean {
    const e = world.get(s.who.entityId)!;
    const [dx, dy] = STEP[e.facing];
    const front = { x: Math.floor(e.x / MAP_TILE_PX) + dx, y: Math.floor(e.y / MAP_TILE_PX) + dy };
    // Across a counter, as the original does for clerks and nurses.
    if (isCounter(tileAt(lookup, e.area, e.level, front.x * MAP_TILE_PX + MAP_TILE_PX / 2, front.y * MAP_TILE_PX + MAP_TILE_PX / 2))) {
      front.x += dx;
      front.y += dy;
    }
    // A PC tile runs the PC's common script, as the original does from the tile's behavior.
    if (isPc(tileAt(lookup, e.area, e.level, front.x * MAP_TILE_PX + MAP_TILE_PX / 2, front.y * MAP_TILE_PX + MAP_TILE_PX / 2))) {
      const ref = data.resolve(PC_SCRIPT, Number(e.area));
      return ref ? start(s, ref) : false;
    }
    const npc = world
      .all()
      .map((n) => viewOf(s, n))
      .find((n) => n.kind === "npc" && n.area === e.area && Math.floor(n.x / MAP_TILE_PX) === front.x && Math.floor(n.y / MAP_TILE_PX) === front.y && visibleTo(s, n));
    const events = eventsOf(e.area);
    if (npc) {
      const person = events?.npcs.find((n) => n.id === npc.data["person"]);
      // Trainers run the battle rules, not a script of their own.
      if (person?.trainer && options.talkTrainer) return options.talkTrainer(s.who.playerId, npc);
      const ref = person?.script;
      if (!ref) return false;
      // Before the first step: FacePlayer usually runs in it.
      s.talkedTo = npc.id;
      if (start(s, ref)) return true;
      s.talkedTo = undefined;
      return false;
    }
    const o = origin(e.area);
    const sign = events?.signs.find((g) => g.script && g.x - o.tx === front.x && g.z - o.ty === front.y);
    if (sign?.script && sign.kind === HIDDEN_SIGN) {
      // Spec 027: a hidden item, found on its exact tile; gone for this player once its flag is set.
      const hidden = hiddenOf(sign.script.id);
      if (!hidden || s.who.flags.has(hidden.flag)) return false;
      return start(s, sign.script, false, undefined, new Map([[HIDDEN_VARS[0], hidden.item], [HIDDEN_VARS[1], hidden.count], [HIDDEN_VARS[2], hidden.flag]]));
    }
    if (sign?.script) return start(s, sign.script);
    // Spec 025: a headbutt tree, rock wall, waterfall or whirlpool runs its field-move script.
    const behavior = (tileAt(lookup, e.area, e.level, center(front.x), center(front.y))?.raw ?? 0) & 0xff;
    const id = TILE_SCRIPTS.get(behavior);
    if (id === undefined || (FROM_WATER.has(behavior) && tileAt(lookup, e.area, e.level, e.x, e.y)?.category !== "water")) return false;
    const ref = data.resolve(id, Number(e.area));
    return ref ? start(s, ref) : false;
  }

  return {
    join(who: Storyteller): void {
      const s: State = { who, runner: undefined, script: undefined, asked: 0, askedAt: 0, waitUntil: undefined, locked: false, talkedTo: undefined, area: undefined, tile: "", walkedFrom: undefined, shown: new Map(), moved: new Map(), framesOff: false, resume: false, frameRunning: false, debug: false, lastDebug: "", inBattle: false, inService: false, won: false, outcome: 0, wildArea: undefined, strength: false, gymmick: undefined, ride: undefined, changes: [] };
      states.set(who.playerId, s);
      // Spec 024: a story not yet started runs _std_init to its end before any map, as RunInitScript does.
      const init = who.init && data.newGame ? data.resolve(data.newGame.initScript, data.newGame.map) : undefined;
      if (init) {
        start(s, init);
        if (s.runner) {
          options.log(`Player ${who.playerId}: the new-game init script stopped before its end`);
          finish(s);
        }
      }
    },
    leave(playerId: number): void {
      states.delete(playerId);
    },
    busy: (playerId: number) => states.get(playerId)?.runner !== undefined,
    /** A shop or the PC the script opened is open: what the player trades there is saved at once (spec 024). */
    inService: (playerId: number) => states.get(playerId)?.inService === true,
    /** In a script and not fighting its trainer battle: out of reach of combat (spec 021, US4). */
    sheltered(playerId: number): boolean {
      const s = states.get(playerId);
      return s?.runner !== undefined && !s.inBattle;
    },
    /** True when the input is the script's: the player is locked, or interact started a script. */
    input(playerId: number, input: PlayerInput | undefined, pressed: number, now: number): boolean {
      tick = now;
      const s = states.get(playerId);
      if (!s) return false;
      if (s.runner) return !s.inBattle;
      return input !== undefined && (pressed & BUTTON.interact) !== 0 && interact(s);
    },
    /** Ends the running script where it stands, for "Estou preso"; false while it waits on a battle, a shop or the PC. */
    abort(playerId: number): boolean {
      const s = states.get(playerId);
      if (s?.inBattle || s?.inService) return false;
      if (s?.runner) {
        s.framesOff ||= s.frameRunning;
        finish(s);
      }
      return true;
    },
    /** The player left the shop or the PC a script waited on. */
    serviceClosed(playerId: number): void {
      const s = states.get(playerId);
      if (!s?.inService) return;
      s.inService = false;
      s.runner!.resume();
      settle(s);
    },
    /** The trainer battle a script waited on is over: CheckBattleWon reads `won`. */
    battleEnded(playerId: number, won: boolean): void {
      const s = states.get(playerId);
      if (!s) return;
      s.won = won;
      if (!s.inBattle) return;
      s.inBattle = false;
      s.runner!.resume();
      settle(s);
    },
    /**
     * Spec 030.9: the wild battle a script waited on is over (`outcome` as BattleOutcome). The original's field comes back
     * from the battle before the script goes on: the map's onLoad runs first (it hides a static Pokémon by its flag).
     */
    wildBattleEnded(playerId: number, outcome: number): void {
      const s = states.get(playerId);
      if (!s?.inBattle) return;
      s.inBattle = false;
      s.won = outcome !== OUTCOME_LOST;
      s.outcome = outcome;
      const onLoad = s.wildArea === undefined ? undefined : eventsOf(s.wildArea)?.levelScripts.onLoad;
      const file = onLoad && data.file(onLoad.file);
      // shortcut: a blocking command in it would just stop it there; none of the onLoad scripts after battles block.
      if (onLoad && file) createRunner(hostFor(s), SCRIPT_HANDLERS, { file, entry: onLoad.entry }).step();
      s.runner!.resume();
      settle(s);
    },
    /** Spec 026: a trainer offers their phone number; false when a script already runs. */
    offerNumber(playerId: number, contact: number, bank: number, again: boolean): boolean {
      const s = states.get(playerId);
      if (!s || s.runner) return false;
      const file = numberOffer(contact, bank, again);
      return start(s, { file: file.file, entry: 0 }, false, file);
    },
    /** The player hung up the call a script placed (spec 026): the script goes on. */
    callEnded(playerId: number): void {
      const s = states.get(playerId);
      if (s?.runner?.state.kind !== "blocked" || s.runner.state.request.kind !== "call") return;
      s.runner.resume();
      settle(s);
    },
    /** The trainer behind a person entity, with its sight range in tiles (spec 022, research R1). */
    trainerOf(e: Entity): { trainer: number; sightTiles: number } | undefined {
      if (e.kind !== "npc") return undefined;
      const n = eventsOf(e.area)?.npcs.find((p) => p.id === e.data["person"]);
      return n?.trainer ? { trainer: n.trainer, sightTiles: n.param[0] } : undefined;
    },
    answer(playerId: number, id: number, answer: number | undefined, text?: string): void {
      const s = states.get(playerId);
      const request = s?.runner?.state.kind === "blocked" ? s.runner.state.request : undefined;
      if (!s || !request || request.kind === "wait" || id !== s.asked) {
        options.log(`Discarded script-answer ${id} from player ${playerId}: nothing waits for it`);
        return;
      }
      if (request.kind === "cutscene") stage(s, request.steps);
      if (request.kind === "starter") s.resume = true;
      s.runner!.resume(answer, text);
      settle(s);
    },
    /** After movement: map entry, triggers, the frame table, waits and timeouts. */
    step(now: number): void {
      tick = now;
      for (const s of states.values()) {
        const e = world.get(s.who.entityId);
        if (!e) continue;
        // A ring (item V.3) is no new map: back from it, the building's people, flags and level scripts are as they were.
        if (e.area !== s.area && ringSource(e.area) === undefined) enterMap(s, e);
        if (s.runner) {
          s.walkedFrom = undefined;
          if (s.ride) glide(s, e, s.ride);
          const state = s.runner.state;
          if (s.waitUntil !== undefined && tick >= s.waitUntil) {
            s.waitUntil = undefined;
            s.runner.resume();
            settle(s);
          // A battle, a shop and the PC always end (on their own or when the player leaves) and may well outlast the timeout.
          } else if (state.kind === "blocked" && !OPEN_ENDED.has(state.request.kind) && tick - s.askedAt >= timeout) {
            options.log(`Player ${s.who.playerId}: script timed out waiting for ${state.request.kind}`);
            finish(s);
          }
          continue;
        }
        if (s.resume) {
          s.resume = false;
          const ref = eventsOf(e.area)?.levelScripts.onResume;
          if (ref && start(s, ref)) continue;
        }
        // After the map's own entry scripts, before anything the player walks into.
        if (s.who.intro && options.intro) {
          s.who.intro = false;
          start(s, { file: INTRO_SCRIPT.file, entry: 0 }, false, INTRO_SCRIPT);
          continue;
        }
        // Spec 029.4: the distance walked on the same map, outside scripts, is the eggs' step counter.
        const from = s.walkedFrom;
        s.walkedFrom = { area: e.area, x: e.x, y: e.y };
        if (from?.area === e.area && (from.x !== e.x || from.y !== e.y)) {
          const party = s.who.progress.party;
          const speedsUp = cyclesToSubtract(party, (id) => options.progression?.species(id)?.abilities ?? []) === 2;
          const walked = eggWalk(s.who.progress.eggWalk, Math.hypot(e.x - from.x, e.y - from.y), party, speedsUp);
          s.who.progress.eggWalk = walked.px;
          if (walked.hatch !== undefined) {
            const ref = data.resolve(HATCH_SCRIPT, Number(e.area));
            if (ref && start(s, ref)) continue;
            options.log(`Player ${s.who.playerId}: an egg is due to hatch but the hatch script is not in the extraction`);
          }
        }
        const t = tileOf(e);
        const key = `${e.area}:${t.x},${t.z}`;
        if (key !== s.tile) {
          // Spec 029: a tile walked on the same map is a step for the Day Care (HandleDaycareStep); a warp is not.
          // shortcut: a tile left during a cutscene counts as one step once it ends; count none when scripted moves report their tiles.
          if (s.tile.startsWith(`${e.area}:`)) {
            const d = s.who.progress.daycare;
            daycareStep(d);
            // HandleDaycareStep: the egg roll on the second Pokémon's 255th step of every 256.
            if (eggCheckDue(d, s.who.progress.daycareEgg) && eggRoll(daycareCompatibility(s.who), rng.nextInt(0x10000))) s.who.progress.daycareEgg = true;
          }
          s.tile = key;
          const trigger = eventsOf(e.area)?.triggers.find((g) => g.script && t.x >= g.x && t.x < g.x + g.w && t.z >= g.z && t.z < g.z + g.h && triggerMet(s, g));
          if (trigger?.script && start(s, trigger.script)) continue;
        }
        const frame = s.framesOff ? undefined : frameScript(s, e.area);
        if (frame) start(s, frame, true);
      }
    },
    /**
     * Strength (spec 025): walking into a boulder pushes it a tile, for this player only, when the tile beyond is free.
     * An ice block (item 032.6) needs no Strength and slides on over the ice like the player.
     */
    push(playerId: number, input: PlayerInput | undefined): void {
      const s = states.get(playerId);
      const move = input?.move;
      if (!s || s.runner || !move || (move.x === 0 && move.y === 0)) return;
      const me = world.get(s.who.entityId)!;
      const dir: Direction = Math.abs(move.x) >= Math.abs(move.y) ? (move.x > 0 ? "east" : "west") : move.y > 0 ? "south" : "north";
      const [dx, dy] = STEP[dir];
      const tx = Math.floor(me.x / MAP_TILE_PX) + dx;
      const ty = Math.floor(me.y / MAP_TILE_PX) + dy;
      // Only once the player is up against it: past their tile's center towards the boulder.
      if ((me.x - center(tx - dx)) * dx + (me.y - center(ty - dy)) * dy < 0) return;
      const seen = world.all().filter((n) => n.kind === "npc" && n.area === me.area && visibleTo(s, n)).map((n) => viewOf(s, n));
      const at = (x: number, y: number) => seen.find((n) => Math.floor(n.x / MAP_TILE_PX) === x && Math.floor(n.y / MAP_TILE_PX) === y);
      const boulder = at(tx, ty);
      const person = boulder?.data["person"];
      const npc = typeof person === "number" ? eventsOf(me.area)?.npcs.find((n) => n.id === person) : undefined;
      const iceBlock = npc?.sprite === ICE_BLOCK_SPRITE && !npc.script;
      if (!npc || !(iceBlock || (s.strength && npc.script?.id === STRENGTH_SCRIPT))) return;
      const cell = (x: number, y: number) => tileAt(lookup, me.area, me.level, center(x), center(y));
      const free = (x: number, y: number) => {
        const c = cell(x, y);
        return !!c && c.category !== "blocked" && c.category !== "water" && c.category !== "ledge" && !at(x, y);
      };
      if (!free(tx + dx, ty + dy)) return;
      let [bx, by] = [tx + dx, ty + dy];
      if (iceBlock) while (isIce(cell(bx, by)) && free(bx + dx, by + dy)) [bx, by] = [bx + dx, by + dy];
      s.moved.set(npc.id, { tx: bx, ty: by, facing: boulder!.facing });
    },
    /** Whether this player sees the entity: people follow the player's own flags (principle VII). */
    /** Spec 027: the hidden items still there for this player on their map, at their tiles' centers (the Dowsing MCHN). */
    hidden(playerId: number): { x: number; y: number }[] {
      const s = states.get(playerId);
      const e = s && world.get(s.who.entityId);
      if (!s || !e) return [];
      const o = origin(e.area);
      return (eventsOf(e.area)?.signs ?? []).flatMap((g) => {
        const h = g.kind === HIDDEN_SIGN && g.script ? hiddenOf(g.script.id) : undefined;
        return h && !s.who.flags.has(h.flag) ? [{ x: center(g.x - o.tx), y: center(g.z - o.ty) }] : [];
      });
    },
    visible(playerId: number, e: Entity): boolean {
      const s = states.get(playerId);
      return !s || visibleTo(s, e);
    },
    /** The entity as this player sees it: sprite ids 101 to 116 take the sprite in the player's variable 0x4020 + n (spec 021). */
    view(playerId: number, e: Entity): Entity {
      const s0 = states.get(playerId);
      if (s0) e = viewOf(s0, e);
      const sprite = e.data["sprite"];
      if (e.kind !== "npc" || typeof sprite !== "number" || sprite < VAR_SPRITE_FIRST || sprite > VAR_SPRITE_LAST) return e;
      const s = states.get(playerId);
      // As in the original, an unset variable is 0: sprite 0, the hero.
      return s ? { ...e, data: { ...e.data, sprite: s.who.vars.get(VAR_SPRITE_BASE + sprite - VAR_SPRITE_FIRST) ?? 0 } } : e;
    },
    debug(playerId: number, on: boolean): void {
      const s = states.get(playerId);
      if (s) {
        s.debug = on;
        s.lastDebug = "";
      }
    },
    setFlag(playerId: number, flag: number, on: boolean): void {
      const s = states.get(playerId);
      if (!s?.debug || !options.devTools) {
        options.log(`Refused debugSetFlag from player ${playerId}: the script debugger is off or this is not a development build`);
        return;
      }
      writeFlag(s, flag, on, "dev");
    },
    /** Development and the golden path (spec 024): a teleport to a map tile, in the script warp's coordinates. */
    warp(playerId: number, map: number, tx: number, ty: number): void {
      const s = states.get(playerId);
      const area = String(map);
      if (!s?.debug || !options.devTools || s.runner || !lookup(area)) {
        options.log(`Refused debugWarp from player ${playerId}: the script debugger is off, this is not a development build, a script runs or map ${map} does not exist`);
        return;
      }
      const o = origin(area);
      world.update({ ...world.get(s.who.entityId)!, area, x: center(tx - o.tx), y: center(ty - o.ty), level: 0 });
    },
    /** Development and the golden path (spec 024): every party member's HP, capped at its maximum. */
    setHp(playerId: number, hp: number): void {
      const s = states.get(playerId);
      if (!s?.debug || !options.devTools) {
        options.log(`Refused debugSetHp from player ${playerId}: the script debugger is off or this is not a development build`);
        return;
      }
      for (const m of s.who.progress.party) m.hp = Math.min(hp, options.hpMax(m));
      options.changed(playerId, "party");
    },
    /** Development (spec 025): earns a badge without the gym. */
    /** The gate of the development commands the session runs itself (spec 026, debugSetClock); logs a refusal. */
    allowDev: (playerId: number, command: string): boolean => devState(playerId, command) !== undefined,
    giveBadge(playerId: number, badge: number): void {
      const s = devState(playerId, "debugGiveBadge");
      if (s) s.who.progress.badgeSet |= 1 << badge;
    },
    /** Development (spec 025): the move joins the member's moves, or takes the last slot when it knows four. */
    teachMove(playerId: number, slot: number, move: number): void {
      const s = devState(playerId, "debugTeachMove");
      const mon = s?.who.progress.party[slot];
      // A move it already knows stays where it is: the move list keys on the move id.
      if (!mon || mon.moves.includes(move)) return;
      if (mon.moves.length < 4) mon.moves.push(move);
      else mon.moves[3] = move;
      options.changed(playerId, "party");
    },
    /** Development (spec 025): items into the bag. */
    giveItem(playerId: number, item: number, count: number): void {
      const s = devState(playerId, "debugGiveItem");
      if (!s) return;
      const bag = s.who.progress.bag;
      const row = bag.find((b) => b.item === item);
      if (row) row.count = Math.min(999, row.count + count);
      else bag.push({ item, count });
      options.changed(playerId, "bag");
    },
    /** The debugger's view, for clients that asked, only when it changed. */
    sendDebug(): void {
      for (const s of states.values()) {
        if (!s.debug) continue;
        const msg = {
          type: "script-debug",
          at: s.runner?.snapshot() ?? null,
          flags: [...s.who.flags].sort((a, b) => a - b),
          vars: Object.fromEntries([...s.who.vars].sort(([a], [b]) => a - b).map(([k, v]) => [String(k), v])),
          ...panels(s),
          changes: s.changes,
        } satisfies ServerMessage;
        const json = JSON.stringify(msg);
        if (json === s.lastDebug) continue;
        s.lastDebug = json;
        send(s, msg);
      }
    },
  };
}

export type Scripts = ReturnType<typeof createScripts>;
