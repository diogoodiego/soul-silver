// Entry point of the game server utility process. Adapts Electron's parentPort
// to the pure @soulsilver/server package.
import type {} from "electron";
import { createGameServer, loadWorld } from "@soulsilver/server";
import { LAN_PORT_GAME } from "@soulsilver/shared/lan";
import type { ServerToHostMessage } from "@soulsilver/shared";
import { createWsListener, REMOTE_CONN_BASE } from "./ws-listener";

const port = process.parentPort;
const log = (message: string) => {
  console.warn(`[game-server] ${message}`);
};
/** The extraction's stages folder, passed by the main process. */
const stagesDir = process.argv.at(-1);

/** Tries the usual port and the nine after it. */
const LAN_PORTS = Array.from({ length: 10 }, (_, i) => LAN_PORT_GAME + i);

const lan = createWsListener({
  ports: LAN_PORTS,
  onMessage: (connId, msg) => {
    server.handleMessage({ type: "client-message", connId, msg });
  },
  onClose: (connId) => {
    server.handleMessage({ type: "client-close", connId });
  },
  log,
});

const send = (msg: ServerToHostMessage) => {
  if (msg.type === "client-send" && msg.connId >= REMOTE_CONN_BASE) lan.send(msg.connId, msg.msg);
  else if (msg.type === "client-close" && msg.connId >= REMOTE_CONN_BASE) lan.close(msg.connId);
  else port.postMessage(msg);
};

const server = createGameServer({
  send,
  listen: (on) => {
    if (!on) {
      lan.stop();
      return;
    }
    lan.start().then(
      (boundPort) => {
        send({ type: "listening", port: boundPort });
      },
      (error: Error) => {
        send({ type: "listen-failed", message: `Não foi possível abrir a porta de rede: ${error.message}` });
      },
    );
  },
  now: () => performance.now(),
  schedule: (fn, delayMs) => setTimeout(fn, delayMs),
  cancel: (handle) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
  onFatal: () => {
    server.stop();
    process.exit(1);
  },
  log,
  world: stagesDir ? loadWorld(stagesDir, log) : undefined,
});

port.on("message", (event) => {
  server.handleMessage(event.data);
});
