import {
  isHostToServerMessage,
  PROTOCOL_VERSION,
  type HostToServerMessage,
  type ServerToHostMessage,
} from "@soulsilver/shared";
import type { Connection } from "./connection";
import { createSession, type Session } from "./session";
import { createTickLoop, type Scheduler, type TickLoop } from "./tick-loop";
import { createTickMetrics } from "./tick-metrics";

interface HostedConnection {
  conn: Connection;
  receive(msg: unknown): void;
  /** Closed by the host side; does not echo client-close back. */
  drop(): void;
}

const TICK_RATE_HZ = 20;

export interface GameServerOptions extends Scheduler {
  send(msg: ServerToHostMessage): void;
  /** Called when the server cannot continue (e.g. protocol mismatch); the host process should exit. */
  onFatal(): void;
  log(message: string): void;
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
  const conns = new Map<number, HostedConnection>();
  const metrics = createTickMetrics();

  function newSession(): Session {
    return createSession({
      seed: (Math.random() * 0x100000000) >>> 0,
      // shortcut: one fixed spawn and no collision until world loading lands (spec 011).
      spawn: () => ({ area: "start", x: 0, y: 0 }),
      collision: () => undefined,
      log: options.log,
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
          if (!session || session.state === "closed") session = newSession();
          hosted = hostConnection(msg.connId);
          conns.set(msg.connId, hosted);
          session.connect(hosted.conn);
        }
        hosted.receive(msg.msg);
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
        },
      });
    },
    stop() {
      loop?.stop();
      session?.close("closed-by-host");
    },
  };
}
