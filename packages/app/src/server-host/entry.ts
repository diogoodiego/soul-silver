// Entry point of the game server utility process. Adapts Electron's parentPort
// to the pure @soulsilver/server package.
import type {} from "electron";
import { createGameServer } from "@soulsilver/server";

const port = process.parentPort;

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
  log: (message) => {
    console.warn(`[game-server] ${message}`);
  },
});

port.on("message", (event) => {
  server.handleMessage(event.data);
});
