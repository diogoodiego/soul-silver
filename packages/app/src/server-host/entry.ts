// Entry point of the game server utility process. Adapts Electron's parentPort
// to the pure @soulsilver/server package.
import type {} from "electron";
import { createGameServer, loadWorld } from "@soulsilver/server";

const port = process.parentPort;
const log = (message: string) => {
  console.warn(`[game-server] ${message}`);
};
/** The extraction's stages folder, passed by the main process. */
const stagesDir = process.argv.at(-1);

const server = createGameServer({
  send: (msg) => {
    port.postMessage(msg);
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
