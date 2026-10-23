import {
  isHostToServerMessage,
  PROTOCOL_VERSION,
  type HostToServerMessage,
  type ServerToHostMessage,
} from "@soulsilver/shared";
import { createTickLoop, type Scheduler, type TickLoop } from "./tick-loop";

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
        options.send({ type: "status", status: { state: "running", tick } });
      },
      onOverrun: (dropped) => {
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
        options.log("Discarded get-info received before init");
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
    },
  };
}
