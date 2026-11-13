// Launches the built SoulSilver Desktop app with a DevTools port and drives it over CDP.
// Usage (from the repo root): node .claude/skills/run-soulsilver/driver.mjs <outDir> <step...>
// Two instances on one PC (spec 028.7): node .claude/skills/run-soulsilver/driver.mjs --two [--guest-slot=3] <outDir> <step...>
//   The guest gets its own data folder (<outDir>/guest-data): the host's extraction through a junction and a copy of the
//   host's save slot, renamed "Convidado". Steps go to the host unless prefixed: host>step, guest>step, both>step.
//   Shots land in <outDir>/host-<name>.png and <outDir>/guest-<name>.png.
// Steps: wait:<ms>  shot:<name>  hold:<Key>:<ms>  press:<Key>  eval:<js expression>  type:<text> ({ip}: this PC's LAN IPv4)
// Keys: ArrowUp ArrowDown ArrowLeft ArrowRight ShiftLeft F3 F11 KeyB KeyC KeyE KeyF KeyG KeyQ KeyR. Screenshots land in <outDir>/<name>.png.
import { spawn, execSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const two = args[0] === "--two";
if (two) args.shift();
const guestSlot = Number((args[0]?.startsWith("--guest-slot=") ? args.shift() : "--guest-slot=3").split("=")[1]);
const [outDir, ...steps] = args;
if (!outDir) throw new Error("usage: driver.mjs [--two [--guest-slot=N]] <outDir> <step...>");
mkdirSync(outDir, { recursive: true });

const root = resolve(import.meta.dirname, "../../..");
const electron = join(root, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
// A VS Code terminal exports ELECTRON_RUN_AS_NODE=1, which makes Electron start as plain Node.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** This PC's LAN IPv4, for the guest to join the host by IP: a private range first (a VPN adapter's address comes after). */
function localIp() {
  const all = Object.values(networkInterfaces()).flat().filter((a) => a && a.family === "IPv4" && !a.internal).map((a) => a.address);
  const lan = all.find((ip) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip));
  return lan ?? all[0] ?? "127.0.0.1";
}

/** The guest's own data folder: the host's extraction (a junction, nothing copied) and a renamed copy of one host save. */
function guestData() {
  const hostData = join(process.env.APPDATA ?? "", "SoulSilver Desktop");
  const dir = resolve(outDir, "guest-data");
  mkdirSync(join(dir, "saves"), { recursive: true });
  if (!existsSync(join(dir, "extraction"))) execSync(`mklink /J "${join(dir, "extraction")}" "${join(hostData, "extraction")}"`, { shell: "cmd.exe", stdio: "ignore" });
  const save = JSON.parse(readFileSync(join(hostData, "saves", `slot-${guestSlot}.json`), "utf8"));
  // Names are unique within a session.
  writeFileSync(join(dir, "saves", `slot-${guestSlot}.json`), JSON.stringify({ ...save, name: "Convidado" }, null, 2));
  return dir;
}

/** One app instance driven over CDP on `port`; `prefix` names its log and shots. */
async function launch(port, prefix, extra = []) {
  const log = openSync(join(outDir, `${prefix}app.log`), "w");
  const app = spawn(electron, [join(root, "packages", "app"), `--remote-debugging-port=${port}`, ...extra], { env, stdio: ["ignore", log, log] });
  let exited = false;
  app.on("exit", () => (exited = true));
  const quit = () => {
    if (exited) return;
    if (process.platform === "win32") execSync(`taskkill /PID ${app.pid} /T /F`, { stdio: "ignore" });
    else app.kill();
  };
  let page;
  for (let i = 0; i < 60 && !page; i++) {
    await sleep(500);
    // The app holds a single-instance lock per data folder: a second launch on the same folder quits at once.
    if (exited) throw new Error(`${prefix || "the app"} exited right away; is another SoulSilver Desktop already running?`);
    try {
      page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page");
    } catch {}
  }
  if (!page) {
    quit();
    throw new Error(`no page on port ${port}; see ${join(outDir, `${prefix}app.log`)}`);
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0;
  const pending = new Map();
  const tag = prefix ? `[${prefix.slice(0, -1)}] ` : "";
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method === "Runtime.consoleAPICalled") {
      console.log(`${tag}console.${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description).join(" ")}`);
    } else if (msg.method === "Runtime.exceptionThrown") {
      console.log(`${tag}exception: ${msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text}`);
    }
  });
  const send = (method, params = {}) =>
    new Promise((r) => {
      const n = ++id;
      pending.set(n, r);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  await send("Runtime.enable");

  const VK = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, ShiftLeft: 16, F3: 114, F11: 122, KeyB: 66, KeyC: 67, KeyE: 69, KeyF: 70, KeyG: 71, KeyQ: 81, KeyR: 82, Digit1: 49, Digit2: 50, Digit3: 51, Digit4: 52, Space: 32, Enter: 13, Escape: 27, Tab: 9, Backspace: 8, F4: 115, KeyI: 73 };
  const key = (type, code) => send("Input.dispatchKeyEvent", { type, code, key: code === "ShiftLeft" ? "Shift" : code, windowsVirtualKeyCode: VK[code] });

  async function run(step) {
    const [cmd, a, b] = step.split(":");
    if (cmd === "wait") await sleep(Number(a));
    else if (cmd === "shot") {
      const { result } = await send("Page.captureScreenshot", { format: "png" });
      const file = join(outDir, `${prefix}${a}.png`);
      writeFileSync(file, Buffer.from(result.data, "base64"));
      console.log(`${tag}shot: ${file}`);
    } else if (cmd === "hold" || cmd === "press") {
      await key("keyDown", a);
      await sleep(cmd === "hold" ? Number(b) : 50);
      await key("keyUp", a);
    } else if (cmd === "type") {
      await send("Input.insertText", { text: step.slice(5).replaceAll("{ip}", localIp()) });
    } else if (cmd === "eval") {
      const { result } = await send("Runtime.evaluate", { expression: step.slice(5), returnByValue: true, awaitPromise: true });
      console.log(`${tag}eval: ${JSON.stringify(result.result.value ?? result.result.description)}`);
    } else throw new Error(`unknown step ${step}`);
  }
  return { run, quit, close: () => ws.close() };
}

const apps = {};
try {
  if (!two) apps.host = await launch(9222, "");
  else {
    const dir = guestData();
    apps.host = await launch(9222, "host-");
    apps.guest = await launch(9223, "guest-", [`--user-data-dir=${dir}`]);
  }
  for (const step of steps) {
    const at = two ? step.match(/^(host|guest|both)>(.*)$/) : null;
    const targets = !at ? ["host"] : at[1] === "both" ? ["host", "guest"] : [at[1]];
    const body = at ? at[2] : step;
    // "both": the two run side by side, so a wait or a shot lands on both at once.
    await Promise.all(targets.map((t) => apps[t].run(body)));
  }
  for (const a of Object.values(apps)) a.close();
} finally {
  for (const a of Object.values(apps)) a.quit();
}
