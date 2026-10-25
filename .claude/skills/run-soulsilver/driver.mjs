// Launches the built SoulSilver Desktop app with a DevTools port and drives it over CDP.
// Usage (from the repo root): node .claude/skills/run-soulsilver/driver.mjs <outDir> <step...>
// Steps: wait:<ms>  shot:<name>  hold:<Key>:<ms>  press:<Key>  eval:<js expression>
// Keys: ArrowUp ArrowDown ArrowLeft ArrowRight ShiftLeft F3 F11 KeyB KeyE KeyF KeyG KeyQ KeyR. Screenshots land in <outDir>/<name>.png.
import { spawn, execSync } from "node:child_process";
import { mkdirSync, openSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const PORT = 9222;
const [outDir, ...steps] = process.argv.slice(2);
if (!outDir) throw new Error("usage: driver.mjs <outDir> <step...>");
mkdirSync(outDir, { recursive: true });

const root = resolve(import.meta.dirname, "../../..");
const electron = join(root, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
// A VS Code terminal exports ELECTRON_RUN_AS_NODE=1, which makes Electron start as plain Node.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const log = openSync(join(outDir, "app.log"), "w");
const app = spawn(electron, [join(root, "packages", "app"), `--remote-debugging-port=${PORT}`], { env, stdio: ["ignore", log, log] });

let exited = false;
app.on("exit", () => (exited = true));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function quit() {
  if (exited) return;
  if (process.platform === "win32") execSync(`taskkill /PID ${app.pid} /T /F`, { stdio: "ignore" });
  else app.kill();
}

try {
  let page;
  for (let i = 0; i < 60 && !page; i++) {
    await sleep(500);
    // The app holds a single-instance lock: a second launch quits at once.
    if (exited) throw new Error("the app exited right away; is another SoulSilver Desktop already running?");
    try {
      page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === "page");
    } catch {}
  }
  if (!page) throw new Error(`no page on port ${PORT}; see ${join(outDir, "app.log")}`);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method === "Runtime.consoleAPICalled") {
      console.log(`console.${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description).join(" ")}`);
    } else if (msg.method === "Runtime.exceptionThrown") {
      console.log(`exception: ${msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text}`);
    }
  });
  const send = (method, params = {}) =>
    new Promise((r) => {
      const n = ++id;
      pending.set(n, r);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  await send("Runtime.enable");

  const VK = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, ShiftLeft: 16, F3: 114, F11: 122, KeyB: 66, KeyE: 69, KeyF: 70, KeyG: 71, KeyQ: 81, KeyR: 82, Digit1: 49, Digit2: 50, Digit3: 51, Digit4: 52, Space: 32 };
  const key = (type, code) => send("Input.dispatchKeyEvent", { type, code, key: code === "ShiftLeft" ? "Shift" : code, windowsVirtualKeyCode: VK[code] });

  for (const step of steps) {
    const [cmd, a, b] = step.split(":");
    if (cmd === "wait") await sleep(Number(a));
    else if (cmd === "shot") {
      const { result } = await send("Page.captureScreenshot", { format: "png" });
      writeFileSync(join(outDir, `${a}.png`), Buffer.from(result.data, "base64"));
      console.log(`shot: ${join(outDir, `${a}.png`)}`);
    } else if (cmd === "hold" || cmd === "press") {
      await key("keyDown", a);
      await sleep(cmd === "hold" ? Number(b) : 50);
      await key("keyUp", a);
    } else if (cmd === "eval") {
      const { result } = await send("Runtime.evaluate", { expression: step.slice(5), returnByValue: true, awaitPromise: true });
      console.log(`eval: ${JSON.stringify(result.result.value ?? result.result.description)}`);
    } else throw new Error(`unknown step ${step}`);
  }
  ws.close();
} finally {
  quit();
}
