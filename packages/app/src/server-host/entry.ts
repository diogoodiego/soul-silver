// Entry point of the game server utility process. Adapts Electron's parentPort
// to the pure @soulsilver/server package.
import type {} from "electron";
import { createWriteStream, readFileSync } from "node:fs";
import { join } from "node:path";
import { BUNDLED_COMBAT_CONTENT, BUNDLED_COMPANION_CONTENT, BUNDLED_WILD_CONTENT, buildCombatData, buildCompanionData, buildItemsData, buildProgressionData, buildWildData, createGameServer, loadWorld, type CombatData, type CompanionData, type ItemsData, type ProgressionData, type WildData } from "@soulsilver/server";
import { LAN_PORT_GAME } from "@soulsilver/shared/lan";
import { parseEventsJson } from "@soulsilver/shared/events";
import { parseSpriteJson } from "@soulsilver/shared/sprites";
import { parseTextJson } from "@soulsilver/shared/text";
import type { ServerToHostMessage } from "@soulsilver/shared";
import { readExtracted } from "./extracted";
import { loadScripts } from "./scripts-loader";
import { createWsListener, REMOTE_CONN_BASE } from "./ws-listener";

const port = process.parentPort;
const log = (message: string) => {
  console.warn(`[game-server] ${message}`);
};
/** The extraction's stages folder, passed by the main process. */
const stagesDir = process.argv.at(-1);
/** Set by the main process in unpackaged (development) runs. */
const devArena = process.argv.includes("--dev-arena");
/** Development: SOULSILVER_AI_LOG=<file> appends every combat AI decision as one JSON line (spec 019, FR-034). */
const aiLog = process.env["SOULSILVER_AI_LOG"] ? createWriteStream(process.env["SOULSILVER_AI_LOG"], { flags: "a" }) : undefined;
/** Development: SOULSILVER_SCRIPT_LOG=<file> appends every missing script command as one JSON line (spec 020, FR-008). */
const scriptLog = process.env["SOULSILVER_SCRIPT_LOG"] ? createWriteStream(process.env["SOULSILVER_SCRIPT_LOG"], { flags: "a" }) : undefined;

/** Combat data (spec 013) checked against the extraction; without it the server runs without combat. */
function combatOrNothing(dir: string): CombatData | undefined {
  try {
    return buildCombatData(BUNDLED_COMBAT_CONTENT, { moves: readExtracted(dir, "moves"), species: readExtracted(dir, "species"), typeChart: readExtracted(dir, "type-chart") });
  } catch (error) {
    log(`Combate desativado: ${(error as Error).message}`);
    return undefined;
  }
}

function readJson<T>(parse: (text: string, path: string) => { ok: true; data: T } | { ok: false; error: { file: string; path: string; problem: string } }, path: string): T {
  const parsed = parse(readFileSync(path, "utf8"), path);
  if (!parsed.ok) throw new Error(`${parsed.error.file}: ${parsed.error.path}: ${parsed.error.problem}`);
  return parsed.data;
}

/** Companion rules (spec 014): the bundled data, with Pokémon sizes and reaction texts from the extraction when there is one. */
function companionOrNothing(dir: string | undefined): CompanionData | undefined {
  try {
    if (!dir) return buildCompanionData(BUNDLED_COMPANION_CONTENT);
    return buildCompanionData(BUNDLED_COMPANION_CONTENT, {
      overworld: readJson((t, p) => parseSpriteJson("sprite-set", t, p), join(dir, "sprites", "sprites", "overworld-pokemon.json")),
      textIds: (bank) => readJson((t, p) => parseTextJson("text-bank", t, p), join(dir, "text-catalog", "catalog", "en", `${String(bank).padStart(4, "0")}.json`)).records.map((r) => r.id),
    });
  } catch (error) {
    log(`Companheiro desativado: ${(error as Error).message}`);
    return undefined;
  }
}


/** Wild Pokémon (spec 015): the bundled data plus encounter tables, learnsets, catch rates and evolutions from the extraction. */
function wildOrNothing(dir: string): WildData | undefined {
  try {
    return buildWildData(BUNDLED_WILD_CONTENT, {
      encounters: readJson((t, p) => parseEventsJson("encounters", t, p), join(dir, "events", "events", "encounters.json")).records,
      learnsets: readExtracted(dir, "learnsets"),
      species: readExtracted(dir, "species"),
      evolutions: readExtracted(dir, "evolutions"),
    });
  } catch (error) {
    log(`Selvagens desativados: ${(error as Error).message}`);
    return undefined;
  }
}
/** Progression (spec 016): base experience, EV yields, curves, learnsets and evolutions from the extraction. */
function progressionOrNothing(dir: string): ProgressionData | undefined {
  try {
    return buildProgressionData({ species: readExtracted(dir, "species"), learnsets: readExtracted(dir, "learnsets"), evolutions: readExtracted(dir, "evolutions") });
  } catch (error) {
    log(`Progressão desativada: ${(error as Error).message}`);
    return undefined;
  }
}

/** Items used from the bag (spec 017); without them every item is unavailable. */
function itemsOrNothing(dir: string): ItemsData | undefined {
  try {
    return buildItemsData(readExtracted(dir, "items"));
  } catch (error) {
    log(`Itens desativados: ${(error as Error).message}`);
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
  companion: companionOrNothing(stagesDir),
  wild: stagesDir ? wildOrNothing(stagesDir) : undefined,
  progression: stagesDir ? progressionOrNothing(stagesDir) : undefined,
  items: stagesDir ? itemsOrNothing(stagesDir) : undefined,
  devArena,
  onDecision: aiLog && ((d) => aiLog.write(`${JSON.stringify(d)}\n`)),
  scripts: stagesDir ? loadScripts(stagesDir, log) : undefined,
  onMissingCommand: scriptLog && ((m) => scriptLog.write(`${JSON.stringify({ time: new Date().toISOString(), ...m })}\n`)),
});

port.on("message", (event) => {
  server.handleMessage(event.data);
});
