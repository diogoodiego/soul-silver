// Entry point of the game server utility process. Adapts Electron's parentPort
// to the pure @soulsilver/server package.
import type {} from "electron";
import { createWriteStream } from "node:fs";
import { createGameServer } from "@soulsilver/server";
import { LAN_PORT_GAME } from "@soulsilver/shared/lan";
import type { ServerToHostMessage } from "@soulsilver/shared";
import { loadServerData } from "./server-data";
import { createWsListener, REMOTE_CONN_BASE } from "./ws-listener";
import { join } from "node:path";
import { openTradeLedger } from "./trade-ledger";

const port = process.parentPort;
const log = (message: string) => {
  console.warn(`[game-server] ${message}`);
};
/** The extraction's stages folder, passed by the main process. */
const stagesDir = process.argv.at(-1);
/** Set by the main process in unpackaged (development) runs: debug commands and the test kit. */
const devTools = process.argv.includes("--dev-arena");
/** Development: SOULSILVER_AI_LOG=<file> appends every combat AI decision as one JSON line (spec 019, FR-034). */
const aiLog = process.env["SOULSILVER_AI_LOG"] ? createWriteStream(process.env["SOULSILVER_AI_LOG"], { flags: "a" }) : undefined;
/** Development: SOULSILVER_SCRIPT_LOG=<file> appends every missing script command as one JSON line (spec 020, FR-008). */
const scriptLog = process.env["SOULSILVER_SCRIPT_LOG"] ? createWriteStream(process.env["SOULSILVER_SCRIPT_LOG"], { flags: "a" }) : undefined;

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
  ...loadServerData(stagesDir, log),
  // The test arena ships in every build; the debug commands stay in development.
  devArena: true,
  devTools,
  // The stages folder is <userData>/extraction/stages: the book lives in <userData>, next to the saves folder.
  tradeLedger: stagesDir ? openTradeLedger(join(stagesDir, "..", "..", "trades-pending.json"), log) : undefined,
  onDecision: aiLog && ((d) => aiLog.write(`${JSON.stringify(d)}\n`)),
  onMissingCommand: scriptLog && ((m) => scriptLog.write(`${JSON.stringify({ time: new Date().toISOString(), ...m })}\n`)),
  onStuck: scriptLog && ((s) => scriptLog.write(`${JSON.stringify({ time: new Date().toISOString(), stuck: true, ...s })}\n`)),
});

port.on("message", (event) => {
  server.handleMessage(event.data);
});
