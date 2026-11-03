import {
  isHostToServerMessage,
  PROTOCOL_VERSION,
  type HostToServerMessage,
  type ServerToHostMessage,
} from "@soulsilver/shared";
import type { Decision } from "@soulsilver/shared/ai";
import type { WorldLookup } from "@soulsilver/shared/game";
import type { CombatData } from "./combat-loader";
import type { CompanionData } from "./companion-loader";
import type { WildData } from "./wild-loader";
import type { ProgressionData } from "./progression";
import type { ItemsData } from "./items";
import type { ShopData } from "./shop";
import type { ScriptData, StuckPlayer } from "./scripts";
import type { TrainerData } from "./trainer-loader";
import type { MissingCommand } from "@soulsilver/shared/script";
import type { Connection } from "./connection";
import { checkCoherence } from "@soulsilver/shared/save";
import { createSession, MAX_PLAYERS, type Session } from "./session";
import { createTickLoop, type Scheduler, type TickLoop } from "./tick-loop";
import { createTickMetrics } from "./tick-metrics";

interface HostedConnection {
  conn: Connection;
  receive(msg: unknown): void;
  /** Closed by the host side; does not echo client-close back. */
  drop(): void;
}

const TICK_RATE_HZ = 20;
/** IV 31, no EVs, Hardy; experience 0 is raised to the level's minimum on join. */
const devStats = { experience: 0, ivs: { hp: 31, attack: 31, defense: 31, speed: 31, specialAttack: 31, specialDefense: 31 }, evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 }, nature: 0 };
/** Cyndaquil, Onix and Pidgey with moves from their level-up sets; HP is capped at the maximum on join. */
const DEV_PARTY = [
  { species: 155, level: 12, moves: [33, 43, 52, 108], hp: 999, friendship: 120, ...devStats },
  { species: 95, level: 12, moves: [33, 103, 20, 88], hp: 999, friendship: 70, ...devStats },
  { species: 16, level: 8, moves: [33, 28, 16], hp: 999, friendship: 70, ...devStats },
];

/** Development builds: 20 Poké Balls for a save with an empty bag (spec 015). */
const DEV_BAG = [{ item: 4, count: 20 }];

export interface GameServerOptions extends Scheduler {
  send(msg: ServerToHostMessage): void;
  /** Called when the server cannot continue (e.g. protocol mismatch); the host process should exit. */
  onFatal(): void;
  log(message: string): void;
  /** The extracted world; open ground everywhere when omitted. */
  world?: WorldLookup | undefined;
  /** Combat data (spec 013); no combat when omitted. */
  combat?: CombatData | undefined;
  /** Development builds: accept the dev arena, and give saves with no party a test party (spec 014) and an empty bag 20 Poké Balls (spec 015). */
  devArena?: boolean | undefined;
  /** Wild Pokémon and capture (spec 015); none when omitted. */
  wild?: WildData | undefined;
  /** Companion rules (spec 014); nobody follows when omitted. */
  companion?: CompanionData | undefined;
  /** Experience, levels and evolution (spec 016); nobody grows when omitted. */
  progression?: ProgressionData | undefined;
  /** Item use from the bag (spec 017). */
  items?: ItemsData | undefined;
  /** Every combat AI decision (spec 019, FR-034); the host writes them to a log when asked. */
  onDecision?: ((d: Decision) => void) | undefined;
  /** Event scripts (spec 020); nobody talks and nothing triggers when omitted. */
  scripts?: ScriptData | undefined;
  /** Every command a script reached that nothing implements (spec 020); the host logs them. */
  onMissingCommand?: ((m: MissingCommand & { player: number }) => void) | undefined;
  /** A script left the player unable to move (spec 024). */
  onStuck?: ((s: StuckPlayer) => void) | undefined;
  /** Trainer battles (spec 022); no trainer fights when omitted. */
  trainers?: TrainerData | undefined;
  /** Poké Marts (spec 023); clerks' scripts end as missing when omitted. */
  shops?: ShopData | undefined;
  /** Opens/closes the LAN socket for other PCs (hosted sessions only); results go back as `listening`/`listen-failed`. */
  listen?(on: boolean): void;
}

export interface GameServer {
  handleMessage(msg: unknown): void;
  stop(): void;
}

export function createGameServer(options: GameServerOptions): GameServer {
  let appVersion = "";
  let startedAt = 0;
  let tick = 0;
  let loop: TickLoop | undefined;
  let session: Session | undefined;
  /** Sessions waiting for the final save acks; they keep stepping until they close. */
  const closing = new Set<Session>();
  const conns = new Map<number, HostedConnection>();
  const metrics = createTickMetrics();

  function newSession(): Session {
    const world = options.world ?? (() => undefined);
    return createSession({
      seed: (Math.random() * 0x100000000) >>> 0,
      world,
      log: (message) => {
        options.log(message);
      },
      clock: () => new Date().toISOString(),
      newToken: () => crypto.randomUUID(),
      combat: options.combat,
      devArena: options.devArena,
      companion: options.companion,
      wild: options.wild,
      progression: options.progression,
      items: options.items,
      onDecision: options.onDecision,
      scripts: options.scripts,
      intro: true,
      onMissingCommand: options.onMissingCommand,
      onStuck: options.onStuck,
      trainers: options.trainers,
      shops: options.shops,
      // Development builds may change story flags from the script debugger.
      devTools: options.devArena,
      hour: () => new Date().getHours(),
      weekday: () => new Date().getDay(),
      ...(options.devArena ? { devParty: DEV_PARTY, devBag: DEV_BAG } : {}),
      // Without an extracted world there is nothing to check a save against.
      ...(options.world
        ? {
            validateSave: (save) => {
              const result = checkCoherence(save, world);
              return result.ok ? undefined : result.message;
            },
          }
        : {}),
    });
  }

  function hostConnection(connId: number): HostedConnection {
    const listeners: ((msg: unknown) => void)[] = [];
    const closeListeners: (() => void)[] = [];
    let closed = false;
    const shut = (notifyHost: boolean) => {
      if (closed) return;
      closed = true;
      conns.delete(connId);
      if (notifyHost) options.send({ type: "client-close", connId });
      for (const l of closeListeners) l();
    };
    return {
      conn: {
        send: (msg) => {
          if (!closed) options.send({ type: "client-send", connId, msg });
        },
        onMessage: (l) => listeners.push(l),
        onClose: (l) => closeListeners.push(l),
        close: () => shut(true),
      },
      receive: (msg) => {
        for (const l of listeners) l(msg);
      },
      drop: () => shut(false),
    };
  }

  function init(msg: Extract<HostToServerMessage, { type: "init" }>): void {
    if (loop) return;
    if (msg.protocolVersion !== PROTOCOL_VERSION) {
      options.send({
        type: "error",
        code: "protocol-mismatch",
        message: `Server protocol ${PROTOCOL_VERSION}, host protocol ${msg.protocolVersion}`,
      });
      options.onFatal();
      return;
    }
    appVersion = msg.appVersion;
    startedAt = options.now();
    loop = createTickLoop({
      now: options.now,
      schedule: options.schedule,
      cancel: options.cancel,
      hz: TICK_RATE_HZ,
      onTick: (n) => {
        tick = n;
        const startedTick = options.now();
        session?.step();
        for (const s of closing) {
          s.step();
          if (s.state === "closed") closing.delete(s);
        }
        metrics.record(options.now() - startedTick);
        if (n % TICK_RATE_HZ === 0) session?.broadcast({ type: "debug", metrics: metrics.snapshot() });
        options.send({ type: "status", status: { state: "running", tick } });
      },
      onOverrun: (dropped) => {
        metrics.overrun(dropped);
        options.log(`Tick loop behind schedule; dropped ${dropped} ticks`);
      },
    });
    options.send({ type: "ready", protocolVersion: PROTOCOL_VERSION });
    loop.start();
  }

  return {
    handleMessage(msg) {
      if (!isHostToServerMessage(msg)) {
        options.log(`Discarded invalid message: ${JSON.stringify(msg)}`);
        return;
      }
      if (msg.type === "init") {
        init(msg);
        return;
      }
      if (!loop) {
        options.log(`Discarded ${msg.type} received before init`);
        return;
      }
      if (msg.type === "client-message") {
        let hosted = conns.get(msg.connId);
        if (!hosted) {
          if (!session || session.state !== "open") {
            if (session?.state === "closing") closing.add(session);
            session = newSession();
          }
          hosted = hostConnection(msg.connId);
          conns.set(msg.connId, hosted);
          session.connect(hosted.conn);
        }
        hosted.receive(msg.msg);
        return;
      }
      if (msg.type === "listen" || msg.type === "unlisten") {
        options.listen?.(msg.type === "listen");
        return;
      }
      if (msg.type === "client-close") {
        conns.get(msg.connId)?.drop();
        return;
      }
      options.send({
        type: "info",
        requestId: msg.requestId,
        info: {
          appVersion,
          protocolVersion: PROTOCOL_VERSION,
          serverStatus: { state: "running", tick },
          tickRateHz: TICK_RATE_HZ,
          uptimeMs: Math.round(options.now() - startedAt),
          players: session?.state === "open" ? session.occupied : 0,
          maxPlayers: MAX_PLAYERS,
        },
      });
    },
    stop() {
      loop?.stop();
      session?.close("closed-by-host");
    },
  };
}
