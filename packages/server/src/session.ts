import { PROTOCOL_VERSION } from "@soulsilver/shared";
import {
  clientMessage,
  createRng,
  protocolMismatchMessage,
  stepMovement,
  type CloseReason,
  type CollisionMap,
  type PlayerInput,
  type RecordingEvent,
  type RejectCode,
  type Rng,
  type ServerMessage,
} from "@soulsilver/shared/game";
import type { Connection } from "./connection";
import { createReplica, replicate, type Replica } from "./replication";
import { createWorld, type World } from "./world";

// One match of 1 to 4 players (spec 010). Pure: time only advances through step().

export const MAX_PLAYERS = 4;
const MAX_QUEUED_INPUTS = 10;
/** 10 s at 20 Hz. */
const DEFAULT_TIMEOUT_TICKS = 200;

export interface SessionOptions {
  seed: number;
  /** Where a new player appears. */
  spawn(playerId: number): { area: string; x: number; y: number };
  collision(area: string): CollisionMap | undefined;
  log(message: string): void;
  /** Ticks without any message before a player is dropped. */
  timeoutTicks?: number;
  /** Everything that changes the world from outside, in order (research R9). */
  onRecord?(event: RecordingEvent): void;
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
}

export interface Session {
  readonly state: "open" | "closed";
  readonly tick: number;
  readonly world: World;
  readonly rng: Rng;
  connect(conn: Connection): void;
  /** Advances one tick: timeouts, inputs, simulation, then state to every client. */
  step(): void;
  close(reason: CloseReason): void;
  /** Sends to every connected player. */
  broadcast(msg: ServerMessage): void;
  /** Connectionless players, for replay. Returns the player id. */
  join(name: string): number;
  leave(playerId: number): void;
  enqueue(playerId: number, input: PlayerInput): void;
}

export function createSession(options: SessionOptions): Session {
  const world = createWorld();
  const rng = createRng(options.seed);
  const timeoutTicks = options.timeoutTicks ?? DEFAULT_TIMEOUT_TICKS;
  const players = new Map<number, Player>();
  let state: "open" | "closed" = "open";
  let tick = 0;
  let nextPlayerId = 1;
  let hostId: number | undefined;

  function join(name: string, conn: Connection | undefined): Player {
    const id = nextPlayerId++;
    const spawn = options.spawn(id);
    const entity = world.add({ kind: "player", area: spawn.area, x: spawn.x, y: spawn.y, facing: "south", data: { name } });
    const player: Player = { id, entityId: entity.id, conn, lastInputSeq: -1, queue: [], lastSeenTick: tick, replica: createReplica() };
    players.set(id, player);
    hostId ??= id;
    options.onRecord?.({ tick, kind: "join", playerId: id, name });
    return player;
  }

  function leave(player: Player): void {
    if (!players.delete(player.id)) return;
    world.remove(player.entityId);
    options.onRecord?.({ tick, kind: "leave", playerId: player.id });
    player.conn?.close();
    if (player.id === hostId) close("host-left");
  }

  function close(reason: CloseReason): void {
    if (state === "closed") return;
    state = "closed";
    const remaining = [...players.values()];
    players.clear();
    for (const p of remaining) {
      p.conn?.send({ type: "session-closed", reason } satisfies ServerMessage);
      p.conn?.close();
    }
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
        if (msg.protocolVersion !== PROTOCOL_VERSION) {
          reject(conn, "protocol-mismatch", protocolMismatchMessage(PROTOCOL_VERSION, msg.protocolVersion));
          return;
        }
        if (state === "closed") {
          reject(conn, "session-closed", "A sessão foi encerrada.");
          return;
        }
        if (players.size >= MAX_PLAYERS) {
          reject(conn, "session-full", `A sessão está cheia (${MAX_PLAYERS} jogadores).`);
          return;
        }
        player = join(msg.name, conn);
        conn.send({
          type: "welcome",
          protocolVersion: PROTOCOL_VERSION,
          playerId: player.id,
          entityId: player.entityId,
          tick,
          tickRateHz: 20,
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
          enqueue(player, { seq: msg.seq, dir: msg.dir, buttons: msg.buttons });
          return;
      }
    });

    conn.onClose(() => {
      if (player) leave(player);
    });
  }

  function step(): void {
    if (state === "closed") return;
    // Timeouts run before the tick advances so they record like any other leave between ticks.
    for (const p of [...players.values()]) {
      if (tick + 1 - p.lastSeenTick >= timeoutTicks) {
        options.log(`Player ${p.id} timed out`);
        leave(p);
      }
    }
    // A timed-out host closes the session; TS cannot see that mutation through leave().
    if ((state as Session["state"]) === "closed") return;
    tick++;
    for (const p of players.values()) {
      const input = p.queue.shift();
      if (!input) continue;
      p.lastInputSeq = input.seq;
      options.onRecord?.({ tick, kind: "input", playerId: p.id, input });
      const entity = world.get(p.entityId)!;
      world.update(stepMovement(entity, input.dir, options.collision(entity.area)));
    }
    const entities = world.all();
    for (const p of players.values()) {
      p.conn?.send(replicate(p.replica, world.get(p.entityId)!, entities, tick, p.lastInputSeq));
    }
  }

  return {
    get state() {
      return state;
    },
    get tick() {
      return tick;
    },
    world,
    rng,
    connect,
    step,
    close,
    broadcast(msg) {
      for (const p of players.values()) p.conn?.send(msg);
    },
    join: (name) => join(name, undefined).id,
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
