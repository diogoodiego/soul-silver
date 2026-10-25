// Entry point of the game server utility process. Adapts Electron's parentPort
// to the pure @soulsilver/server package.
import type {} from "electron";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUNDLED_COMBAT_CONTENT, buildCombatData, createGameServer, loadWorld, type CombatData } from "@soulsilver/server";
import { GAME_DATA_FILES, parseGameDataJson, type GameDataFileOf } from "@soulsilver/shared/game-data";
import { LAN_PORT_GAME } from "@soulsilver/shared/lan";
import type { ServerToHostMessage } from "@soulsilver/shared";
import { createWsListener, REMOTE_CONN_BASE } from "./ws-listener";

const port = process.parentPort;
const log = (message: string) => {
  console.warn(`[game-server] ${message}`);
};
/** The extraction's stages folder, passed by the main process. */
const stagesDir = process.argv.at(-1);
/** Set by the main process in unpackaged (development) runs. */
const devArena = process.argv.includes("--dev-arena");

function readExtracted<K extends "moves" | "species" | "type-chart">(dir: string, kind: K): GameDataFileOf<K>["records"] {
  const { stage, file } = GAME_DATA_FILES[kind];
  const path = join(dir, stage, "json", file);
  const parsed = parseGameDataJson(kind, readFileSync(path, "utf8"), path);
  if (!parsed.ok) throw new Error(`${parsed.error.file}: ${parsed.error.path}: ${parsed.error.problem}`);
  return parsed.data.records;
}

/** Combat data (spec 013) checked against the extraction; without it the server runs without combat. */
function combatOrNothing(dir: string): CombatData | undefined {
  try {
    return buildCombatData(BUNDLED_COMBAT_CONTENT, { moves: readExtracted(dir, "moves"), species: readExtracted(dir, "species"), typeChart: readExtracted(dir, "type-chart") });
  } catch (error) {
    log(`Combate desativado: ${(error as Error).message}`);
    return undefined;
  }
}

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
  combat: stagesDir ? combatOrNothing(stagesDir) : undefined,
  devArena,
});

port.on("message", (event) => {
  server.handleMessage(event.data);
});
