import type { MapEventsFile, ScriptFile, ScriptRef } from "@soulsilver/shared/events";
import { createRng, type Entity, type PlayerInput, type ServerMessage, type WorldLookup, BUTTON } from "@soulsilver/shared/game";
import { MAP_TILE_PX, type Direction } from "@soulsilver/shared/maps";
import { starterMember } from "@soulsilver/shared/progression";
import { STORAGE_MAX, type PartyMember, type Save } from "@soulsilver/shared/save";
import { createRunner, SCRIPT_DIRECTIONS, SCRIPT_HANDLERS, type MissingCommand, type Runner, type ScriptHost } from "@soulsilver/shared/script";
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
const MONEY_MAX = 999999;

export interface Storyteller {
  playerId: number;
  entityId: number;
  character: Save["character"];
  flags: Set<number>;
  vars: Map<number, number>;
  progress: Pick<Save, "party" | "storage" | "bag" | "money" | "badges" | "pokedex">;
  send(msg: ServerMessage): void;
}

export interface ScriptsOptions {
  data: ScriptData;
  world: World;
  lookup: WorldLookup;
  progression?: ProgressionData | undefined;
  seed: number;
  hpMax(m: PartyMember): number;
  weekday(): number;
  timeoutTicks?: number | undefined;
  /** Development builds: the debugger may change flags. */
  devTools?: boolean | undefined;
  /** After the party or the bag changed, so the client gets them again. */
  changed(playerId: number, what: "party" | "bag"): void;
  onMissing?: ((m: MissingCommand & { player: number }) => void) | undefined;
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
  /** The frame table stops after one of its scripts failed, until the map is entered again. */
  framesOff: boolean;
  /** The running script came from the frame table. */
  frameRunning: boolean;
  debug: boolean;
  lastDebug: string;
}

export function createScripts(options: ScriptsOptions) {
  const { data, world, lookup } = options;
  const timeout = options.timeoutTicks ?? SCRIPT_TIMEOUT_TICKS;
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
        const to = who.progress.party.length < 6 ? who.progress.party : who.progress.storage.length < STORAGE_MAX ? who.progress.storage : undefined;
        if (!to) return false;
        // shortcut: held item and form are not kept, the party has no field for them yet; add both when a spec needs them.
        to.push(starterMember(info, options.progression!.levelUp(species), rng, Math.max(1, Math.min(100, level))));
        const dex = who.progress.pokedex;
        if (!dex.seen.includes(species)) dex.seen.push(species);
        if (!dex.caught.includes(species)) dex.caught.push(species);
        options.changed(who.playerId, "party");
        return true;
      },
      healParty() {
        for (const m of who.progress.party) m.hp = options.hpMax(m);
        options.changed(who.playerId, "party");
      },
      // shortcut: the save keeps a badge count, not which badges; Johto's are earned in order until a spec needs the set.
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
      movePerson(id, x, z, facing) {
        const e = personOf(me().area, id);
        const o = origin(me().area);
        if (e) world.update({ ...e, x: center(x - o.tx), y: center(z - o.ty), facing: SCRIPT_DIRECTIONS[facing] ?? e.facing });
      },
      weekday: () => options.weekday(),
      emit: (event) => send(s, { type: "script-event", event }),
      // Nothing implements movement, battles or marts yet: each ends the script as missing (FR-008).
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

  function finish(s: State): void {
    s.runner = undefined;
    s.waitUntil = undefined;
    s.talkedTo = undefined;
    s.frameRunning = false;
    lock(s, false);
  }

  /** Starts a script for this player; false when it cannot (file missing, or one already runs). */
  function start(s: State, ref: { file: number; entry: number }, frame = false): boolean {
    if (s.runner) return false;
    const file = data.file(ref.file);
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
    const npc = world
      .all()
      .find((n) => n.kind === "npc" && n.area === e.area && Math.floor(n.x / MAP_TILE_PX) === front.x && Math.floor(n.y / MAP_TILE_PX) === front.y && visibleTo(s, n));
    const events = eventsOf(e.area);
    if (npc) {
      const ref = events?.npcs.find((n) => n.id === npc.data["person"])?.script;
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
      states.set(who.playerId, { who, runner: undefined, asked: 0, askedAt: 0, waitUntil: undefined, locked: false, talkedTo: undefined, area: undefined, tile: "", shown: new Map(), framesOff: false, frameRunning: false, debug: false, lastDebug: "" });
    },
    leave(playerId: number): void {
      states.delete(playerId);
    },
    busy: (playerId: number) => states.get(playerId)?.runner !== undefined,
    /** True when the input is the script's: the player is locked, or interact started a script. */
    input(playerId: number, input: PlayerInput | undefined, pressed: number, now: number): boolean {
      tick = now;
      const s = states.get(playerId);
      if (!s) return false;
      if (s.runner) return true;
      return input !== undefined && (pressed & BUTTON.interact) !== 0 && interact(s);
    },
    answer(playerId: number, id: number, answer: number | undefined): void {
      const s = states.get(playerId);
      const request = s?.runner?.state.kind === "blocked" ? s.runner.state.request : undefined;
      if (!s || !request || request.kind === "wait" || id !== s.asked) {
        options.log(`Discarded script-answer ${id} from player ${playerId}: nothing waits for it`);
        return;
      }
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
