---

description: "Lista de tasks da feature 002-release-autoupdate"
---

# Tasks: Build, distribuição e auto-update

**Input**: Design documents from `/specs/002-release-autoupdate/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: incluídos. O princípio V exige test-first para a lógica; aqui isso cobre
`validateReleaseTag`, `buildReleaseNotes`, `findForbiddenPackageFiles` e
`createUpdateController`. As tasks marcadas **test-first** MUST ser escritas e falhar antes da
implementação correspondente. A interface Svelte é verificada manualmente.

**Organization**: tasks agrupadas por história de usuário.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: US1 a US4 do spec
- Caminhos relativos à raiz do repositório

## Regras gerais para quem executa

- Código, identificadores e commits em inglês; README, mensagens ao desenvolvedor e textos da
  interface em PT-BR.
- Scripts em `scripts/` rodam com `node` direto (type stripping): imports relativos com `.ts`,
  só sintaxe apagável, lógica em funções puras e CLIs finas, como `scripts/forbidden-files.ts`.
- Antes de concluir qualquer task: `npm run typecheck`, `npm run lint` e `npm test` passando.
- Para rodar o Electron a partir de um terminal do VS Code, remova `ELECTRON_RUN_AS_NODE` do
  ambiente (ver README, "Problemas comuns").

---

## Phase 1: Setup

- [X] T001 Install devDependencies `electron-builder@^26.15.3` and `electron-updater@^6.8.9` in workspace `@soulsilver/app` (`npm install -D -w @soulsilver/app ...`) and `@electron/asar@^4.3.1` at the root; confirm `package-lock.json` updated
- [X] T002 [P] Confirm `.gitignore` ignores `dist/` (it already lists `dist/`, which covers `packages/app/dist/`); add nothing else unless `git status` shows build output after T006

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: app empacotável localmente, base de US1 e US2

**⚠️ CRITICAL**: nenhuma história começa antes desta fase

- [X] T003 In `packages/app/package.json`: add `"productName": "SoulSilver Desktop"`, `"description": "SoulSilver Desktop"`, `"author": "SoulSilver Desktop"`; move `@soulsilver/shared` and `@soulsilver/server` from `dependencies` to `devDependencies` and remove the empty `dependencies` key (everything runtime is bundled, research R8)
- [X] T004 In `packages/app/electron.vite.config.ts`: add `"electron-updater"` to the `exclude` list of `bundledWorkspaceDeps` so it is bundled into the main process; set `renderer.build.assetsDir = "static"` so no packaged path contains an `assets/` segment (research R7)
- [X] T005 Create `packages/app/electron-builder.yml`: `appId: io.github.soulsilver-desktop`, `productName: SoulSilver Desktop`, `directories: { output: dist, buildResources: build }`, `files: ["out/**", "package.json"]`, `asar: true`, `win: { target: [{ target: nsis, arch: [x64] }] }`, `nsis: { oneClick: true, perMachine: false, deleteAppDataOnUninstall: false, createDesktopShortcut: always, createStartMenuShortcut: true, shortcutName: SoulSilver Desktop, artifactName: "SoulSilver-Desktop-Setup-${version}.${ext}" }`, `publish: { provider: github, owner: <GitHub owner>, repo: <repo> }` (read owner/repo from `git remote get-url origin`; if there is no remote yet, use placeholders `OWNER`/`REPO` and add a `TODO` comment), `npmRebuild: false` (research R1, R9)
- [X] T006 Add scripts: in `packages/app/package.json` `"dist": "electron-vite build && electron-builder --win --x64 --publish never"`; in root `package.json` `"dist": "npm run dist -w @soulsilver/app"`. Run `npm run dist` and confirm `packages/app/dist/` contains `SoulSilver-Desktop-Setup-0.1.0.exe`, its `.blockmap`, `latest.yml`, and `win-unpacked/resources/app-update.yml`; confirm `win-unpacked/resources/` has no `app.asar.unpacked/node_modules`
- [X] T007 Run `packages/app/dist/win-unpacked/SoulSilver Desktop.exe` and confirm the window opens with the server ticking (proves bundled workspace deps work packaged); confirm the user data folder is `%APPDATA%\SoulSilver Desktop`

**Checkpoint**: instalador gerado localmente.

---

## Phase 3: User Story 1 - Publicar uma versão com uma tag (Priority: P1) 🎯 MVP

**Goal**: `git push origin vX.Y.Z` gera, verifica e publica a release sem passos manuais.

**Independent Test**: quickstart, cenários 1 e 2.

### Tests for User Story 1 (test-first) ⚠️

- [X] T008 [P] [US1] Add failing tests to `scripts/test/forbidden-files.test.ts` for `findForbiddenPackageFiles(paths)`: `resources/app.asar/out/renderer/static/x.narc` → `ds-format`; any `.nds` → `rom`; any path with a segment `assets` (e.g. `resources/app.asar/assets/x.json`, `foo/Assets/y`) → `asset-dir`; any image/audio extension → `media` even under `art/`; Windows separators normalized; real Electron files allowed (`SoulSilver Desktop.exe`, `resources.pak`, `locales/pt-BR.pak`, `icudtl.dat`, `LICENSES.chromium.html`, `resources/app.asar/out/main/index.js`, `resources/app.asar/out/renderer/static/index-abc.js`, `resources/app-update.yml`)
- [X] T009 [P] [US1] Write failing test `scripts/test/release-tag.test.ts` for `validateReleaseTag({ tag, appVersion, publishedVersions })` per data-model.md ReleaseTag: accepts `v0.2.0` with app `0.2.0` and published `["0.1.0"]`; first release with empty published list; `reason: "invalid-format"` for `v1.2`, `1.2.3`, `v1.2.3-beta`, `v01.2.3`; `"version-mismatch"` for tag `v0.2.1` with app `0.2.0` (message shows both versions); `"already-published"` when `0.2.0` is in published; `"not-newer"` for `v0.1.9` when `0.2.0` is published, comparing numerically (`0.10.0` > `0.9.0`); published entries may come with or without the `v` prefix
- [X] T010 [P] [US1] Write failing test `scripts/test/release-notes.test.ts` for `buildReleaseNotes(subjects: string[])` per data-model.md ReleaseNotes: groups `feat` → `## Novidades`, `fix` → `## Correções`, everything else → `## Outras mudanças`, in that order, omitting empty sections; strips `type(scope): ` prefixes; `feat!:`/`feat(x)!:` get the label `**(incompatível)**`; subjects without a conventional prefix go to "Outras mudanças" unchanged; keeps input order inside each section; empty list → `Sem mudanças registradas.`

### Implementation for User Story 1

- [X] T011 [US1] Implement `findForbiddenPackageFiles` in `scripts/forbidden-files.ts` reusing the existing extension sets (rule ids `asset-dir`, `rom`, `ds-format`, `media`; PT-BR reasons) so T008 passes; extend `ForbiddenRuleId` accordingly without changing `findForbiddenFiles` behavior
- [X] T012 [US1] Implement `validateReleaseTag` in `scripts/release-tag.ts` so T009 passes (result `{ ok: true } | { ok: false; reason; message }` with PT-BR messages)
- [X] T013 [US1] Implement `buildReleaseNotes` in `scripts/release-notes.ts` so T010 passes, plus a CLI entry in the same file guarded by `import.meta.main`: `node scripts/release-notes.ts <tag> <out.md>` finds the previous tag with `git describe --tags --abbrev=0 <tag>^` (no previous tag → whole history), reads `git log <prev>..<tag> --no-merges --format=%s` (oldest first, `--reverse`), writes the Markdown; exit 2 on usage/git errors
- [X] T014 [US1] Create CLI `scripts/check-release-tag.ts <tag>`: reads `version` from `packages/app/package.json`, gets published versions with `gh release list --limit 1000 --json tagName` (`execFileSync`), calls `validateReleaseTag`; exit 0 ok, 1 invalid (prints the PT-BR message), 2 usage/gh error
- [X] T015 [US1] Create CLI `scripts/verify-package.ts <win-unpacked-dir>`: walks every file under the directory (relative paths with `/`), and for `resources/app.asar` also lists its entries with `listPackage` from `@electron/asar` (prefixed `resources/app.asar/`); calls `findForbiddenPackageFiles`; exit 0 clean, 1 with a PT-BR message naming each file and reason and citing principle II, 2 usage error
- [X] T016 [US1] Run `node scripts/verify-package.ts packages/app/dist/win-unpacked` on the T006 build and confirm exit 0; if a legit Electron file is flagged, fix the rule (not the allow-list) and add it to the T008 "allowed" cases
- [X] T017 [US1] Create `.github/workflows/release.yml` per contracts/release-pipeline.md: name `Release`; `on: push: tags: ["v*"]`; `permissions: contents: write`; job on `windows-latest`; `actions/checkout@v7` with `fetch-depth: 0`; `actions/setup-node@v7` with `node-version-file: .nvmrc`, `cache: npm`; `npm ci`; named steps `Validate tag` (`node scripts/check-release-tag.ts ${{ github.ref_name }}` with `GH_TOKEN: ${{ github.token }}`), `Forbidden files`, `Typecheck`, `Lint`, `Test`, `Build installer` (`npm run dist`), `Verify package`, `Release notes` (`node scripts/release-notes.ts ${{ github.ref_name }} release-notes.md`), `Publish` (`gh release create ${{ github.ref_name }} <exe> <blockmap> packages/app/dist/latest.yml --title ${{ github.ref_name }} --notes-file release-notes.md` with `GH_TOKEN`); use `shell: bash` where globs or `${{ }}` paths are used
- [X] T018 [US1] Add section "Publicar uma versão" to `README.md`: bump `version` in `packages/app/package.json`, commit, `git tag vX.Y.Z`, `git push origin vX.Y.Z`; what the workflow checks; tag rules (only `vMAJOR.MINOR.PATCH`, must match the app, must be newer); where to see the result
- [X] T019 [US1] Manually validate quickstart.md cenário 1 locally (clean build passes; injected `test.narc` fails naming the file)
- [ ] T020 [US1] Manually validate quickstart.md cenário 2 on GitHub (release in < 20 min with 3 files and notes; the three invalid tags fail at `Validate tag` with no release)

**Checkpoint**: releases publicadas por tag.

---

## Phase 4: User Story 2 - Instalar e abrir o app (Priority: P2)

**Goal**: o jogador instala sem administrador, vê a versão e mantém os dados ao desinstalar.

**Independent Test**: quickstart, cenário 3 (Área Restrita do Windows).

- [X] T021 [US2] Add to `packages/shared/src/ipc.ts`: `IpcChannel.AppGetVersion = "app:get-version"` and `getAppVersion(): Promise<string>` in `SoulSilverApi` (contracts/renderer-api.md)
- [X] T022 [US2] Handle `IpcChannel.AppGetVersion` in `packages/app/src/main/index.ts` returning `app.getVersion()`, with the same sender check used for `ServerGetInfo`; expose `getAppVersion` in `packages/app/src/preload/index.ts`
- [X] T023 [US2] Update `packages/client/src/App.svelte` to show the app version from `getAppVersion()` (visible even when the game server is stopped), keeping the protocol version from `getServerInfo()`
- [X] T024 [US2] Add section "Instalar o jogo" to `README.md` (PT-BR, for players): link to the repository's Releases page; download `SoulSilver-Desktop-Setup-X.Y.Z.exe`; SmartScreen steps ("Mais informações" → "Executar assim mesmo") and why it appears (no code signing); no admin needed; data folder `%APPDATA%\SoulSilver Desktop` is kept on uninstall; how to uninstall (Configurações → Aplicativos); updates are automatic
- [ ] T025 [US2] Manually validate quickstart.md cenário 3 in Windows Sandbox with the installer from T006 or T020 (shortcuts, version visible, data kept after uninstall)

**Checkpoint**: jogadores conseguem instalar.

---

## Phase 5: User Story 3 - Atualização automática (Priority: P3)

**Goal**: o app baixa a versão nova em segundo plano e oferece "Reiniciar agora" ou "Depois".

**Independent Test**: quickstart, cenários 4 e 5.

### Contract (types first)

- [X] T026 [US3] Create `packages/shared/src/update-state.ts` with `UpdateState` exactly as data-model.md (`disabled` | `checking` | `up-to-date` | `downloading { version: string; percent: number }` "percent 0–100, só cresce" | `ready { currentVersion: string; newVersion: string }` | `check-failed`); export from `packages/shared/src/index.ts`; add to `packages/shared/src/ipc.ts` the channels `UpdateGetState = "update:get-state"`, `UpdateState = "update:state"`, `UpdateRestart = "update:restart"` and the methods `getUpdateState()`, `onUpdateState(listener)`, `restartToUpdate()` to `SoulSilverApi`

### Tests for User Story 3 (test-first) ⚠️

- [X] T027 [US3] Write failing test `packages/app/test/update-controller.test.ts` for `createUpdateController({ updater, isPackaged, currentVersion, checkTimeoutMs = 15000, onState })` with a fake updater (EventEmitter + `checkForUpdates` spy returning a pending promise + `quitAndInstall` spy) and fake timers: `isPackaged: false` → state `disabled` and `checkForUpdates` never called; `start()` → `checking`; `update-not-available` → `up-to-date`; `update-available { version }` → `downloading` with `percent: 0`; `download-progress { percent }` updates percent (rounded, never decreasing); `update-downloaded { version }` → `ready { currentVersion, newVersion }`; `restart()` calls `quitAndInstall(true, true)` only when `ready`; `getState()` returns the latest state; `onState` fires once per change

### Implementation for User Story 3

- [X] T028 [US3] Implement `packages/app/src/main/update-controller.ts` so T027 passes; the `updater` parameter is a minimal interface (`on(event, listener)`, `checkForUpdates(): Promise<unknown>`, `quitAndInstall(isSilent, isForceRunAfter)`) declared in the same file, with no import of `electron-updater`
- [X] T029 [US3] Wire in `packages/app/src/main/index.ts`: `app.requestSingleInstanceLock()` (second instance quits; first restores and focuses its window on `second-instance`); import `autoUpdater` from `electron-updater`, set `autoDownload = true`, `autoInstallOnAppQuit = true`, `allowDowngrade = false`, `logger = null`; create the controller with `isPackaged: app.isPackaged`, `currentVersion: app.getVersion()`; send each state to the window on `IpcChannel.UpdateState`; handle `UpdateGetState` and `UpdateRestart` with the sender check; call `controller.start()` after the window is created, without awaiting it
- [X] T030 [US3] Expose `getUpdateState`, `onUpdateState` (passes only the state, returns unsubscribe) and `restartToUpdate` in `packages/app/src/preload/index.ts`
- [X] T031 [US3] Create `packages/client/src/UpdateNotice.svelte` (props: `state: UpdateState`, `onRestart`) and render it from `packages/client/src/App.svelte` (get the initial state with `getUpdateState()`, then subscribe): `downloading` → discreet line "Baixando atualização… N%"; `ready` → panel showing `currentVersion → newVersion`, the text "Versões diferentes não conseguem jogar juntas. Reinicie para continuar compatível com seus amigos.", buttons "Reiniciar agora" (calls `restartToUpdate`) and "Depois" (hides the panel; update applies when the app closes)
- [ ] T032 [US3] Manually validate quickstart.md cenários 4 and 5 (needs two published releases; "Reiniciar agora" and "Depois" both end on the new version; an interrupted download leaves the old version working)

**Checkpoint**: jogadores ficam na mesma versão.

---

## Phase 6: User Story 4 - Jogar sem internet (Priority: P4)

**Goal**: sem rede ou com o servidor de atualizações falhando, o app abre normalmente e mostra um
aviso discreto.

**Independent Test**: quickstart, cenário 6.

### Tests for User Story 4 (test-first) ⚠️

- [X] T033 [US4] Add failing tests to `packages/app/test/update-controller.test.ts`: `error` during `checking` → `check-failed`; `checkForUpdates()` rejecting → `check-failed` (no unhandled rejection); no event within 15000 ms of `start()` → `check-failed`; events arriving after `check-failed` are ignored (state stays `check-failed`); `error` during `downloading` → `check-failed`; the timeout does not fire once the state left `checking`

### Implementation for User Story 4

- [X] T034 [US4] Implement error handling and the 15 s timeout in `packages/app/src/main/update-controller.ts` so T033 passes (data-model.md transitions: terminal states ignore later events)
- [X] T035 [US4] In `packages/client/src/UpdateNotice.svelte`, render `check-failed` as a discreet footer note "Não foi possível verificar atualizações." with a dismiss button; it never blocks other UI
- [ ] T036 [US4] Manually validate quickstart.md cenário 6 (network off: window opens at normal speed; note within 15 s; dismissible)

**Checkpoint**: todas as histórias funcionando.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T037 Review against plan.md Constitution Check: renderer has no network access (update download only in main), `electron-updater` not imported outside `packages/app/src/main/index.ts`, packaged app has no `node_modules`, new deps limited to the 3 in the plan; fix deviations
- [X] T038 Run `npm run check:assets`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run dist` and `node scripts/verify-package.ts packages/app/dist/win-unpacked`; all pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (1)** → **Foundational (2)** → histórias.
- **US1**: depende da Fase 2. A validação no GitHub (T020) exige o repositório público com
  remoto configurado.
- **US2**: depende da Fase 2; T025 pode usar o instalador local (T006), sem esperar a US1.
- **US3**: depende de US1 publicada (o updater precisa de releases reais para T032) e de T021–T022
  (mexem nos mesmos arquivos `ipc.ts`, `index.ts`, `preload/index.ts`).
- **US4**: depende de US3 (estende o mesmo controlador e componente).
- **Polish**: depois de todas.

### Within Each User Story

- Test-first: T008→T011, T009→T012, T010→T013, T027→T028, T033→T034.
- Contrato em `shared` (T021, T026) antes de main, preload e UI.
- Arquivos compartilhados (`ipc.ts`, `main/index.ts`, `preload/index.ts`, `App.svelte`) são
  editados em sequência: US2 → US3 → US4.

### Parallel Opportunities

- US1: T008, T009, T010 juntos; depois T011, T012, T013 em paralelo (arquivos diferentes).
- US2 (T021–T024) em paralelo com US1, por outro agente.
- T035 (UI) em paralelo com T034 depois de T033.

---

## Parallel Example: User Story 1

```text
Task: "T008 casos de pacote em scripts/test/forbidden-files.test.ts"
Task: "T009 scripts/test/release-tag.test.ts"
Task: "T010 scripts/test/release-notes.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Fases 1 e 2: instalador gerado localmente.
2. US1: release publicada por tag, com verificação de conteúdo.
3. **Parar e validar**: quickstart, cenários 1 e 2.

### Incremental Delivery

1. Setup + Foundational → instalador local.
2. US1 → releases por tag (MVP).
3. US2 → jogadores instalam (versão `v0.2.0` é uma boa primeira release pública).
4. US3 → atualização automática (publicar `v0.2.1` para testar).
5. US4 → robustez offline.
6. Polish.

---

## Notes

- Publicar releases de teste exige o repositório público no GitHub; releases de teste podem ser
  apagadas depois, mas tags publicadas nunca devem ser reaproveitadas (ver edge cases do spec).
- Commits em inglês, ao fim de cada task ou grupo lógico.
