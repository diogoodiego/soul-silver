import { PROTOCOL_VERSION } from "@soulsilver/shared";
import {
  clientMessage,
  createRng,
  protocolMismatchMessage,
  stepMovement,
  type CloseReason,
  type NoticeCode,
  type PlayerInput,
  type RecordingEvent,
  type RejectCode,
  type Rng,
  type ServerMessage,
  type ArenaSpec,
  type WorldLookup,
} from "@soulsilver/shared/game";
import type { Decision } from "@soulsilver/shared/ai";
import { TICKS_PER_S } from "@soulsilver/shared/combat";
import { MAP_TILE_PX, type Direction } from "@soulsilver/shared/maps";
import { expForLevel, memberStats } from "@soulsilver/shared/progression";
import { migrate, newCollection, newProgress, type PartyMember, type Save } from "@soulsilver/shared/save";
import { buildAiData, BUNDLED_AI_CONTENT, type AiData } from "./ai-loader";
import { spawnArena } from "./arena";
import { createCombat, type Combat } from "./combat";
import type { CombatData } from "./combat-loader";
import { createCaptures, type Catcher } from "./capture";
import { createCompanions, type Trainer } from "./companion";
import type { CompanionData } from "./companion-loader";
import type { Connection } from "./connection";
import { reorderParty, useItem, type ItemsData } from "./items";
import { createProgression, type Learner, type Progression, type ProgressionData } from "./progression";
import { createReplica, replicate, type Replica } from "./replication";
import { createScripts, type ScriptData } from "./scripts";
import type { MissingCommand } from "@soulsilver/shared/script";
import { startPosition } from "./start";
import { createWilds } from "./wild";
import type { WildData } from "./wild-loader";
import { createWorld, type World } from "./world";

// One match of 1 to 4 players (spec 010, 012). Pure: time only advances through step().

export const MAX_PLAYERS = 4;
const MAX_QUEUED_INPUTS = 10;
const TICK_MS = 50;
/** 10 s at 20 Hz. */
const DEFAULT_TIMEOUT_TICKS = 200;
/** A save goes to each player every 30 s of play (FR-006 allows up to 60 s). */
const SAVE_INTERVAL_TICKS = 600;
/** A dropped guest keeps the seat for 2 minutes (FR-020). */
const RESERVE_TICKS = 2400;
/** The final saves get 3 s to be acknowledged before the session closes (FR-021). */
const CLOSE_WAIT_TICKS = 60;

export interface Spawn {
  area: string;
  x: number;
  y: number;
  level: number;
  facing: Direction;
}

export interface SessionOptions {
  seed: number;
  /** Maps by id; an unknown map is open ground. */
  world: WorldLookup;
  log(message: string): void;
  /** Ticks without any message before a player is dropped. */
  timeoutTicks?: number;
  /** Everything that changes the world from outside, in order (research R9). */
  onRecord?(event: RecordingEvent): void;
  /** Checks that depend on the world (spec 012, FR-018); returns a message to refuse the save. */
  validateSave?(save: Save): string | undefined;
  /** ISO timestamp for emitted saves; the simulation itself never reads a clock. */
  clock: () => string;
  /** A fresh unguessable reconnect token. */
  newToken: () => string;
  /** Combat rules and data (spec 013); without them there is no combat. */
  combat?: CombatData | undefined;
  /** Accept hellos that ask for the dev arena (development builds only). */
  devArena?: boolean | undefined;
  /** Companion rules (spec 014); without them nobody follows and the combat button does nothing. */
  companion?: CompanionData | undefined;
  /** Hour of the host clock (0–23) for companion reactions; noon when omitted. */
  hour?: (() => number) | undefined;
  /** Development builds: the party a save with none starts with, so the companion can be tried before the starter event exists. */
  devParty?: PartyMember[] | undefined;
  /** Wild Pokémon and capture (spec 015); they need combat too. */
  wild?: WildData | undefined;
  /** Combat AI data (spec 019); the bundled content/ai when omitted. */
  ai?: AiData | undefined;
  /** Every AI decision, for the host's decision log (spec 019, FR-034). */
  onDecision?: ((d: Decision) => void) | undefined;
  /** Development builds: the bag a save with none starts with, so capture can be tried. */
  devBag?: Save["bag"] | undefined;
  /** Experience, levels, moves and evolution (spec 016); without it nobody grows. */
  progression?: ProgressionData | undefined;
  /** Item data for using items from the bag (spec 017); without it every item is unavailable. */
  items?: ItemsData | undefined;
  /** Event scripts (spec 020); without them nobody talks and nothing triggers. */
  scripts?: ScriptData | undefined;
  /** Ticks a script waits for a client's answer before letting the player go. */
  scriptTimeoutTicks?: number | undefined;
  /** Every command a script reached that nothing implements (spec 020, FR-008). */
  onMissingCommand?: ((m: MissingCommand & { player: number }) => void) | undefined;
  /** Development builds: the script debugger may change flags. */
  devTools?: boolean | undefined;
  /** Day of the week on the host clock (0 Sunday); Sunday when omitted. */
  weekday?: (() => number) | undefined;
}

interface Player {
  id: number;
  entityId: number;
  conn: Connection | undefined;
  lastInputSeq: number;
  /** Sorted by seq. */
  queue: PlayerInput[];
  lastSeenTick: number;
  replica: Replica;
  token: string;
  /** The save this player joined with: identity fields (name, character) come from it. */
  base: Save;
  /** Play time at joinTick. */
  playTimeMs: number;
  joinTick: number;
  rev: number;
  lastArea: string;
  /** Rev of a save sent while closing that has not been acknowledged yet. */
  pendingAck: number | undefined;
  gone: boolean;
  /** In the dev arena: the wild target's entity. Arena players never get saves. */
  arenaTarget: number | undefined;
  /** Asked for the AI debug overlay (spec 019). */
  debugAi: boolean;
  /** Party, money, badges and respawn point, changed in place by the companion rules; bag, Pokédex and storage by capture. */
  progress: Trainer["progress"] & Catcher["progress"] & Learner["progress"];
  /** Story flags and variables (spec 020), changed by this player's scripts only. */
  flags: Set<number>;
  vars: Map<number, number>;
  /** Buttons held on the last input, to see presses. */
  buttons: number;
  /** The full menu is open (spec 017); with a running script, it shows the player as busy. */
  menuOpen: boolean;
}

interface Reserved {
  token: string;
  base: Save;
  spawn: Spawn;
  until: number;
}

export interface Session {
  readonly state: "open" | "closing" | "closed";
  readonly tick: number;
  /** Connected plus reserved players: the seats taken. */
  readonly occupied: number;
  readonly world: World;
  readonly rng: Rng;
  readonly combat: Combat | undefined;
  connect(conn: Connection): void;
  /** Advances one tick: timeouts, inputs, simulation, then state to every client. */
  step(): void;
  /** Sends the final saves, waits for their acks (up to 3 s), then closes. */
  close(reason: CloseReason): void;
  /** Sends to every connected player. */
  broadcast(msg: ServerMessage): void;
  /** Connectionless players, for replay. Returns the player id. */
  join(name: string, spawn: Spawn): number;
  leave(playerId: number): void;
  enqueue(playerId: number, input: PlayerInput): void;
}

const nameKey = (name: string) => name.trim().toLocaleLowerCase("en");

export function createSession(options: SessionOptions): Session {
  const world = createWorld();
  const rng = createRng(options.seed);
  const timeoutTicks = options.timeoutTicks ?? DEFAULT_TIMEOUT_TICKS;
  const { clock } = options;
  const combat = options.combat ? createCombat({ data: options.combat, rng, lookup: options.world }) : undefined;
  const companions = options.companion
    ? createCompanions({
        data: options.companion,
        combat,
        combatData: options.combat,
        lookup: options.world,
        world,
        rng,
        hour: options.hour ?? (() => 12),
        home: () => startPosition(options.world),
        busy: (id): boolean => progression?.busy(id) ?? false,
        detail: (m) => memberDetail(m),
        log: (message) => options.log(message),
      })
    : undefined;
  const progression: Progression | undefined =
    options.progression && companions
      ? createProgression({ data: options.progression, inCombat: (id) => companions.inCombat(id), active: (id) => companions.active(id), refresh: (id) => companions.refresh(id) })
      : undefined;
  const ai = options.ai ?? buildAiData(BUNDLED_AI_CONTENT);
  const aiDebugEvery = Math.max(1, Math.round(TICKS_PER_S / ai.tuning.debug.hz));
  const aiDebugRadiusPx = ai.tuning.debug.radiusTiles * MAP_TILE_PX;
  const wilds =
    options.wild && combat && options.combat
      ? createWilds({
          data: options.wild,
          ai,
          combat,
          combatData: options.combat,
          lookup: options.world,
          world,
          rng,
          hour: options.hour ?? (() => 12),
          onDecision: options.onDecision,
          onFaint: (id, species, level) => progression?.faint(id, species, level),
          onRemove: (id) => progression?.forget(id),
          log: (message) => options.log(message),
        })
      : undefined;
  const captures =
    wilds && options.wild && combat && options.combat
      ? createCaptures({ data: options.wild, wilds, combat, combatData: options.combat, world, lookup: options.world, rng, hour: options.hour ?? (() => 12), controlled: (id) => companions?.controlled(id) })
      : undefined;
  const hpMax = (m: PartyMember) => {
    const species = options.combat?.species(m.species);
    return species ? memberStats(species.baseStats, m).hp : m.hp;
  };
  /** What the party screen shows beyond HP (spec 017); undefined without the species data. */
  function memberDetail(m: PartyMember) {
    const base = options.combat?.species(m.species);
    const growth = options.progression?.species(m.species);
    if (!base) return undefined;
    const rate = growth?.growthRate;
    return {
      moves: [...m.moves],
      stats: memberStats(base.baseStats, m),
      nature: m.nature,
      exp: m.experience,
      ...(rate ? { expNext: expForLevel(rate, Math.min(100, m.level + 1)) } : {}),
      ...(growth?.abilities ? { ability: growth.abilities[0] } : {}),
    };
  }
  const scripts = options.scripts
    ? createScripts({
        data: options.scripts,
        world,
        lookup: options.world,
        progression: options.progression,
        seed: options.seed,
        hpMax,
        weekday: options.weekday ?? (() => 0),
        timeoutTicks: options.scriptTimeoutTicks,
        devTools: options.devTools,
        changed(playerId, what) {
          if (what === "party") companions?.refresh(playerId);
          else if (captures) captures.refresh(playerId);
          else {
            const p = players.get(playerId);
            p?.conn?.send({ type: "bag", items: p.progress.bag.map((b) => ({ ...b })) } satisfies ServerMessage);
          }
        },
        onMissing: options.onMissingCommand,
        log: (message) => options.log(message),
      })
    : undefined;
  const notice = (p: Player, code: NoticeCode) => p.conn?.send({ type: "notice", code } satisfies ServerMessage);
  /** The menu does not pause anything; it only shows the player as busy to the others (spec 017, FR-012). */
  function setBusy(p: Player, busy: boolean): void {
    const e = world.get(p.entityId);
    if (!e || (e.data["busy"] === true) === busy) return;
    const data = { ...e.data };
    if (busy) data["busy"] = true;
    else delete data["busy"];
    world.update({ ...e, data });
  }
  const players = new Map<number, Player>();
  const reserved = new Map<string, Reserved>();
  let state: "open" | "closing" | "closed" = "open";
  let closeReason: CloseReason = "closed-by-host";
  let closingTicks = 0;
  let tick = 0;
  let nextPlayerId = 1;
  let hostId: number | undefined;
  /** Player ids last sent in the "players" list. */
  let roster = "";

  function add(base: Save, conn: Connection | undefined, spawn: Spawn, token: string, arena?: { a: number; b: number }): Player {
    const id = nextPlayerId++;
    const entityId = arena?.a ?? world.add({ kind: "player", area: spawn.area, x: spawn.x, y: spawn.y, level: spawn.level, facing: spawn.facing, data: { name: base.name, character: base.character } }).id;
    const player: Player = {
      id,
      entityId,
      conn,
      lastInputSeq: -1,
      queue: [],
      lastSeenTick: tick,
      replica: createReplica(),
      token,
      base,
      playTimeMs: base.playTimeMs,
      joinTick: tick,
      rev: base.rev,
      lastArea: spawn.area,
      pendingAck: undefined,
      gone: false,
      arenaTarget: arena?.b,
      debugAi: false,
      progress: {
        party: base.party.map((m) => ({ ...m })),
        money: base.money,
        badges: base.badges,
        respawn: base.respawn,
        bag: base.bag.map((b) => ({ ...b })),
        pokedex: { seen: [...base.pokedex.seen], caught: [...base.pokedex.caught] },
        storage: base.storage.map((m) => ({ ...m })),
        pending: base.pending.map((i) => ({ ...i })),
      },
      flags: new Set(base.flags),
      vars: new Map(Object.entries(base.vars).map(([k, v]) => [Number(k), v])),
      buttons: 0,
      menuOpen: false,
    };
    players.set(id, player);
    if (!arena) {
      const send = (msg: ServerMessage) => player.conn?.send(msg);
      companions?.join({ playerId: id, entityId, progress: player.progress, send });
      captures?.join({ playerId: id, entityId, progress: player.progress, send });
      progression?.join({ playerId: id, progress: player.progress, send });
      scripts?.join({ playerId: id, entityId, character: base.character, flags: player.flags, vars: player.vars, progress: player.progress, send });
    }
    hostId ??= id;
    options.onRecord?.({ tick, kind: "join", playerId: id, name: base.name, spawn });
    return player;
  }

  /** The player's save as of now; each call takes the next rev. */
  function snapshot(p: Player): Save {
    const e = world.get(p.entityId)!;
    return {
      ...p.base,
      ...p.progress,
      party: p.progress.party.map((m) => ({ ...m })),
      bag: p.progress.bag.map((b) => ({ ...b })),
      pokedex: { seen: [...p.progress.pokedex.seen], caught: [...p.progress.pokedex.caught] },
      storage: p.progress.storage.map((m) => ({ ...m })),
      pending: p.progress.pending.map((i) => ({ ...i })),
      flags: [...p.flags].sort((a, b) => a - b),
      vars: Object.fromEntries([...p.vars].map(([k, v]) => [String(k), v])),
      area: e.area,
      x: e.x,
      y: e.y,
      facing: e.facing,
      playTimeMs: p.playTimeMs + (tick - p.joinTick) * TICK_MS,
      savedAt: clock(),
      rev: ++p.rev,
    };
  }

  function sendSave(p: Player): void {
    if (!p.conn || p.arenaTarget !== undefined) return;
    const save = snapshot(p);
    if (state === "closing") p.pendingAck = save.rev;
    p.conn.send({ type: "save", save } satisfies ServerMessage);
  }

  function remove(p: Player): void {
    p.gone = true;
    players.delete(p.id);
    companions?.leave(p.id);
    captures?.leave(p.id);
    progression?.leave(p.id);
    scripts?.leave(p.id);
    for (const id of p.arenaTarget === undefined ? [p.entityId] : [p.entityId, p.arenaTarget]) {
      combat?.remove(world, id);
      world.remove(id);
    }
    options.onRecord?.({ tick, kind: "leave", playerId: p.id });
  }

  /** A guest left on purpose: final save, then the seat is freed. */
  function leave(p: Player): void {
    if (p.gone) return;
    if (p.id === hostId) {
      close("host-left");
      return;
    }
    sendSave(p);
    remove(p);
    p.conn?.close();
    if (state === "closing" && ![...players.values()].some((q) => q.pendingAck !== undefined)) finishClose();
  }

  /** A guest dropped: the seat and the progress are kept for a while. */
  function reserve(p: Player): void {
    if (p.gone) return;
    // Ends any fight first, so the reserved progress keeps the HP it ended with.
    companions?.leave(p.id);
    const e = world.get(p.entityId)!;
    reserved.set(nameKey(p.base.name), {
      token: p.token,
      base: snapshot(p),
      spawn: { area: e.area, x: e.x, y: e.y, level: e.level, facing: e.facing },
      until: tick + RESERVE_TICKS,
    });
    remove(p);
    p.conn?.close();
  }

  function finishClose(): void {
    if (state === "closed") return;
    state = "closed";
    const remaining = [...players.values()];
    players.clear();
    reserved.clear();
    for (const p of remaining) {
      p.gone = true;
      p.conn?.send({ type: "session-closed", reason: closeReason } satisfies ServerMessage);
      p.conn?.close();
    }
  }

  function close(reason: CloseReason): void {
    if (state !== "open") return;
    state = "closing";
    closeReason = reason;
    reserved.clear();
    for (const p of players.values()) sendSave(p);
    if (![...players.values()].some((p) => p.pendingAck !== undefined)) finishClose();
  }

  function enqueue(player: Player, input: PlayerInput): void {
    if (input.seq <= player.lastInputSeq || player.queue.some((q) => q.seq === input.seq)) return;
    const at = player.queue.findIndex((q) => q.seq > input.seq);
    player.queue.splice(at === -1 ? player.queue.length : at, 0, input);
    if (player.queue.length > MAX_QUEUED_INPUTS) {
      const dropped = player.queue.splice(0, player.queue.length - MAX_QUEUED_INPUTS);
      options.log(`Player ${player.id}: dropped ${dropped.length} queued inputs`);
    }
  }

  function reject(conn: Connection, code: RejectCode, message: string): void {
    conn.send({ type: "reject", code, message, serverProtocolVersion: PROTOCOL_VERSION } satisfies ServerMessage);
    conn.close();
  }

  /** Handles a hello; returns the new player or undefined when it was refused. */
  function admit(conn: Connection, msg: { protocolVersion: number; save: unknown; resumeToken?: string | undefined; arena?: ArenaSpec | undefined }): { player: Player; resumed: boolean } | undefined {
    if (msg.protocolVersion !== PROTOCOL_VERSION) {
      reject(conn, "protocol-mismatch", protocolMismatchMessage(PROTOCOL_VERSION, msg.protocolVersion));
      return undefined;
    }
    if (state !== "open") {
      reject(conn, "session-closed", "A sessão foi encerrada.");
      return undefined;
    }
    const migrated = migrate(msg.save);
    if (!migrated.ok) {
      reject(conn, migrated.code === "save-too-new" ? "save-too-new" : "invalid-save", migrated.message);
      return undefined;
    }
    let save = options.devParty && migrated.save.party.length === 0 ? { ...migrated.save, party: options.devParty.map((m) => ({ ...m })) } : migrated.save;
    if (options.devBag && save.bag.length === 0) save = { ...save, bag: options.devBag.map((b) => ({ ...b })) };
    const problem = options.validateSave?.(save);
    if (problem) {
      reject(conn, "invalid-save", problem);
      return undefined;
    }
    const key = nameKey(save.name);
    const held = reserved.get(key);
    if (held && held.token === msg.resumeToken) {
      reserved.delete(key);
      return { player: add(held.base, conn, held.spawn, held.token), resumed: true };
    }
    if (held || [...players.values()].some((p) => nameKey(p.base.name) === key)) {
      reject(conn, "name-taken", "Esse nome já está em uso nesta sessão.");
      return undefined;
    }
    if (players.size + reserved.size >= MAX_PLAYERS) {
      reject(conn, "session-full", `A sessão está cheia (${MAX_PLAYERS} jogadores).`);
      return undefined;
    }
    if (msg.arena) {
      if (!combat || !options.devArena) {
        reject(conn, "invalid-message", "A arena de teste só existe em builds de desenvolvimento.");
        return undefined;
      }
      let arena: { a: number; b: number };
      try {
        // Owned by the id add() is about to take.
        arena = spawnArena(world, combat, msg.arena, nextPlayerId);
      } catch (error) {
        reject(conn, "invalid-message", `Arena inválida: ${(error as Error).message}`);
        return undefined;
      }
      // shortcut: arena joins are not recorded, so a replay of an arena session does not rebuild it; record them if arena replays matter.
      return { player: add(save, conn, { area: "", x: 0, y: 0, level: 0, facing: "south" }, options.newToken(), arena), resumed: false };
    }
    return { player: add(save, conn, { area: save.area, x: save.x, y: save.y, level: 0, facing: save.facing }, options.newToken()), resumed: false };
  }

  function connect(conn: Connection): void {
    let player: Player | undefined;

    conn.onMessage((raw) => {
      if (player) player.lastSeenTick = tick;
      const who = player ? `player ${player.id}` : "a new connection";
      const parsed = clientMessage.safeParse(raw);
      if (!parsed.success) {
        options.log(`Discarded malformed message from ${who}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
        return;
      }
      const msg = parsed.data;
      if (!player) {
        if (msg.type !== "hello") {
          options.log(`Discarded ${msg.type} before hello`);
          return;
        }
        const admitted = admit(conn, msg);
        if (!admitted) return;
        player = admitted.player;
        conn.send({
          type: "welcome",
          protocolVersion: PROTOCOL_VERSION,
          playerId: player.id,
          entityId: player.entityId,
          tick,
          tickRateHz: 20,
          resumeToken: player.token,
          resumed: admitted.resumed,
        } satisfies ServerMessage);
        return;
      }
      switch (msg.type) {
        case "hello":
          options.log(`Discarded repeated hello from ${who}`);
          return;
        case "leave":
          leave(player);
          return;
        case "input":
          // Players never aim: moves and balls aim themselves; a client's aim is ignored.
          enqueue(player, { seq: msg.seq, move: msg.move, run: msg.run, buttons: msg.buttons });
          return;
        case "swap":
          companions?.swap(player.id, msg.partyIndex, tick);
          return;
        case "select-ball":
          captures?.select(player.id, msg.item);
          return;
        case "debugAi":
          player.debugAi = msg.on;
          return;
        case "script-answer":
          if (scripts) scripts.answer(player.id, msg.id, msg.answer);
          else options.log(`Discarded script-answer from ${who}: this session has no scripts`);
          return;
        case "debugScript":
          scripts?.debug(player.id, msg.on);
          return;
        case "debugSetFlag":
          scripts?.setFlag(player.id, msg.flag, msg.on);
          return;
        case "menu":
          if (msg.open && companions?.inCombat(player.id)) notice(player, "menu-blocked");
          else {
            player.menuOpen = msg.open;
            setBusy(player, msg.open || (scripts?.busy(player.id) ?? false));
          }
          return;
        case "reorder-party":
          if (companions?.inCombat(player.id) || progression?.busy(player.id) || !reorderParty(player.progress.party, msg.from, msg.to)) notice(player, "action-refused");
          else companions?.refresh(player.id);
          return;
        case "use-item": {
          const refused = companions?.inCombat(player.id) ? "action-refused" : useItem(player.progress, msg.item, msg.partyIndex, options.items, hpMax);
          if (refused) {
            notice(player, refused);
            return;
          }
          companions?.refresh(player.id);
          if (captures) captures.refresh(player.id);
          else player.conn?.send({ type: "bag", items: player.progress.bag.map((b) => ({ ...b })) } satisfies ServerMessage);
          return;
        }
        case "progression-ack":
        case "learn-answer":
        case "evolve-answer":
          progression?.answer(player.id, msg);
          return;
        case "save-ack":
          if (player.pendingAck !== undefined && msg.rev >= player.pendingAck) {
            player.pendingAck = undefined;
            if (state === "closing" && ![...players.values()].some((p) => p.pendingAck !== undefined)) finishClose();
          }
          return;
      }
    });

    conn.onClose(() => {
      if (!player || player.gone) return;
      // Nobody left to wait for.
      if (state !== "open") player.pendingAck = undefined;
      else if (player.id === hostId) close("host-left");
      else reserve(player);
      if (state === "closing" && ![...players.values()].some((p) => p.pendingAck !== undefined)) finishClose();
    });
  }

  function step(): void {
    if (state === "closed") return;
    if (state === "closing") {
      if (++closingTicks >= CLOSE_WAIT_TICKS) finishClose();
      return;
    }
    for (const [key, r] of reserved) {
      if (tick >= r.until) reserved.delete(key);
    }
    // Timeouts run before the tick advances so they record like any other leave between ticks.
    for (const p of [...players.values()]) {
      if (tick + 1 - p.lastSeenTick >= timeoutTicks) {
        options.log(`Player ${p.id} timed out`);
        if (p.id === hostId) close("host-left");
        else reserve(p);
      }
    }
    // A timed-out host closes the session; TS cannot see that mutation through close().
    if ((state as Session["state"]) !== "open") return;
    // Joins and leaves show up here, after the welcome went out.
    const ids = [...players.keys()].join();
    if (ids !== roster) {
      roster = ids;
      const list = [...players.values()].map((p) => ({ id: p.id, name: p.base.name, host: p.id === hostId }));
      for (const p of players.values()) p.conn?.send({ type: "players", players: list } satisfies ServerMessage);
    }
    tick++;
    for (const p of players.values()) {
      const input = p.queue.shift();
      if (input) {
        p.lastInputSeq = input.seq;
        options.onRecord?.({ tick, kind: "input", playerId: p.id, input });
      }
      if (p.arenaTarget !== undefined) {
        if (input) combat!.input(p.entityId, { move: input.move, buttons: input.buttons, aim: input.aim });
        continue;
      }
      const buttons = input?.buttons ?? p.buttons;
      const pressed = buttons & ~p.buttons;
      p.buttons = buttons;
      // A running script holds the player; interact on a person or a sign starts one (spec 020).
      if (scripts?.input(p.id, input, pressed, tick)) {
        world.update(stepMovement(world.get(p.entityId)!, null, options.world));
        continue;
      }
      // A ball can be thrown walking or in combat.
      captures?.input(p.id, input);
      // In combat the input moves the Pokémon and the trainer stands still.
      if (companions?.input(p.id, input, tick)) {
        // A fight that starts with the menu open closes it (spec 017, FR-013).
        p.menuOpen = false;
        setBusy(p, false);
        continue;
      }
      // Every tick, so ledge hops and warp transitions run out without input.
      world.update(stepMovement(world.get(p.entityId)!, input ?? null, options.world));
    }
    const hits = combat?.step(tick, world) ?? [];
    for (const h of hits) {
      const a = combat!.get(h.attacker)?.owner;
      const b = combat!.get(h.target)?.owner;
      if (a === "wild" && typeof b === "number") progression?.engage(b, h.attacker);
      if (b === "wild" && typeof a === "number") progression?.engage(a, h.target);
      if (typeof b === "number" && a !== undefined && a !== b) companions?.hitBy(b, a);
    }
    companions?.step(tick);
    wilds?.step(tick, hits);
    captures?.step(tick);
    progression?.step();
    scripts?.step(tick);
    scripts?.sendDebug();
    // Others see a player in a script as busy (principle VII), as with the menu.
    if (scripts) for (const p of players.values()) if (p.arenaTarget === undefined) setBusy(p, p.menuOpen || scripts.busy(p.id));
    const entities = world.all();
    for (const p of players.values()) {
      const entity = world.get(p.entityId)!;
      p.conn?.send(replicate(p.replica, entity, scripts ? entities.filter((e) => scripts.visible(p.id, e)) : entities, tick, p.lastInputSeq));
      const seen = hits.filter((h) => world.get(h.target)?.area === entity.area);
      if (seen.length > 0) p.conn?.send({ type: "combat-event", tick, events: seen } satisfies ServerMessage);
      if (p.debugAi && wilds && tick % aiDebugEvery === 0) p.conn?.send({ type: "aiDebug", tick, ais: wilds.ai.debug(entity.area, entity, aiDebugRadiusPx) } satisfies ServerMessage);
      // Periodically and on every map change (FR-006).
      if (entity.area !== p.lastArea || (tick - p.joinTick) % SAVE_INTERVAL_TICKS === 0) sendSave(p);
      p.lastArea = entity.area;
    }
  }

  return {
    get state() {
      return state;
    },
    get tick() {
      return tick;
    },
    get occupied() {
      return players.size + reserved.size;
    },
    world,
    rng,
    combat,
    connect,
    step,
    close,
    broadcast(msg) {
      for (const p of players.values()) p.conn?.send(msg);
    },
    join: (name, spawn) => {
      const base: Save = { schemaVersion: 5, pending: [], flags: [], vars: {}, name, character: "male", area: spawn.area, x: spawn.x, y: spawn.y, facing: spawn.facing, playTimeMs: 0, savedAt: clock(), rev: 0, ...newProgress(), ...newCollection() };
      return add(base, undefined, spawn, "").id;
    },
    leave(playerId) {
      const p = players.get(playerId);
      if (p) leave(p);
    },
    enqueue(playerId, input) {
      const p = players.get(playerId);
      if (p) enqueue(p, input);
    },
  };
}
