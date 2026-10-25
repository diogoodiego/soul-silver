import { PROTOCOL_VERSION } from "@soulsilver/shared";
import {
  clientMessage,
  createRng,
  protocolMismatchMessage,
  stepMovement,
  type CloseReason,
  type PlayerInput,
  type RecordingEvent,
  type RejectCode,
  type Rng,
  type ServerMessage,
  type ArenaSpec,
  type WorldLookup,
} from "@soulsilver/shared/game";
import type { Direction } from "@soulsilver/shared/maps";
import { migrate, type Save } from "@soulsilver/shared/save";
import { spawnArena } from "./arena";
import { createCombat } from "./combat";
import type { CombatData } from "./combat-loader";
import type { Connection } from "./connection";
import { createReplica, replicate, type Replica } from "./replication";
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
  const players = new Map<number, Player>();
  const reserved = new Map<string, Reserved>();
  let state: "open" | "closing" | "closed" = "open";
  let closeReason: CloseReason = "closed-by-host";
  let closingTicks = 0;
  let tick = 0;
  let nextPlayerId = 1;
  let hostId: number | undefined;

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
    };
    players.set(id, player);
    hostId ??= id;
    options.onRecord?.({ tick, kind: "join", playerId: id, name: base.name, spawn });
    return player;
  }

  /** The player's save as of now; each call takes the next rev. */
  function snapshot(p: Player): Save {
    const e = world.get(p.entityId)!;
    return {
      ...p.base,
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
    const save = migrated.save;
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
          enqueue(player, { seq: msg.seq, move: msg.move, run: msg.run, buttons: msg.buttons, ...(msg.aim ? { aim: msg.aim } : {}) });
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
      // Every tick, so ledge hops and warp transitions run out without input.
      world.update(stepMovement(world.get(p.entityId)!, input ?? null, options.world));
    }
    const hits = combat?.step(tick, world) ?? [];
    const entities = world.all();
    for (const p of players.values()) {
      const entity = world.get(p.entityId)!;
      p.conn?.send(replicate(p.replica, entity, entities, tick, p.lastInputSeq));
      const seen = hits.filter((h) => world.get(h.target)?.area === entity.area);
      if (seen.length > 0) p.conn?.send({ type: "combat-event", tick, events: seen } satisfies ServerMessage);
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
    connect,
    step,
    close,
    broadcast(msg) {
      for (const p of players.values()) p.conn?.send(msg);
    },
    join: (name, spawn) => {
      const base: Save = { schemaVersion: 1, name, character: "male", area: spawn.area, x: spawn.x, y: spawn.y, facing: spawn.facing, playTimeMs: 0, savedAt: clock(), rev: 0 };
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
