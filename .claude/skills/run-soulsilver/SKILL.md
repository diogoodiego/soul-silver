---
name: run-soulsilver
description: Build, run and drive the SoulSilver Desktop Electron app (game client + local game server). Use when asked to run or start the app, play or walk around the game, take a screenshot of the game, check a map/warp/movement change in the real app, or run its tests.
---

SoulSilver Desktop is an Electron app (`packages/app`) that hosts the game server in a utility
process and renders the game in 3D with three.js in the renderer (`packages/client`). An agent drives it
with `.claude/skills/run-soulsilver/driver.mjs`: it launches the built app with a DevTools port,
sends key presses and evals over CDP, saves screenshots, then closes the app.

All paths are relative to the repo root. Verified on Windows 11 with a desktop session, from Git
Bash. Not tried on Linux.

## Prerequisites

- `npm install` at the repo root.
- A finished ROM extraction in `%APPDATA%\SoulSilver Desktop\extraction\stages\` (maps, events,
  sprites). Without it the app opens on the first-run screen or the world is empty, black ground.
  The extraction is never in git (principle II).

## Build

The driver runs the built app, not the dev server. Rebuild after every source change:

```bash
npm run build -w @soulsilver/app
```

## Run (agent path)

```bash
node .claude/skills/run-soulsilver/driver.mjs <outDir> <step> <step> ...
```

Steps, run in order:

| Step | Effect |
|---|---|
| `wait:<ms>` | sleep |
| `press:<Key>` | key down + up |
| `hold:<Key>:<ms>` | hold a key (movement is per 50 ms tick: 3 px walking) |
| `shot:<name>` | screenshot to `<outDir>/<name>.png` |
| `eval:<js>` | evaluate in the page (promises awaited), prints the value |

Keys: `ArrowUp ArrowDown ArrowLeft ArrowRight ShiftLeft Space Enter Escape Tab Backspace F3 F4 F11`, `Digit1`–`Digit4` and `KeyB KeyC KeyE KeyF KeyG KeyQ KeyR`.

**The app opens on the title screen (spec 017).** From there, `press:Enter` four times (title → Jogar → the
last saved slot, already focused → Sozinho) reaches the map; add `wait:600` between presses and
`wait:6000` after the last. `Tab` opens the in-game menu, `Escape` goes back. `F4` shows the yes/no
dialog test, only in a development build (`npx electron-vite build --mode development` in `packages/app`). The renderer's console output
and exceptions are printed too; the main/server process output goes to `<outDir>/app.log`.

**Read the game state from the F3 overlay**: `press:F3` shows it; its first `dd` is the
player's position, e.g. `mapa 60 · 200, 168 · nível 0` (map id, feet x/y in pixels, level).

Verified flow: spawn in New Bark Town (map 60), walk into the door above, arrive in map 61,
walk back out:

```bash
O=/tmp/ss-run   # any folder; on Windows use e.g. "$TEMP/ss-run"
P="eval:document.querySelector('.debug dd')?.innerText"
node .claude/skills/run-soulsilver/driver.mjs "$O" wait:2000 press:F3 "$P" shot:newbark \
  hold:ArrowUp:250 wait:1200 "$P" shot:inside hold:ArrowDown:200 wait:1200 "$P" shot:outside
# eval: "mapa 60 · 200, 168 · nível 0"
# eval: "mapa 61 · 72, 232 · nível 0"
# eval: "mapa 60 · 200, 168 · nível 0"
```

Then open the PNGs and look at them. The game is drawn at 256×192, scaled by a whole factor and
centred with black bars, so the screenshot has a black border around the game.

`type:<text>` types into the focused field (`{ip}` becomes this PC's LAN IPv4, a private range first).

## Run two instances (host + guest, spec 028.7)

```bash
node .claude/skills/run-soulsilver/driver.mjs --two [--guest-slot=3] <outDir> <step> <step> ...
```

- The host is the normal app (your data folder, DevTools port 9222). The guest runs with
  `--user-data-dir=<outDir>/guest-data` (port 9223): the app's single-instance lock is per data folder,
  so both can run at once.
- The guest folder holds a junction to the host's `extraction` folder (nothing copied) and a copy of
  the host's `saves/slot-<N>.json` (slot 3 by default, the test save) renamed "Convidado", since names
  are unique within a session. The copy is rewritten on every run; the host's own saves are never touched.
- Steps go to the host unless prefixed: `host>step`, `guest>step`, `both>step` (run side by side on
  both). Shots land in `<outDir>/host-<name>.png` and `<outDir>/guest-<name>.png`; the logs in
  `host-app.log` and `guest-app.log`. Keep `>` quoted or escaped in the shell (`both\>wait:500`).

Verified flow: the host hosts slot 3, the guest joins by the LAN IP, both screens and Online tabs
are captured.

```bash
O=.evidence/028/duas-instancias
B="[...document.querySelectorAll('button')]"
node .claude/skills/run-soulsilver/driver.mjs --two "$O" both\>wait:2500 both\>press:Enter both\>wait:600 both\>press:Enter both\>wait:2000 \
  "host>eval:$B.find(b=>b.innerText.startsWith('Teste026')).click()" "guest>eval:$B.find(b=>b.innerText.startsWith('Convidado')).click()" both\>wait:800 \
  "host>eval:$B.find(b=>b.innerText==='Hospedar').click()" host\>wait:7000 \
  "guest>eval:$B.find(b=>b.innerText==='Entrar').click()" guest\>wait:1000 \
  "guest>eval:(i=>{i.focus();i.select();})(document.querySelector('input'))" "guest>type:{ip}" \
  "guest>eval:$B.find(b=>b.innerText==='Conectar').click()" guest\>wait:8000 both\>shot:01-mapa \
  "both>eval:$B.find(b=>b.innerText.trim()==='Online')?.click()" both\>wait:800 both\>shot:02-online
```

The guest starts with empty caches and is slower: give it the 2 s before the slot click. On the slot screen the save buttons start with the save's name (`Teste026` is slot 3 here; the guest's
copy shows as `Convidado`). The join screen lists the sessions found on the LAN and a field with the
host's IP; the guest steps above type the IP by hand, as the manual connection does.

Useful map ids: 60 New Bark Town, 33 Route 29 (west of New Bark), 67 Cherrygrove City.
From the spawn, `hold:ArrowDown:300 hold:ArrowLeft:2400 hold:ArrowDown:1500 hold:ArrowLeft:2300`
walks around the trees and crosses into Route 29 (`mapa 33 · 1532, 266`).

## Run (human path)

```bash
env -u ELECTRON_RUN_AS_NODE npm run dev
```

Starts the Vite dev server on `localhost:5173` and opens the window with hot reload; it runs until
the window closes. Arrows/WASD walk, Shift runs, F3 debug, F11 fullscreen.

## Test

```bash
npm run typecheck
npx vitest run
```

`packages/server/test/route-warps.test.ts` checks the real route warps against the local
extraction and is skipped without one (`SOULSILVER_STAGES` overrides the folder).

## Gotchas

- **`ELECTRON_RUN_AS_NODE=1` is set in VS Code terminals.** Launched from there, Electron runs as
  plain Node and dies with `The requested module 'electron' does not provide an export named
  'BrowserWindow'`. The driver removes it from the child's environment; do the same by hand
  (`env -u ELECTRON_RUN_AS_NODE ...`) if you launch Electron yourself.
- **Single instance.** The app takes a single-instance lock; a second launch quits at once (the
  driver reports "the app exited right away"). Close leftovers first:
  `taskkill //F //IM electron.exe`.
- **The window takes keyboard focus.** Anything typed elsewhere while the driver runs goes to
  the game, and W/A/S/D move the player. Positions then drift between runs. Check the position
  with the F3 overlay before relying on it; don't type during a run.
- **Exceptions after a renderer change look like a black screen.** The canvas is still there.
  Check the driver's `exception:` lines and `eval` `[...document.querySelectorAll('canvas')]`.
- **`npx vitest run` has a timing-sensitive test** (`server/test/perf.test.ts`, worst tick
  under 10 ms) that can fail when the whole suite runs in parallel; it passes alone
  (`npx vitest run packages/server/test/perf.test.ts`). `extractor/test/maps/stage.test.ts`
  ("byte-identical output") also fails in full runs on this machine.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Command failed: taskkill /PID ...` or "exited right away" | another instance is running; `taskkill //F //IM electron.exe` |
| Overlay says `[game] No extracted maps` in console, black world | extraction missing, or the `assets://` protocol failed; `eval:fetch('assets://stages/maps/maps/map-headers.json').then(r=>r.status)` must print 200 |
| Screenshot is the info list with "Conectando ao servidor de jogo…" | game server not up yet; `wait` longer |
