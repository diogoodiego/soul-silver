import type { MapEventsFile, ScriptFile, ScriptRef } from "@soulsilver/shared/events";
import { createRng, tileAt, type Entity, type PlayerInput, type ServerMessage, type WorldLookup, BUTTON } from "@soulsilver/shared/game";
import { isCounter, isPc, MAP_TILE_PX, type Direction } from "@soulsilver/shared/maps";
import { starterMember } from "@soulsilver/shared/progression";
import { store } from "@soulsilver/shared/pc";
import type { PartyMember, Save } from "@soulsilver/shared/save";
import type { CutsceneActor, CutsceneStep } from "@soulsilver/shared/npc";
import { createRunner, SCRIPT_DIRECTIONS, SCRIPT_HANDLERS, type MissingCommand, type Runner, type ScriptHost } from "@soulsilver/shared/script";
import type { Npcs } from "./npcs";
import type { ProgressionData } from "./progression";
import type { World } from "./world";

// Event scripts per player (spec 020): what starts them, the effects they have on that player's
// progress, and which people each player sees. The interpreter itself is @soulsilver/shared/script.

/** The extracted scripts and events; the host reads them from disk (server-host/scripts-loader.ts). */
export interface ScriptData {
  file(id: number): ScriptFile | undefined;
  events(map: number): MapEventsFile | undefined;
  /** Where a script id leads from `map` (global ids ignore the map). */
  resolve(scriptId: number, map: number): { file: number; entry: number } | undefined;
}

/** Temporary variables and map flags the game clears on every map change (vars.h, flags.h). */
const TEMP_VARS = { from: 0x4000, to: 0x401f };
const MAPTEMP_FLAGS = { from: 0x1, to: 0x40 };
/** A script waits this long for an answer before the player is let go: 60 s at 20 Hz. */
export const SCRIPT_TIMEOUT_TICKS = 1200;
const STEP: Record<Direction, [number, number]> = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
const OPPOSITE: Record<Direction, Direction> = { north: "south", south: "north", west: "east", east: "west" };
const BAG_MAX = 999;
/** Map sprites chosen by script variable (the field table has no entry for them). */
const VAR_SPRITE_FIRST = 101;
const VAR_SPRITE_LAST = 116;
const VAR_SPRITE_BASE = 0x4020;
const MONEY_MAX = 999999;
/**
 * Prof. Oak's introduction (text bank 219). In the original it is a screen of its own, not a field
 * script; here its speech runs as one, minus the gender and name questions the new-game menu asked.
 */
const INTRO_BANK = 219;
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

/** Default of content/trainer/tuning.json trainerFlagBase, for sessions without trainer data. */
const TRAINER_FLAG_BASE = 1360;

export interface Storyteller {
  playerId: number;
  entityId: number;
  character: Save["character"];
  flags: Set<number>;
  vars: Map<number, number>;
  /** Where scripts moved people for good, the save's npcPlacement (spec 021); mutated in place. */
  placement?: Save["npcPlacement"] | undefined;
  /** A save that was just created: Prof. Oak's introduction runs once on entering the world (spec 021, FR-011). */
  intro?: boolean | undefined;
  progress: Pick<Save, "party" | "boxes" | "bag" | "money" | "badges" | "pokedex" | "respawn">;
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
  weekday(): number;
  timeoutTicks?: number | undefined;
  /** Runs Prof. Oak's introduction for saves that were just created (off in tests that do not ask for it). */
  intro?: boolean | undefined;
  /** Development builds: the debugger may change flags. */
  devTools?: boolean | undefined;
  /** After the party or the bag changed, so the client gets them again. */
  changed(playerId: number, what: "party" | "bag"): void;
  onMissing?: ((m: MissingCommand & { player: number }) => void) | undefined;
  /** Starts a scripted trainer battle (spec 022); false when there is none to start. The script waits for battleEnded. */
  battle?: ((playerId: number, trainer: number, partner: number) => boolean) | undefined;
  /** Opens a Poké Mart (spec 023); false when there is none. The script waits for serviceClosed. */
  shop?: ((playerId: number, shop: number, sell: boolean) => boolean) | undefined;
  /** Opens the Pokémon PC (spec 023); the script waits for serviceClosed. */
  pc?: ((playerId: number) => boolean) | undefined;
  /** Talking to a trainer (spec 022): it challenges or says its after line; true when handled. */
  talkTrainer?: ((playerId: number, npc: Entity) => boolean) | undefined;
  /** Defeated trainer t is flag trainerFlagBase + t (spec 022, content/trainer/tuning.json). */
  trainerFlagBase?: number | undefined;
  log(message: string): void;
}

interface State {
  who: Storyteller;
  runner: Runner | undefined;
  /** Id of the request the client must answer; ids only grow. */
  asked: number;
  askedAt: number;
  waitUntil: number | undefined;
  locked: boolean;
  /** The person talked to, for FacePlayer. */
  talkedTo: number | undefined;
  area: string | undefined;
  tile: string;
  /** HidePerson / ShowPerson for this visit of the map, by person id. */
  shown: Map<number, boolean>;
  /** Where cutscenes left people for this visit of the map, in map tiles, by person id. */
  moved: Map<number, { tx: number; ty: number; facing: Direction }>;
  /** The frame table stops after one of its scripts failed, until the map is entered again. */
  framesOff: boolean;
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
}

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

  function send(s: State, msg: ServerMessage): void {
    s.who.send(msg);
  }

  function lock(s: State, locked: boolean): void {
    if (s.locked === locked) return;
    s.locked = locked;
    send(s, { type: "script-lock", locked });
  }

  function hostFor(s: State): ScriptHost {
    const { who } = s;
    const me = () => world.get(who.entityId)!;
    const bagRow = (item: number) => who.progress.bag.find((b) => b.item === item);
    return {
      character: who.character,
      flag: (id) => who.flags.has(id),
      setFlag: (id, on) => void (on ? who.flags.add(id) : who.flags.delete(id)),
      getVar: (id) => who.vars.get(id) ?? 0,
      setVar: (id, v) => void (v === 0 ? who.vars.delete(id) : who.vars.set(id, v)),
      money: () => who.progress.money,
      addMoney: (n) => void (who.progress.money = Math.max(0, Math.min(MONEY_MAX, who.progress.money + n))),
      hasItem: (item, count) => (bagRow(item)?.count ?? 0) >= count,
      hasSpaceForItem: (item, count) => (bagRow(item)?.count ?? 0) + count <= BAG_MAX,
      giveItem(item, count) {
        if (item < 1 || (bagRow(item)?.count ?? 0) + count > BAG_MAX) return false;
        const row = bagRow(item);
        if (row) row.count += count;
        else who.progress.bag.push({ item, count });
        options.changed(who.playerId, "bag");
        return true;
      },
      takeItem(item, count) {
        const row = bagRow(item);
        if (!row || row.count < count) return false;
        row.count -= count;
        if (row.count === 0) who.progress.bag.splice(who.progress.bag.indexOf(row), 1);
        options.changed(who.playerId, "bag");
        return true;
      },
      partyCount: () => who.progress.party.length,
      partySpecies: (slot) => who.progress.party[slot]?.species ?? 0,
      partyLeadAlive() {
        const i = who.progress.party.findIndex((m) => m.hp > 0);
        return i === -1 ? who.progress.party.length : i;
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
      healParty() {
        for (const m of who.progress.party) m.hp = options.hpMax(m);
        // The nurse makes this Center the blackout respawn point, in front of her counter (spec 023).
        const e = me();
        who.progress.respawn = { area: e.area, x: e.x, y: e.y };
        options.changed(who.playerId, "party");
      },
      // shortcut: the save keeps a badge count, not which badges; Johto's are earned in order until a spec needs the set.
      trainerFlag: (t) => who.flags.has(trainerFlagBase + t),
      setTrainerFlag: (t, on) => void (on ? who.flags.add(trainerFlagBase + t) : who.flags.delete(trainerFlagBase + t)),
      battleWon: () => s.won,
      hasBadge: (b) => b < who.progress.badges,
      giveBadge: (b) => void (who.progress.badges = Math.max(who.progress.badges, Math.min(16, b + 1))),
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
      facePlayer() {
        const npc = s.talkedTo === undefined ? undefined : world.get(s.talkedTo);
        if (npc) world.update({ ...npc, facing: OPPOSITE[me().facing] });
      },
      hidePerson: (id) => void s.shown.set(id, false),
      showPerson: (id) => void s.shown.set(id, true),
      personPosition(id) {
        const e = personOf(me().area, id);
        return e && visibleTo(s, e) ? tileOf(e) : undefined;
      },
      // Only for this player and kept in their save: the shared person stays put for the others (FR-009).
      movePerson(id, x, z, facing) {
        const area = me().area;
        const e = personOf(area, id);
        if (!e || !who.placement) return;
        s.moved.delete(id);
        (who.placement[area] ??= {})[String(id)] = { x, z, facing: SCRIPT_DIRECTIONS[facing] ?? e.facing };
      },
      weekday: () => options.weekday(),
      emit: (event) => send(s, { type: "script-event", event }),
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
          if (!options.battle?.(s.who.playerId, state.request.trainer, state.request.partner)) {
            options.log(`Ended a script of player ${s.who.playerId}: trainer battle ${state.request.trainer} could not start`);
            break;
          }
          s.inBattle = true;
          // The player controls their Pokémon until the battle ends.
          lock(s, false);
          return;
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
    const at = new Map<string, { tx: number; ty: number; facing: Direction }>();
    const key = (a: CutsceneActor) => (typeof a === "string" ? a : String(a.person));
    const where = (a: CutsceneActor) => {
      const k = key(a);
      if (!at.has(k)) {
        const e = a === "player" ? me : a === "companion" ? companionOf(s) : personOf(me.area, a.person);
        const v = e && (a === "player" ? e : viewOf(s, e));
        at.set(k, v ? { tx: Math.floor(v.x / MAP_TILE_PX), ty: Math.floor(v.y / MAP_TILE_PX), facing: v.facing } : { tx: 0, ty: 0, facing: "south" });
      }
      return at.get(k)!;
    };
    for (const step of steps) {
      if (step.kind === "walk" || step.kind === "jump" || step.kind === "face") {
        const p = where(step.actor);
        const n = step.kind === "face" ? 0 : step.count;
        p.tx += STEP[step.dir][0] * n;
        p.ty += STEP[step.dir][1] * n;
        p.facing = step.dir;
      } else if ((step.kind === "show" || step.kind === "hide") && typeof step.actor === "object") {
        s.shown.set(step.actor.person, step.kind === "show");
      }
    }
    for (const [k, p] of at) {
      const c = k === "companion" ? companionOf(s) : undefined;
      if (k === "player") world.update({ ...me, x: center(p.tx), y: center(p.ty), facing: p.facing });
      else if (c) world.update({ ...c, x: center(p.tx), y: center(p.ty), facing: p.facing });
      else if (k !== "companion") s.moved.set(Number(k), p);
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
    s.talkedTo = undefined;
    s.frameRunning = false;
    lock(s, false);
  }

  /** Starts a script for this player; false when it cannot (file missing, or one already runs). */
  function start(s: State, ref: { file: number; entry: number }, frame = false, file = data.file(ref.file)): boolean {
    if (s.runner) return false;
    if (!file) {
      options.log(`Player ${s.who.playerId}: script file ${ref.file} is not in the extraction`);
      return false;
    }
    s.runner = createRunner(hostFor(s), SCRIPT_HANDLERS, { file, entry: ref.entry });
    s.frameRunning = frame;
    s.runner.step();
    settle(s);
    return true;
  }

  function enterMap(s: State, e: Entity): void {
    s.area = e.area;
    s.shown.clear();
    s.moved.clear();
    s.framesOff = false;
    for (let v = TEMP_VARS.from; v <= TEMP_VARS.to; v++) s.who.vars.delete(v);
    for (let f = MAPTEMP_FLAGS.from; f <= MAPTEMP_FLAGS.to; f++) s.who.flags.delete(f);
    spawnPeople(e.area);
    const level = eventsOf(e.area)?.levelScripts;
    // Each runs to its end before the next; a blocking one keeps the rest for after it (rare in the original).
    for (const ref of [level?.onTransition, level?.onLoad]) if (ref && !s.runner) start(s, ref);
  }

  function frameScript(s: State, area: string): ScriptRef | undefined {
    const read = (v: number) => (v >= 0x4000 ? (s.who.vars.get(v) ?? 0) : v);
    return eventsOf(area)?.levelScripts.frames.find((f) => (s.who.vars.get(f.variable) ?? 0) === read(f.value))?.script;
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
    return sign?.script ? start(s, sign.script) : false;
  }

  return {
    join(who: Storyteller): void {
      states.set(who.playerId, { who, runner: undefined, asked: 0, askedAt: 0, waitUntil: undefined, locked: false, talkedTo: undefined, area: undefined, tile: "", shown: new Map(), moved: new Map(), framesOff: false, frameRunning: false, debug: false, lastDebug: "", inBattle: false, inService: false, won: false });
    },
    leave(playerId: number): void {
      states.delete(playerId);
    },
    busy: (playerId: number) => states.get(playerId)?.runner !== undefined,
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
    /** The trainer behind a person entity, with its sight range in tiles (spec 022, research R1). */
    trainerOf(e: Entity): { trainer: number; sightTiles: number } | undefined {
      if (e.kind !== "npc") return undefined;
      const n = eventsOf(e.area)?.npcs.find((p) => p.id === e.data["person"]);
      return n?.trainer ? { trainer: n.trainer, sightTiles: n.param[0] } : undefined;
    },
    answer(playerId: number, id: number, answer: number | undefined): void {
      const s = states.get(playerId);
      const request = s?.runner?.state.kind === "blocked" ? s.runner.state.request : undefined;
      if (!s || !request || request.kind === "wait" || id !== s.asked) {
        options.log(`Discarded script-answer ${id} from player ${playerId}: nothing waits for it`);
        return;
      }
      if (request.kind === "cutscene") stage(s, request.steps);
      s.runner!.resume(answer);
      settle(s);
    },
    /** After movement: map entry, triggers, the frame table, waits and timeouts. */
    step(now: number): void {
      tick = now;
      for (const s of states.values()) {
        const e = world.get(s.who.entityId);
        if (!e) continue;
        if (e.area !== s.area) enterMap(s, e);
        if (s.runner) {
          const state = s.runner.state;
          if (s.waitUntil !== undefined && tick >= s.waitUntil) {
            s.waitUntil = undefined;
            s.runner.resume();
            settle(s);
          } else if (state.kind === "blocked" && state.request.kind !== "wait" && tick - s.askedAt >= timeout) {
            options.log(`Player ${s.who.playerId}: script timed out waiting for ${state.request.kind}`);
            finish(s);
          }
          continue;
        }
        // After the map's own entry scripts, before anything the player walks into.
        if (s.who.intro && options.intro) {
          s.who.intro = false;
          start(s, { file: INTRO_SCRIPT.file, entry: 0 }, false, INTRO_SCRIPT);
          continue;
        }
        const t = tileOf(e);
        const key = `${e.area}:${t.x},${t.z}`;
        if (key !== s.tile) {
          s.tile = key;
          const trigger = eventsOf(e.area)?.triggers.find((g) => g.script && t.x >= g.x && t.x < g.x + g.w && t.z >= g.z && t.z < g.z + g.h && (s.who.vars.get(g.variable) ?? 0) === g.value);
          if (trigger?.script && start(s, trigger.script)) continue;
        }
        const frame = s.framesOff ? undefined : frameScript(s, e.area);
        if (frame) start(s, frame, true);
      }
    },
    /** Whether this player sees the entity: people follow the player's own flags (principle VII). */
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
      if (on) s.who.flags.add(flag);
      else s.who.flags.delete(flag);
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
