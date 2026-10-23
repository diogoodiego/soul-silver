---

description: "Lista de tasks da feature 001-project-foundation"
---

# Tasks: Fundação do projeto

**Input**: Design documents from `/specs/001-project-foundation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: incluídos. O spec exige pelo menos um teste por pacote (FR-002), e o princípio V da
constituição exige test-first para servidor, protocolo e lógica. As tasks de teste marcadas
como **test-first** MUST ser escritas antes e falhar antes da implementação correspondente. A
janela Svelte fica isenta de test-first e é verificada manualmente.

**Organization**: tasks agrupadas por história de usuário, para cada uma ser implementada e
testada de forma independente.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: história de usuário da task (US1 a US5)
- Caminhos relativos à raiz do repositório `C:\dev\soul-silver`

## Regras gerais para quem executa

- Código, identificadores, commits e comentários em inglês; README e mensagens ao
  desenvolvedor em PT-BR.
- Usar a última versão estável de cada dependência no momento da instalação; o
  `package-lock.json` fixa as versões exatas. Conferir compatibilidade entre `electron-vite`,
  `vite` e `@sveltejs/vite-plugin-svelte` antes de fixar.
- Nenhuma task é concluída sem `npm run typecheck`, `npm run lint` e `npm test` passando, a
  partir do momento em que esses comandos existirem (US3).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: raiz do monorepo e ferramentas comuns

- [X] T001 Create root `package.json` with `"name": "soul-silver"`, `"private": true`, `"type": "module"`, `"workspaces": ["packages/*"]`, `"engines": { "node": ">=24 <25" }`, and devDependencies `typescript`, `@types/node`, `vitest` (scripts are added by later tasks)
- [X] T002 [P] Create `.nvmrc` containing `24` and `.npmrc` containing `engine-strict=true` (R2)
- [X] T003 [P] Create `.gitignore` (`node_modules/`, `out/`, `dist/`, `coverage/`, `assets/`, `*.nds`, `*.NDS`) and `.gitattributes` (`* text=auto eol=lf`; `.githooks/* text eol=lf`)
- [X] T004 [P] Create `tsconfig.base.json` with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `isolatedModules`, `skipLibCheck`, `noEmit`, `target: ES2023`, `module: ESNext`, `moduleResolution: Bundler` (R3)
- [X] T005 [P] Create root `tsconfig.json` extending `tsconfig.base.json` that typechecks `scripts/**/*.ts` and root `*.config.ts` with `module: NodeNext`, `moduleResolution: NodeNext`, `allowImportingTsExtensions: true`, `types: ["node"]` (scripts run directly with Node 24 type stripping, so relative imports use the `.ts` extension)
- [X] T006 Create root `vitest.config.ts` with `test.projects: ["packages/*", "scripts"]` (R10); if Vitest errors on the missing `scripts/` folder before US4, add `"scripts"` to the list in T049 instead

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: esqueleto dos cinco pacotes, ligados por workspaces

**⚠️ CRITICAL**: nenhuma história começa antes desta fase

Cada pacote: `package.json` com `"type": "module"`, `"private": true`, `"exports": { ".": "./src/index.ts" }` (sem build entre pacotes, R3), script `"typecheck": "tsc --noEmit"`; `tsconfig.json` estendendo `../../tsconfig.base.json` com `include: ["src", "test"]`; `vitest.config.ts` com `test.name` igual ao nome curto do pacote; `src/index.ts` inicial.

- [X] T007 [P] Create package `@soulsilver/shared` in `packages/shared/` (`package.json`, `tsconfig.json`, `vitest.config.ts` with name `shared`, `src/index.ts`)
- [X] T008 [P] Create package `@soulsilver/server` in `packages/server/` with dependency `"@soulsilver/shared": "*"` (`package.json`, `tsconfig.json` with `types: []` so Node globals are not available in `src`, `vitest.config.ts` with name `server`, `src/index.ts`)
- [X] T009 [P] Create package `@soulsilver/extractor` in `packages/extractor/` (`package.json`, `tsconfig.json`, `vitest.config.ts` with name `extractor`, `src/index.ts` exporting `export const extractorPackageName = "@soulsilver/extractor";`)
- [X] T010 [P] Create package `@soulsilver/client` in `packages/client/` with dependencies `svelte` (5.x), devDependencies `@sveltejs/vite-plugin-svelte`, `svelte-check`; `tsconfig.json` with `lib: ["ES2023", "DOM", "DOM.Iterable"]`, `types: []`; `vitest.config.ts` with name `client`; script `"typecheck": "svelte-check --tsconfig ./tsconfig.json --fail-on-warnings"`
- [X] T011 [P] Create package `@soulsilver/app` in `packages/app/` with `"version": "0.1.0"`, `"main": "./out/main/index.js"`, dependencies `@soulsilver/shared`, `@soulsilver/server`, devDependencies `electron`, `electron-vite`, `vite`; `tsconfig.json` with `types: ["node"]`; `vitest.config.ts` with name `app` and `environment: "node"`
- [X] T012 Run `npm install` at the root to create `package-lock.json`; confirm `node_modules/@soulsilver/*` links exist for the five packages

**Checkpoint**: workspaces resolvidos; histórias podem começar

---

## Phase 3: User Story 1 - Do clone ao app aberto (Priority: P1) 🎯 MVP

**Goal**: `npm install` + `npm run dev` abrem a janela de placeholder do app, já com o renderer
isolado.

**Independent Test**: quickstart, cenário 1. Num clone limpo com Node 24, seguir o README abre
a janela "SoulSilver Desktop" em menos de 15 min; com outro Node, `npm install` falha com a
versão esperada.

### Tests for User Story 1 (test-first) ⚠️

- [X] T013 [US1] Write failing test `packages/app/test/window-options.test.ts` for `createWindowOptions(preloadPath)`: asserts `webPreferences.contextIsolation === true`, `nodeIntegration === false`, `sandbox === true`, `webSecurity === true`, `preload === preloadPath`, `title === "SoulSilver Desktop"`, and that `nodeIntegrationInWorker`, `nodeIntegrationInSubFrames` and `webviewTag` are not enabled (FR-013, R8)

### Implementation for User Story 1

- [X] T014 [US1] Implement `createWindowOptions(preloadPath: string): BrowserWindowConstructorOptions` as a pure function in `packages/app/src/main/window-options.ts` so T013 passes
- [X] T015 [P] [US1] Create `packages/client/index.html` with `<title>SoulSilver Desktop</title>`, a `<div id="app">`, the module script `/src/main.ts`, and CSP meta `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://localhost:*` (no `unsafe-eval`; `ws://localhost` only for Vite HMR in dev)
- [X] T016 [P] [US1] Create `packages/client/src/main.ts` mounting `App.svelte` into `#app` with Svelte 5 `mount`, and `packages/client/src/App.svelte` showing the heading "SoulSilver Desktop" and the text "Conectando ao servidor de jogo…"
- [X] T017 [P] [US1] Create stub preload `packages/app/src/preload/index.ts` (imports `contextBridge` only; the API is added in US2)
- [X] T018 [US1] Create `packages/app/electron.vite.config.ts`: `main` entry `src/main/index.ts`; `preload` entry `src/preload/index.ts` with CommonJS output (`.cjs`, required by `sandbox: true`); `renderer` with `root` resolved to `../client`, `build.rollupOptions.input` `../client/index.html`, plugin `svelte()`; `externalizeDepsPlugin({ exclude: ["@soulsilver/shared", "@soulsilver/server"] })` in main and preload (R4)
- [X] T019 [US1] Implement `packages/app/src/main/index.ts`: on `app.whenReady()` create `BrowserWindow(createWindowOptions(join(__dirname, "../preload/index.cjs")))`; load `process.env["ELECTRON_RENDERER_URL"]` in dev or `join(__dirname, "../renderer/index.html")` in build; quit on `window-all-closed`
- [X] T020 [US1] Add scripts to `packages/app/package.json` (`"dev": "electron-vite dev"`, `"build": "electron-vite build"`, `"preview": "electron-vite preview"`) and to root `package.json` (`"dev": "npm run dev -w @soulsilver/app"`, `"build": "npm run build -w @soulsilver/app"`)
- [X] T021 [US1] Write `README.md` in PT-BR with sections: o que é o projeto (1 parágrafo, com link para a constituição), Pré-requisitos (Windows 10/11 x64, Git for Windows, Node.js 24 LTS conforme `.nvmrc`), Preparar o ambiente (`git clone`, `npm install`), Rodar o app (`npm run dev`), Problemas comuns (erro de engine do Node e como trocar de versão)
- [ ] T022 [US1] Manually validate quickstart.md cenário 1 (window opens; wrong Node version fails with expected version) and record the elapsed time from clone to window

**Checkpoint**: MVP. A janela abre a partir do README.

---

## Phase 4: User Story 2 - Caminho completo renderer → servidor de jogo (Priority: P2)

**Goal**: a janela mostra versão do app, versão do protocolo, estado do servidor e o contador
de ticks a 20 Hz, vindos do servidor num `utilityProcess`, pela API do preload.

**Independent Test**: quickstart, cenário 2. Resposta em ≤ 3 s; 190 a 210 ticks em 10 s;
`typeof require`/`process` indefinidos no renderer; navegação externa bloqueada; matar o
processo do servidor mostra erro sem travar a janela.

### Contracts in shared (types first, so the tests below compile and fail on behavior)

- [X] T023 [P] [US2] Create `packages/shared/src/protocol-version.ts` exporting `PROTOCOL_VERSION = 1` and `packages/shared/src/server-info.ts` exporting `ServerState = "starting" | "running" | "stopped"`, `ServerStatus { state: ServerState; tick: number }` ("tick: inteiro ≥ 0; nunca diminui enquanto running") and `ServerInfo { appVersion: string; protocolVersion: number; serverStatus: ServerStatus; tickRateHz: 20; uptimeMs: number }` per data-model.md
- [X] T024 [P] [US2] Create `packages/shared/src/server-host-protocol.ts` with the discriminated unions `HostToServerMessage` (`init { protocolVersion, appVersion }`, `get-info { requestId }`) and `ServerToHostMessage` (`ready { protocolVersion }`, `status { status }`, `info { requestId, info }`, `error { code: "protocol-mismatch", message }`) per contracts/server-host-protocol.md, plus exported `isHostToServerMessage(value: unknown)` and `isServerToHostMessage(value: unknown)` stubs that return `false`
- [X] T025 [P] [US2] Create `packages/shared/src/ipc.ts` with `IpcChannel = { ServerGetInfo: "server:get-info", ServerStatus: "server:status" } as const`, the `SoulSilverApi` interface from contracts/renderer-api.md, and `SERVER_UNAVAILABLE = "server-unavailable"`; re-export all shared modules from `packages/shared/src/index.ts`

### Tests for User Story 2 (test-first) ⚠️

- [X] T026 [P] [US2] Write failing test `packages/shared/test/server-host-protocol.test.ts`: each valid message from the contract is accepted by its guard; rejects `null`, non-objects, missing `type`, unknown `type`, wrong field types (e.g. `requestId: "1"`, `tick: -1`, `state: "paused"`), and messages from the other direction
- [X] T027 [P] [US2] Write failing test `packages/server/test/tick-loop.test.ts` for `createTickLoop({ hz, now, schedule, cancel, onTick, onOverrun })` using a fake clock and scheduler: 20 Hz yields 200 ± 1 ticks in 10 000 ms; no cumulative drift when each tick takes 10 ms; when late by 3 periods it runs the missed ticks in sequence; when late by more than 5 periods it runs at most 5, drops the rest and calls `onOverrun` with the dropped count; `stop()` cancels the pending timer and no further ticks run; tick numbers start at 1 and strictly increase (R6)
- [X] T028 [P] [US2] Write failing test `packages/server/test/game-server.test.ts` for `createGameServer({ send, now, schedule, cancel, onFatal })` and its `handleMessage(msg: unknown)`: valid `init` with `PROTOCOL_VERSION` sends `ready` and starts the loop; each tick sends `status` with `state: "running"` and the tick count; `get-info` returns `info` with the same `requestId`, `appVersion` from `init`, `protocolVersion: PROTOCOL_VERSION`, `tickRateHz: 20` and `uptimeMs` from the injected clock; `init` with another version sends `error` with code `protocol-mismatch` and calls `onFatal`; `get-info` before `init` and invalid messages are discarded without throwing
- [X] T029 [P] [US2] Write failing test `packages/app/test/server-host.test.ts` for `createServerHost({ fork, appVersion, requestTimeoutMs = 2000, onStatus })` using a fake child (EventEmitter with `postMessage` and `kill`) and fake timers: sends `init` on start; state is `starting` until the first `status`, then `running`; `getInfo()` posts `get-info` with unique `requestId`s and resolves with the matching `info`; rejects with `Error("server-unavailable")` after 2000 ms without reply; ignores replies with unknown `requestId` and invalid messages; on child `exit` it sets `stopped`, keeps the last `tick`, rejects pending requests, notifies `onStatus` once, and later `getInfo()` rejects immediately (data-model.md transitions)
- [X] T030 [P] [US2] Write failing test `packages/app/test/navigation-guard.test.ts` for `isAllowedNavigation(url, { devServerUrl? })`, `windowOpenHandler()` and `permissionRequestHandler()`: allows only `file:` URLs of the app renderer and, when `devServerUrl` is set, URLs with the same origin; denies `https://example.com`, `http://localhost:<other port>`, `javascript:`, `data:`; window open always returns `{ action: "deny" }`; every permission request is denied (FR-015, R8)

### Implementation for User Story 2

- [X] T031 [US2] Implement the guards in `packages/shared/src/server-host-protocol.ts` so T026 passes
- [X] T032 [US2] Implement `createTickLoop` in `packages/server/src/tick-loop.ts` (absolute deadlines `start + n × 1000/hz`, catch-up limit 5) so T027 passes
- [X] T033 [US2] Implement `createGameServer` in `packages/server/src/game-server.ts` using `createTickLoop` and the shared guards so T028 passes; export both from `packages/server/src/index.ts` (no imports of `electron` or `node:*`)
- [X] T034 [US2] Implement `createServerHost` in `packages/app/src/main/server-host.ts` so T029 passes; the production `fork` is `utilityProcess.fork(entryPath, [], { serviceName: "SoulSilver Game Server" })`
- [X] T035 [US2] Implement `packages/app/src/server-host/entry.ts`: create the game server with `send = (m) => process.parentPort.postMessage(m)`, real clock (`performance.now`) and `setTimeout`/`clearTimeout`; forward `process.parentPort.on("message", (e) => server.handleMessage(e.data))`; `onFatal` exits with code 1
- [X] T036 [US2] Add `src/server-host/entry.ts` as a second main entry (`server-host`) in `packages/app/electron.vite.config.ts`
- [X] T037 [US2] Implement `packages/app/src/main/navigation-guard.ts` so T030 passes
- [X] T038 [US2] Wire `packages/app/src/main/index.ts`: start `createServerHost` with `app.getVersion()` and the built `server-host.js` path; `ipcMain.handle(IpcChannel.ServerGetInfo)` that rejects senders other than the main window's `webContents`; forward each status to the window with `webContents.send(IpcChannel.ServerStatus, status)`; apply `will-navigate` guard, `setWindowOpenHandler(windowOpenHandler)` and `session.defaultSession.setPermissionRequestHandler(permissionRequestHandler)`; kill the server on `before-quit`
- [X] T039 [US2] Implement the preload in `packages/app/src/preload/index.ts`: `contextBridge.exposeInMainWorld("soulSilver", api satisfies SoulSilverApi)` with `getServerInfo` → `ipcRenderer.invoke(IpcChannel.ServerGetInfo)` and `onServerStatus(listener)` that passes only the `ServerStatus` to the listener and returns an unsubscribe function; never expose `ipcRenderer` itself (contracts/renderer-api.md)
- [X] T040 [P] [US2] Create `packages/client/src/global.d.ts` declaring `interface Window { soulSilver: SoulSilverApi }` with a type-only import from `@soulsilver/shared`
- [X] T041 [US2] Update `packages/client/src/App.svelte`: on mount call `getServerInfo()` and subscribe with `onServerStatus` (unsubscribe on destroy); show app version, protocol version, server state and live tick counter; show a clear error panel ("Servidor de jogo indisponível") when `getServerInfo` rejects or a `stopped` status arrives, keeping the last tick visible
- [ ] T042 [US2] Manually validate quickstart.md cenário 2 (response ≤ 3 s, 190–210 ticks in 10 s, minimized window keeps counting, DevTools checks, killing "SoulSilver Game Server" shows the error without freezing)

**Checkpoint**: US1 e US2 funcionando; arquitetura provada de ponta a ponta.

---

## Phase 5: User Story 3 - Checagens com um único comando (Priority: P3)

**Goal**: `npm run typecheck`, `npm run lint` e `npm test` na raiz cobrem os cinco pacotes e
apontam o pacote e o arquivo com erro.

**Independent Test**: quickstart, cenário 3.

- [X] T043 [US3] Install root devDependencies `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-svelte`, `globals` and create `eslint.config.js` (flat config): ignores `**/out/**`, `**/dist/**`, `node_modules`; `@eslint/js` recommended; `typescript-eslint` `recommendedTypeChecked` with `parserOptions.projectService: true`; `eslint-plugin-svelte` recommended for `**/*.svelte` with the TS parser; `no-restricted-imports` banning `electron` and `node:*` (and bare Node builtins) in `packages/client/**` and `packages/server/src/**` with a message citing principles IV and IX (R11)
- [X] T044 [P] [US3] Add trivial test `packages/client/test/smoke.test.ts` asserting that `IpcChannel.ServerStatus` imported from `@soulsilver/shared` equals `"server:status"` (proves the client test pipeline and workspace resolution)
- [X] T045 [P] [US3] Add trivial test `packages/extractor/test/index.test.ts` asserting `extractorPackageName === "@soulsilver/extractor"`
- [X] T046 [US3] Add root scripts in `package.json`: `"typecheck": "npm run typecheck --workspaces --if-present && tsc -p tsconfig.json"`, `"lint": "eslint ."`, `"test": "vitest run"`; fix any lint or type error in existing code
- [X] T047 [US3] Add the section "Checagens" to `README.md` documenting the three commands and the rule that no task is done without them passing
- [X] T048 [US3] Manually validate quickstart.md cenário 3: the three commands pass; the test report lists projects `app`, `client`, `server`, `shared`, `extractor` (plus `scripts` once US4 is done); an intentional type error in `packages/server/src` makes `npm run typecheck` fail naming `@soulsilver/server` and the file (revert afterwards)

**Checkpoint**: checagens únicas disponíveis; a partir daqui valem para toda task.

---

## Phase 6: User Story 4 - Bloqueio de ROM e assets no commit (Priority: P4)

**Goal**: o pre-commit recusa ROM, `assets/`, formatos do DS e mídia fora de `art/`, ativado
automaticamente pelo `npm install`.

**Independent Test**: quickstart, cenário 4 (exige `git init`).

### Tests for User Story 4 (test-first) ⚠️

- [X] T049 [US4] Create `scripts/vitest.config.ts` (`test.name: "scripts"`, `include: ["test/**/*.test.ts"]`) and write failing test `scripts/test/forbidden-files.test.ts` for `findForbiddenFiles(paths: string[]): ForbiddenFileViolation[]` covering contracts/forbidden-files-check.md: any path under `assets/` (also `Assets/x.json`) → `asset-dir`; `.nds`, `.NDS`, `.Nds` anywhere → `rom`; every DS extension of the spec Assumptions list (`.narc .arc .ncgr .nclr .nscr .ncer .nanr .nmcr .nmar .nsbmd .nsbtx .nsbca .nsbta .nsbtp .nsbma .nsbva .sdat .sseq .ssar .sbnk .swar .strm .bmg`) → `ds-format`; image/audio extensions (`.png .jpg .jpeg .gif .bmp .webp .tga .ico .svg .wav .ogg .mp3 .flac .mid .midi`) outside `art/` → `media-outside-art`; `art/icon.png` and `art/ui/button.svg` allowed; `artwork/x.png` and `docs/art/x.png` blocked; `assets/x.nds` reports only `asset-dir` (first rule wins); Windows separators `assets\\x.bin` normalized; `src/a.ts`, `README.md`, `package.json` allowed; each violation carries a PT-BR `reason`

### Implementation for User Story 4

- [X] T050 [US4] Implement `scripts/forbidden-files.ts` (rules in order `asset-dir`, `rom`, `ds-format`, `media-outside-art`; case-insensitive; normalize `\` to `/`) so T049 passes
- [X] T051 [US4] Implement CLI `scripts/check-forbidden-files.ts`: `--staged` reads `git diff --cached --name-only --diff-filter=ACMR -z`, `--all` reads `git ls-files -z` (via `execFileSync`); exit `0` when clean, `1` with the PT-BR message format of contracts/forbidden-files-check.md on stderr, `2` on usage or git errors
- [X] T052 [US4] Implement `scripts/setup-git-hooks.ts`: if `git rev-parse --git-dir` fails, print "Repositório git não encontrado; hook de pre-commit não instalado." and exit 0; otherwise run `git config core.hooksPath .githooks`
- [X] T053 [US4] Create `.githooks/pre-commit` (LF line endings, `#!/bin/sh`, `exec node scripts/check-forbidden-files.ts --staged`)
- [X] T054 [US4] Add root scripts `"prepare": "node scripts/setup-git-hooks.ts"` and `"check:assets": "node scripts/check-forbidden-files.ts --all"` in `package.json`
- [X] T055 [P] [US4] Create `art/README.md` (PT-BR) explaining that `art/` is the only folder allowed for original project images and audio (icons, UI), and that nothing derived from the ROM may go there
- [X] T056 [US4] Add the section "Proteção de assets" to `README.md`: what is blocked and why (principle II), the `assets/` output folder (ignored), the `art/` exception, and that the hook is installed by `npm install`
- [X] T057 [US4] Run `git init`, then `npm install`, and manually validate quickstart.md cenário 4 (four forbidden files rejected with the expected message; `art/icon-test.png` accepted; clean up afterwards)

**Checkpoint**: repositório protegido contra assets antes de qualquer trabalho no extrator.

---

## Phase 7: User Story 5 - Checagens automáticas em cada push (Priority: P5)

**Goal**: GitHub Actions roda arquivos proibidos, typecheck, lint e testes em Windows a cada
push e PR.

**Independent Test**: quickstart, cenário 5 (exige o repositório no GitHub).

- [X] T058 [US5] Create `.github/workflows/ci.yml`: name `CI`; triggers `push` (all branches) and `pull_request`; job `checks` on `windows-latest`; steps `actions/checkout`, `actions/setup-node` with `node-version-file: .nvmrc` and `cache: npm`, `npm ci`, then separate named steps `Forbidden files` (`npm run check:assets`), `Typecheck`, `Lint`, `Test` (R15)
- [X] T059 [US5] Add the section "Integração contínua" to `README.md` (what runs, where to see results)
- [ ] T060 [US5] Manually validate quickstart.md cenário 5 after pushing to GitHub (valid push passes; failing test fails on `Test`; `--no-verify` commit with `assets/x.png` fails on `Forbidden files`)

**Checkpoint**: todas as histórias funcionando.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T061 [P] Create `docs/balance-log.md` (PT-BR) with the purpose (principle I) and an entry template table with columns Data, Item, Valor original, Valor novo, Motivo, Spec, plus one commented example row (FR-025)
- [X] T062 [P] Create `packages/extractor/test/fixtures/README.md` (PT-BR) documenting the fixture convention: `packages/<pacote>/test/fixtures/`, fixtures generated by TypeScript builders in memory, never binary files nor real ROM data (FR-005, R14); add a link to it in `README.md`
- [X] T063 Review the code against plan.md Constitution Check (no `electron`/`node:*` in `packages/server/src` or `packages/client`; preload exposes only `soulSilver`; all deps listed in plan.md justification table) and fix deviations
- [ ] T064 Run `npm run check:assets`, `npm run typecheck`, `npm run lint`, `npm test` and the full quickstart.md from a fresh clone; confirm SC-001 to SC-007

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup; bloqueia todas as histórias.
- **US1 (Phase 3)**: depende da Phase 2.
- **US2 (Phase 4)**: depende de US1 (precisa da janela, do preload e da config do electron-vite).
- **US3 (Phase 5)**: depende da Phase 2; para validar o lint sobre código real, rodar após US2.
- **US4 (Phase 6)**: depende só da Phase 1 (usa `scripts/` e o `vitest.config.ts` da raiz);
  pode rodar em paralelo com US1–US3.
- **US5 (Phase 7)**: depende de US3 (scripts `typecheck`, `lint`, `test`) e de US4 (`check:assets`).
- **Polish (Phase 8)**: depende de todas as histórias.

### Within Each User Story

- Tipos de contrato (T023–T025) antes dos testes que os importam.
- Testes test-first MUST falhar antes da implementação correspondente:
  T013→T014, T026→T031, T027→T032, T028→T033, T029→T034, T030→T037, T049→T050.
- Lógica pura antes da integração com Electron (T031–T034, T037 antes de T038).
- Validação manual fecha cada história.

### Parallel Opportunities

- Setup: T002, T003, T004, T005.
- Foundational: T007–T011.
- US1: T015, T016, T017 (depois de T014).
- US2: T023–T025 juntos; depois T026–T030 juntos; T040 a qualquer momento após T025.
- US3: T044, T045.
- US4 inteira em paralelo com US1–US3, por outro agente.
- Polish: T061, T062.

---

## Parallel Example: User Story 2

```text
# Contratos em shared:
Task: "T023 protocol-version.ts e server-info.ts em packages/shared/src/"
Task: "T024 server-host-protocol.ts em packages/shared/src/"
Task: "T025 ipc.ts em packages/shared/src/"

# Testes test-first (todos devem falhar):
Task: "T026 packages/shared/test/server-host-protocol.test.ts"
Task: "T027 packages/server/test/tick-loop.test.ts"
Task: "T028 packages/server/test/game-server.test.ts"
Task: "T029 packages/app/test/server-host.test.ts"
Task: "T030 packages/app/test/navigation-guard.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (Setup) e Phase 2 (Foundational).
2. Phase 3 (US1): janela abre a partir do README.
3. **Parar e validar** o quickstart, cenário 1.

### Incremental Delivery

1. Setup + Foundational → workspaces prontos.
2. US1 → janela abre (MVP).
3. US2 → arquitetura provada de ponta a ponta.
4. US3 → checagens únicas; passam a valer como gate de toda task.
5. US4 → proteção de assets (pode vir antes, em paralelo).
6. US5 → CI no GitHub.
7. Polish → validação completa a partir de um clone limpo.

### Solo com agentes

US4 é independente e pode ser entregue a um segundo agente enquanto o principal faz US1→US2.
Revisar cada história antes do merge (Fluxo de Desenvolvimento da constituição).

---

## Notes

- [P] = arquivos diferentes, sem dependência pendente.
- Commit ao fim de cada task ou grupo lógico, em inglês.
- US4 e US5 exigem repositório git (e GitHub para US5); US1–US3 não.
