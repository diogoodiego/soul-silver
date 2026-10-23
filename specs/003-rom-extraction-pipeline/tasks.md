---

description: "Lista de tasks da feature 003-rom-extraction-pipeline"
---

# Tasks: Validação da ROM, desempacotamento e primeira execução

**Input**: Design documents from `/specs/003-rom-extraction-pipeline/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: incluídos. O princípio V exige test-first para o extrator. Toda task de teste MUST
ser escrita e falhar antes da task de implementação correspondente. A interface Svelte é
verificada manualmente (quickstart §4–7).

**Organization**: tasks agrupadas por história de usuário (US1 a US6 do spec).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: US1 a US6 do spec
- Caminhos relativos à raiz do repositório

## Regras gerais para quem executa

- Código, identificadores, mensagens de log e commits em inglês. Textos da interface e
  mensagens de recusa (`romRejectionMessage`) em PT-BR.
- `packages/extractor` roda em Node puro: MUST NOT importar `electron`. Imports relativos usam
  extensão `.ts` (a CLI roda com `node` direto, research R11). Só sintaxe apagável
  (`erasableSyntaxOnly`): nada de `enum`, `namespace` ou parameter properties.
- Guardas de mensagem e de manifesto são escritas à mão, no estilo de
  `packages/shared/src/server-host-protocol.ts`.
- Testes usam só os builders sintéticos de `packages/extractor/test/fixtures/`. Nunca versione
  binários, e nunca leia uma ROM real nos testes (princípio II). Arquivos temporários de teste
  vão em `os.tmpdir()` (`fs.mkdtemp`) e são apagados no `afterEach`.
- Antes de concluir qualquer task: `npm run typecheck`, `npm run lint` e `npm test` passando.
- Para rodar o Electron a partir de um terminal do VS Code, remova `ELECTRON_RUN_AS_NODE` do
  ambiente (ver README, "Problemas comuns").

---

## Phase 1: Setup

- [X] T001 Configure `packages/extractor`:
  - `package.json`: add `"dependencies": { "@soulsilver/shared": "*" }`.
  - `tsconfig.json`: set `"types": ["node"]` and add `"allowImportingTsExtensions": true`.
  - Run `npm install` so the workspace link exists.
- [X] T002 [P] In `packages/app/package.json`, add devDependency `"@soulsilver/extractor": "*"`. Run `npm install`.
- [X] T003 [P] In `eslint.config.js`, add a block for `packages/extractor/**/*.ts` with `no-restricted-imports` forbidding `electron`. Message: "extractor must run in plain Node (FR-028)".
- [X] T004 [P] Add `"extract": "node packages/extractor/src/cli.ts"` to the root `package.json` scripts. Create `packages/extractor/src/cli.ts` with a placeholder `main` that returns 2, so the script resolves.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: contratos compartilhados, utilitários binários, builders sintéticos e o núcleo do
pipeline (registro, manifesto, digest, planner mínimo, lock, runner e checagem rápida).

**⚠️ CRITICAL**: nenhuma história começa antes desta fase.

### Contratos compartilhados

- [X] T005 [P] Create the types in `packages/shared/src/rom-validation.ts`, exactly as in data-model.md "Validação da ROM": `RomRegion`, `RomRejection`, `RomValidationResult`. The message function comes later (US2).
- [X] T006 [P] Create `ExtractionMode`, `AssetsFailure` and `AssetsState` in `packages/shared/src/assets-state.ts`, exactly as in data-model.md "Estado dos assets no app".
- [X] T007 [P] Write `packages/shared/test/extractor-host-protocol.test.ts` (test-first). Assert that `isMainToExtractorMessage` and `isExtractorToMainMessage` accept every variant in contracts/extractor-host-protocol.md and reject:
  - unknown `type`;
  - missing or empty strings;
  - `percent` outside 0–100 or non-integer;
  - non-object values.
- [X] T008 Implement `packages/shared/src/extractor-host-protocol.ts` (message types + guards) so T007 passes. Export it together with T005 and T006 from `packages/shared/src/index.ts`.

### Utilitários do extractor

- [X] T009 [P] Write `packages/extractor/test/binary.test.ts` (test-first) for `packages/extractor/src/binary.ts`:
  - `readU16(bytes, offset)` and `readU32(bytes, offset)` read little-endian;
  - `readAscii(bytes, offset, length)` stops at the first NUL;
  - each one throws `RangeError` naming the offset when out of bounds.

  Then implement `binary.ts`.
- [X] T010 [P] Write `packages/extractor/test/rom/crc16.test.ts` (test-first) with vectors for CRC-16/MODBUS (poly `0xA001` reflected, init `0xFFFF`): `"123456789"` → `0x4B37`, and an empty input → `0xFFFF`. Then implement `crc16(bytes, start, end)` in `packages/extractor/src/rom/crc16.ts`.
- [X] T011 [P] Write `packages/extractor/test/fs-atomic.test.ts` (test-first) for `packages/extractor/src/fs-atomic.ts`, then implement:
  - `writeFileAtomic(path, data)`: writes `<path>.tmp-<random>`, `fsync`, then `rename`. After a successful call no `.tmp-` file remains, and an existing target is replaced.
  - `renameWithRetry(from, to, { attempts: 5, delaysMs: [50,100,200,400,800] })`: retries only on `EPERM`/`EBUSY`/`EACCES` and rethrows others. Test it with an injected `rename` fake.
- [X] T012 [P] Define the `Logger` interface (data-model.md "Logger") and `createConsoleLogger()` (writes `ISO LEVEL [stageId] message` to stderr) in `packages/extractor/src/log.ts`. The file logger comes in US5.

### Builders sintéticos (fixtures)

- [X] T013 [P] Create `packages/extractor/test/fixtures/build-narc.ts`: `buildNarc(members: Uint8Array[], names?: string[]): Uint8Array`. It produces a valid NARC per research R5:
  - header `NARC`, BOM bytes `FE FF`, version `0x0100`, header size `0x10`, 3 sections;
  - `BTAF` with offsets relative to the `GMIF` data, each member 4-byte aligned;
  - `BTNF` with only the root (empty subtable) when `names` is absent, or one flat directory of file names when present;
  - `GMIF`.
- [X] T014 [P] Create `packages/extractor/test/fixtures/build-nds-rom.ts`. It exports `buildNdsRom(options)` with options `{ gameCode?: string /* default "IPGE" */, title?: string /* default "POKEMON SS" */, files?: Record<string, Uint8Array> /* POSIX paths, nested dirs */, arm9?, arm7?, overlays9?: Uint8Array[], overlays7?: Uint8Array[], banner? }`.
  - Lay out header (0x4000 bytes), ARM9, ARM7, y9/y7 tables, FNT, FAT, banner (0x840) and file data, using the offsets in research R4.
  - Overlay file ids come first in the FAT.
  - Write Nintendo logo CRC `0xCF56` at 0x15C and the header CRC16 over 0x000–0x15D at 0x15E.
  - Pad to at least 32 KiB.
  - Also export `sha1Hex(bytes)` and `corruptByte(rom, offset)`.
- [X] T015 Write `packages/extractor/test/fixtures/builders.test.ts`. It checks that `buildNarc` and `buildNdsRom` produce the documented magic, offsets and valid CRCs, so later failures point at the parsers and not the builders. Update `packages/extractor/test/fixtures/README.md` to list both builders.

### Núcleo do pipeline

- [X] T016 [P] Create the `Stage`, `StageContext` and `StageInput` types in `packages/extractor/src/pipeline/stage.ts`, exactly as in data-model.md "Etapa".
- [X] T017 [P] Write `packages/extractor/test/pipeline/registry.test.ts` (test-first) for `createRegistry(stages)`. It throws `StageRegistryError` naming the stage for:
  - duplicate id;
  - `version` not an integer or `< 1`;
  - `weight <= 0`;
  - empty `outputs` or a repeated output name;
  - an input pointing to an unknown stage or output;
  - a dependency cycle.

  It also checks that the order is topological, with ties broken by registration order, and that `registry.dependentsOf(id)` is transitive.
- [X] T018 Implement `createRegistry`, `Registry` (`stages` in order, `get(id)`, `dependenciesOf(id)`, `dependentsOf(id)`) and `StageRegistryError` in `packages/extractor/src/pipeline/registry.ts` so T017 passes.
- [X] T019 [P] Write `packages/extractor/test/pipeline/manifest.test.ts` (test-first) for the `Manifest` schema in data-model.md.
  - `parseManifest` accepts a valid manifest.
  - It returns `{ ok: false, path, problem }` for: `formatVersion !== 1`; `sha1` not 40 lowercase hex; `sha256` not 64 lowercase hex; negative or non-integer `files`/`bytes`/`version`; invalid ISO dates; wrong types. Example: `path` `"stages.rom-unpack.outputs.narc.files"`.
  - `readManifest(dir)` returns `undefined` for a missing file, invalid JSON or a schema failure, and logs a warning with path and problem.
  - `writeManifest(dir, manifest)` is atomic (uses `writeFileAtomic`).
- [X] T020 Implement `packages/extractor/src/pipeline/manifest.ts` (`Manifest`, `StageRecord`, `OutputRecord`, `parseManifest`, `readManifest`, `writeManifest`) so T019 passes.
- [X] T021 [P] Write `packages/extractor/test/pipeline/digest.test.ts` (test-first) for `digestTree(dir): Promise<OutputRecord>`, per research R8:
  - lines `<relpath>\0<size>\0<sha256 hex>\n`, POSIX separators, sorted by UTF-8 byte order;
  - SHA-256 of the concatenation;
  - same tree → same digest regardless of creation order;
  - changing one byte, renaming or deleting a file changes it;
  - an empty dir has `files: 0`.

  Also test `countFiles(dir)`, which counts files recursively with no `stat`.
- [X] T022 Implement `digestTree` and `countFiles` in `packages/extractor/src/pipeline/digest.ts`, streaming file hashes, so T021 passes.
- [X] T023 [P] Write `packages/extractor/test/pipeline/lock.test.ts` (test-first) for `acquireLock(workspaceDir)` → `release()`:
  - the lock is created with flag `wx` containing `{ pid, startedAt }`;
  - a second acquire while the pid is alive throws `LockBusyError`;
  - a stale lock (pid not alive, injected `isAlive`) is replaced;
  - `release()` deletes the file.

  Then implement `packages/extractor/src/pipeline/lock.ts` (research R14).
- [X] T024 [P] Write `packages/extractor/test/pipeline/plan.test.ts` (test-first) covering only the reasons `missing` and `rom-changed` (others come in US3/US6). With no manifest, all stages are planned with `missing`. With a manifest whose `rom.sha1` differs, all are planned with `rom-changed`. With a complete matching manifest and `isOutputValid` true, the plan is empty.
- [X] T025 Implement `planRun` in `packages/extractor/src/pipeline/plan.ts` with the signature in data-model.md "Plano de execução", covering reasons `missing` and `rom-changed`, so T024 passes.
- [X] T026 [P] Write `packages/extractor/test/pipeline/run.test.ts` (test-first) for `runPipeline` (contracts/extractor-library-api.md), with in-memory fake stages that write small files and a ROM file from `buildNdsRom`. Each fake stage's version and outputs are configurable.
  - Stages run in registry order.
  - Each stage writes into `staging/<id>-<random>/<output>/` and ends up in `stages/<id>/<output>/`.
  - After each stage, `manifest.json` contains that stage with `version`, `completedAt` and `outputs` matching `digestTree`.
  - `createdAt` and `updatedAt` are set.
  - `onProgress.percent` never decreases and ends at 100, weighted by `weight` (research R16).
  - Aborting the `signal` mid-stage returns `{ status: "cancelled" }`, and that stage is absent from the manifest.
  - A stage that throws returns `{ status: "failed", error: { code: "stage-failed", stageId, message } }`, and earlier stages stay in the manifest.
  - A ROM whose SHA-1 is not in the injected `references` returns `rom-mismatch` before writing anything.
  - A held lock returns `busy`.
- [X] T027 Implement `runPipeline` in `packages/extractor/src/pipeline/run.ts` so T026 passes:
  1. Acquire the lock.
  2. Read the ROM into a `Uint8Array` and verify its SHA-1 against `references` (default `REFERENCE_ROM_SHA1`).
  3. Read the manifest and call `planRun` (with `isOutputValid` = `digestTree` equality). Call `onPlan`.
  4. For each planned stage: create staging, call `stage.run(ctx)`, digest each output, delete the old `stages/<id>`, `renameWithRetry` staging → `stages/<id>`, then `writeManifest`.
  5. Release the lock in `finally`.

  Map `LockBusyError` → `busy`. Never reject for expected errors. Accept an optional `references` arg for tests.
- [X] T028 [P] Write `packages/extractor/test/pipeline/check.test.ts` (test-first) for `checkAssets({ workspaceDir, romPath, registry })` → `AssetsCheck` (data-model.md):
  - no manifest and no ROM copy → `needs-rom`;
  - no manifest and a ROM copy present → `needs-extraction` with `reason: "no-manifest"` and `romAvailable: true`;
  - a complete manifest whose outputs exist with matching `countFiles` → `ready`;
  - `romAvailable` is false when the copy is missing or its size ≠ `manifest.rom.size`.

  Use `fs` only (no full hashing).
- [X] T029 Implement `checkAssets` in `packages/extractor/src/pipeline/check.ts` for the cases in T028. `outdated` and `outputs-missing` come in US3.
- [X] T030 Create `packages/extractor/src/rom/reference.ts` exporting `REFERENCE_ROM_SHA1 = ["f8dc38ea20c17541a43b58c5e6d18c1732c7e582"] as const`, with a comment citing research R2 and the pending No-Intro confirmation. Re-export the public API from `packages/extractor/src/index.ts` as it exists so far (contracts/extractor-library-api.md). Delete `packages/extractor/test/index.test.ts` and the `extractorPackageName` export.

**Checkpoint**: pipeline genérico funcionando com etapas falsas; contratos compartilhados prontos.

---

## Phase 3: User Story 1 - Primeira execução guiada (Priority: P1) 🎯 MVP

**Goal**: com a ROM correta, o jogador vai da tela de boas-vindas até "Assets prontos" só pela
interface.

**Independent Test**: app sem dados de usuário + ROM sintética registrada como válida (ou a ROM
real) → boas-vindas → escolher arquivo → progresso → "Assets prontos" → tela principal; reabrir
vai direto à tela principal.

### Tests for User Story 1 ⚠️ (escrever primeiro, devem falhar)

- [X] T031 [P] [US1] Write `packages/extractor/test/rom/validate.test.ts` (accept path only).
  - A `buildNdsRom()` ROM, with its `sha1Hex` passed as `references`, gives `{ ok: true, sha1, size }`.
  - The same ROM with one byte changed after the header gives `{ ok: false, rejection: { reason: "modified" } }`.
- [X] T032 [P] [US1] Write `packages/extractor/test/rom/copy.test.ts` for `copyRom(source, dest, expectedSha1, signal?)`:
  - the copy matches the source;
  - no `.tmp-` file remains;
  - a SHA-1 mismatch throws and leaves no `dest` and no tmp;
  - an aborted signal leaves no `dest` and no tmp;
  - the parent dir of `dest` is created if missing.
- [X] T033 [P] [US1] Write `packages/extractor/test/nds/header.test.ts` for `parseNdsHeader(bytes)`. It returns `title`, `gameCode`, and the offsets and sizes of ARM9, ARM7, FNT, FAT, y9, y7 and banner. It throws `NdsFormatError` naming the field when the header CRC or logo CRC is wrong, or when an offset+size exceeds the ROM length.
- [X] T034 [P] [US1] Write `packages/extractor/test/nds/filesystem.test.ts` for `readNdsFileSystem(rom)`.
  - Nested directories and names round-trip from `buildNdsRom({ files })`.
  - File ids map to the right FAT ranges.
  - Overlays from y9/y7 resolve to their FAT file ids and bytes.
  - A FAT entry with `end < start` or beyond the ROM throws `NdsFormatError`.
  - A subtable entry type `0x80` (reserved) throws.
- [X] T035 [P] [US1] Write `packages/extractor/test/narc.test.ts` for `isNarc` and `parseNarc`.
  - Members round-trip from `buildNarc` in order, including zero-length members.
  - `names` are returned when present.
  - `NarcFormatError` is thrown for: wrong magic; wrong section magic; a member range beyond `GMIF`; a section size beyond the file.
  - `isNarc` is true only for bytes starting with `NARC`.
- [X] T036 [P] [US1] Write `packages/extractor/test/stages/rom-unpack.test.ts`. Run `romUnpackStage` through `runPipeline` on a `buildNdsRom` whose files include:
  - `a/0/0/0` = `buildNarc([m0, m1])`;
  - `a/0/0/1` = `buildNarc([x], ["foo/bar.bin"])`;
  - `data/plain.bin` = raw bytes.

  Assert:
  - `binaries/` holds `header.bin` (0x4000 bytes), `arm9.bin`, `arm7.bin`, `banner.bin`, `y9.bin`, `y7.bin`, `overlay9/0000.bin` and `overlay7/0000.bin`;
  - `filesystem/` mirrors every file byte-for-byte, NARCs included;
  - `narc/a/0/0/0/0000.bin` and `0001.bin` equal `m0` and `m1`;
  - `narc/a/0/0/1/names.json` is `{ "0": "foo/bar.bin" }`;
  - `data/plain.bin` does not appear under `narc/`;
  - progress fractions are reported between 0 and 1.
- [X] T037 [P] [US1] Write `packages/app/test/assets-controller.test.ts` (first-run path) for `createAssetsController(ports)`. Ports are injected fakes: `checkAssets`, `forkExtractorHost` (fake process with `postMessage`/`on("message"|"exit")`/`kill`), `showOpenDialog`, `paths` and `onState`.
  - Starting with `needs-rom` emits `checking` then `needs-rom { savedRom: false, previousRomInvalid: false }`.
  - `chooseRom()` with a selected path sends `validate-and-copy` and emits `validating`.
  - `validated ok` + `copied` → a new host gets `extract`, and the state is `extracting { mode: "first-run" }`.
  - `progress` messages update `stageTitle`/`percent`; a lower percent is ignored.
  - `completed` → `ready`.
  - Starting with `ready` emits `ready` and never forks.
  - `chooseRom()` outside `needs-rom`/`rejected` does nothing, and a cancelled dialog keeps the state.
  - A host exit without a final message → `failed { code: "unexpected" }`.

### Implementation for User Story 1

- [X] T038 [US1] Implement `parseNdsHeader` and `NdsFormatError` in `packages/extractor/src/nds/header.ts` (research R1, R4) using `binary.ts` and `crc16.ts`, so T033 passes.
- [X] T039 [US1] Implement `readNdsFileSystem` in `packages/extractor/src/nds/filesystem.ts` so T034 passes. It returns `{ files: Array<{ id, path, start, end }>, overlays9, overlays7 }`, where `path` is POSIX and relative to the FNT root, and every range is bounds-checked.
- [X] T040 [P] [US1] Implement `isNarc`, `parseNarc` (returns `{ members: Uint8Array[], names?: string[] }` with subarray views, no copies) and `NarcFormatError` in `packages/extractor/src/nds/narc.ts`. Reuse the FNT subtable reader from `filesystem.ts` (export it from there). Must make T035 pass.
- [X] T041 [US1] Implement `validateRom(path, { references })` in `packages/extractor/src/rom/validate.ts` with the full check order of research R3. Only the accept and `modified` cases are tested so far. Compute the SHA-1 with a read stream. Must make T031 pass.
- [X] T042 [P] [US1] Implement `copyRom` in `packages/extractor/src/rom/copy.ts`:
  1. `mkdir -p` the parent.
  2. Stream-copy to `<dest>.tmp-<random>` while hashing.
  3. Compare against `expectedSha1`.
  4. `fsync` and `renameWithRetry` to `dest`.
  5. On any error or abort, delete the tmp and rethrow.

  Must make T032 pass.
- [X] T043 [US1] Implement `romUnpackStage` in `packages/extractor/src/stages/rom-unpack.ts` with the fields from data-model.md: `id "rom-unpack"`, `title "Desempacotando a ROM"`, `version 1`, `weight 10`, inputs `[{ kind: "rom" }]`, outputs `["binaries","filesystem","narc"]`, `estimateBytes: romSize * 2.5`.
  - Write the layout in research R6.
  - Name members `NNNN.bin` with `Math.max(4, String(count - 1).length)` digits.
  - Write `names.json` only when the NARC has names.
  - Check `ctx.signal.throwIfAborted()` between files.
  - Report progress as bytes written over total.

  Create `packages/extractor/src/stages/index.ts` with `defaultStages = [romUnpackStage]`. Must make T036 pass.
- [X] T044 [US1] Export `validateRom`, `copyRom`, `REFERENCE_ROM_SHA1`, `parseNdsHeader`, `readNdsFileSystem`, `isNarc`, `parseNarc`, `defaultStages`, `createRegistry`, `checkAssets` and `runPipeline` from `packages/extractor/src/index.ts`, matching contracts/extractor-library-api.md.
- [X] T045 [US1] Add the IPC to `packages/shared/src/ipc.ts`:
  - 7 channels to `IpcChannel`: `AssetsGetState: "assets:get-state"`, `AssetsState: "assets:state"`, `AssetsChooseRom: "assets:choose-rom"`, `AssetsSubmitRomPath: "assets:submit-rom-path"`, `AssetsStart: "assets:start"`, `AssetsCancel: "assets:cancel"`, `AssetsOpenLog: "assets:open-log"`;
  - 7 methods to `SoulSilverApi`, with the doc comments in contracts/renderer-api.md.
- [X] T046 [US1] Implement `createAssetsController(ports)` in `packages/app/src/main/assets-controller.ts`. Follow the state machine in data-model.md for the first-run path, and expose `getState()`, `start()`, `chooseRom()`, `submitRomPath(path)`, `startExtraction()`, `cancel()` and `openLog()`. Only one extractor host may exist at a time. Must make T037 pass.
- [X] T047 [US1] Create `packages/app/src/extractor-host/entry.ts`, the utility process. Validate every incoming message with `isMainToExtractorMessage`. Then:
  - `validate-and-copy`: run `validateRom`, post `validated`; if ok, run `copyRom` and post `copied`.
  - `extract`: run `runPipeline` with `createRegistry(defaultStages)`. Post `progress` throttled to at most 10/s plus the final 100, then `completed`.
  - `cancel`: abort the `AbortController`, post `cancelled`.

  Exit with `process.exit(0)` after the final message. Use `createConsoleLogger` for now (the file logger comes in US5).
- [X] T048 [US1] In `packages/app/electron.vite.config.ts`, add the main entry `"extractor-host": resolve(import.meta.dirname, "src/extractor-host/entry.ts")`.
- [X] T049 [US1] Wire `packages/app/src/main/index.ts`:
  - Build `paths` from `app.getPath("userData")`: `rom/soulsilver.nds`, `extraction/`, `logs/extractor.log`.
  - Create the controller with `utilityProcess.fork(join(import.meta.dirname, "extractor-host.js"), [], { serviceName: "SoulSilver Extractor" })` and `dialog.showOpenDialog(window, { properties: ["openFile"], filters: [{ name: "ROM de Nintendo DS", extensions: ["nds"] }, { name: "Todos os arquivos", extensions: ["*"] }] })`.
  - Forward `onState` to `IpcChannel.AssetsState`.
  - Register the new `handle(...)` channels; `AssetsSubmitRomPath` accepts only a non-empty string.
  - Call `controller.start()` after the window is created.
- [X] T050 [US1] Add the 7 new methods to `packages/app/src/preload/index.ts`. `submitRomFile(file)` calls `webUtils.getPathForFile(file)` and invokes `AssetsSubmitRomPath` with the path (research R17).
- [X] T051 [US1] Create `packages/client/src/FirstRun.svelte` with props `state: AssetsState`. Render the `checking`, `needs-rom`, `validating`, `extracting` and `ready` rows of contracts/renderer-api.md "Tela".
  - The whole window is a drop zone: on `dragover` call `preventDefault`; on `drop` call `window.soulSilver.submitRomFile(e.dataTransfer.files[0])`.
  - "Escolher arquivo" calls `chooseRom()`.
  - The progress bar is a `<progress max=100>` with `percent` and the `stageTitle`.
  - "Cancelar" shows a `confirm()` and then calls `cancelExtraction()`.
  - Use plain language and no jargon besides ".nds".
  - Match the style of `App.svelte`.
- [X] T052 [US1] Update `packages/client/src/App.svelte`:
  - subscribe with `onAssetsState` and `getAssetsState`;
  - render `<FirstRun>` until `status === "ready"`;
  - on the first-run transition to `ready`, show "Assets prontos" for ~1 s before showing the existing main content;
  - keep `UpdateNotice` visible on all screens.
- [ ] T053 [US1] Manual check: follow quickstart §4 steps 1–6 with a real ROM, or with `REFERENCE_ROM_SHA1` locally overridden to a synthetic ROM's hash and then reverted. Record the timings for SC-002, SC-003 and SC-007 in the PR description.

**Checkpoint**: MVP. A primeira execução funciona de ponta a ponta.

---

## Phase 4: User Story 2 - Arquivo errado recusado com mensagem clara (Priority: P1)

**Goal**: todo arquivo errado é recusado antes de qualquer cópia, com mensagem específica e
indicação do que fornecer.

**Independent Test**: oferecer ao validador e à tela cada tipo de arquivo errado (sintético) e
conferir a mensagem.

### Tests for User Story 2 ⚠️

- [X] T054 [P] [US2] Extend `packages/extractor/test/rom/validate.test.ts` with one case per reason (SC-004):
  - unreadable: missing path, and a directory;
  - `archive`, for each of zip `PK\x03\x04`, 7z `7z\xBC\xAF\x27\x1C` and rar `Rar!\x1A\x07`;
  - `not-ds-rom`, for each of: under 32 KiB; over 512 MiB (sparse file via `truncate`, no full hash computed — assert with a hashing spy); bad header CRC; bad logo CRC;
  - `heartgold`: gameCode `IPKE` → region `usa`, and `IPKP` → `europe`;
  - `other-region`, for each of `IPGJ`→japan, `IPGK`→korea, `IPGP`→europe, `IPGF`→france, `IPGD`→germany, `IPGI`→italy, `IPGS`→spain, `IPGX`→unknown;
  - `other-game`: gameCode `ABCE` with title `"OTHER GAME"`. Assert the returned `title` keeps only printable ASCII, at most 12 chars.

  Each rejection must leave no file written.
- [X] T055 [P] [US2] Write `packages/shared/test/rom-validation.test.ts`. `romRejectionMessage(rejection)` returns a non-empty PT-BR `{ title, detail }` for every reason. HeartGold mentions "HeartGold". `other-region` names the region in PT-BR (Japão, Coreia, Europa, França, Alemanha, Itália, Espanha, "região desconhecida"). `archive` says to extract the file first. Every `detail` ends with "Escolha o arquivo de Pokémon SoulSilver (EUA), com extensão .nds.".
- [X] T056 [P] [US2] Extend `packages/app/test/assets-controller.test.ts`:
  - `validated` with `ok: false` → `rejected { rejection }`, no `copied` is awaited, and no extract is forked;
  - from `rejected`, both `chooseRom()` and `submitRomPath()` go back to `validating`;
  - `submitRomPath("")` is ignored.

### Implementation for User Story 2

- [X] T057 [US2] Complete `validateRom` in `packages/extractor/src/rom/validate.ts` so every T054 case passes. Region map per research R1. `title` is sanitized to printable ASCII, at most 12 chars.
- [X] T058 [US2] Implement `romRejectionMessage` in `packages/shared/src/rom-validation.ts` so T055 passes.
- [X] T059 [US2] Update `packages/app/src/main/assets-controller.ts` for the `rejected` transitions so T056 passes.
- [X] T060 [US2] In `packages/client/src/FirstRun.svelte`, render the `rejected` state: `romRejectionMessage` title and detail, the button "Escolher outro arquivo", and the drop zone still active.
- [ ] T061 [US2] Manual check: quickstart §4 step 3 (zip and txt). If available, also a HeartGold ROM and a ROM with one modified byte.

**Checkpoint**: US1 + US2 cobrem todos os casos de entrada do jogador.

---

## Phase 5: User Story 3 - Reextração automática após atualização (Priority: P2)

**Goal**: uma etapa nova ou com versão nova, ou uma saída ausente, é reextraída sozinha a
partir da cópia guardada, só no que for preciso.

**Independent Test**: com assets prontos, subir a versão de uma etapa e abrir o app: só ela (e as
dependentes) roda, sem pedir a ROM (SC-006).

### Tests for User Story 3 ⚠️

- [X] T062 [P] [US3] Extend `packages/extractor/test/pipeline/plan.test.ts` with the remaining reasons from data-model.md "Plano de execução", using 3 fake stages A → B → C plus an independent D.
  - Bumping B's version plans B (`version-changed`) and C (`dependency-rerun`) only.
  - Adding a new stage E plans only E (`missing`).
  - `isOutputValid` false for A plans A (`output-invalid`), then B and C (`dependency-rerun`).
  - When a stage matches several reasons, the highest-priority one is reported.
  - A stage in the manifest but no longer registered is returned in `plan.removed`.
- [X] T063 [P] [US3] Write `packages/extractor/test/pipeline/update.test.ts` (SC-006). Run `runPipeline` with registry v1 to completion. Then run with B's version bumped, and assert:
  - only B and C ran (spy on `run`);
  - A's `stages/` folder mtime and manifest record are unchanged;
  - the manifest shows B's new version;
  - a stage removed from the registry is removed from both the manifest and `stages/`.
- [X] T064 [P] [US3] Extend `packages/extractor/test/pipeline/check.test.ts`:
  - a stage version differs, or a registered stage is missing from the manifest → `needs-extraction { reason: "outdated" }`;
  - an output folder is deleted, or its file count differs → `reason: "outputs-missing"`;
  - a manifest with all stages but a missing ROM copy → `romAvailable: false`.
- [X] T065 [P] [US3] Extend `packages/app/test/assets-controller.test.ts`:
  - `needs-extraction` + `romAvailable` → forks `extract` immediately, with mode `update` for `outdated` and `repair` for `outputs-missing`, and never opens the dialog;
  - `needs-extraction` without `romAvailable` → `needs-rom { savedRom: false }`;
  - a `rom-copy-invalid` message → `needs-rom { savedRom: false, previousRomInvalid: true }`.

### Implementation for User Story 3

- [X] T066 [US3] Complete `planRun` in `packages/extractor/src/pipeline/plan.ts`. Add the reasons `version-changed`, `output-invalid` and `dependency-rerun` with the priority in data-model.md, and return `{ stages, removed }`. Must make T062 pass.
- [X] T067 [US3] Update `runPipeline` in `packages/extractor/src/pipeline/run.ts`:
  1. Remove the `removed` stages (delete them from the manifest with `writeManifest`, then delete their folders).
  2. Before re-running stages that already exist, drop their manifest entries and their dependents' entries in one atomic write, and only then delete the old folders (research R7, step 4).

  Must make T063 pass.
- [X] T068 [US3] Complete `checkAssets` in `packages/extractor/src/pipeline/check.ts` for the `outdated` and `outputs-missing` cases, so T064 passes.
- [X] T069 [US3] Update `packages/app/src/main/assets-controller.ts` for the modes `update` and `repair` and for `rom-copy-invalid`. In `packages/app/src/extractor-host/entry.ts`, before `extract`, verify the copy's SHA-1 against `REFERENCE_ROM_SHA1`; if the copy is missing or wrong, post `rom-copy-invalid`. Must make T065 pass.
- [X] T070 [US3] In `packages/client/src/FirstRun.svelte`, add the per-mode titles for `extracting` ("Atualizando os arquivos do jogo", "Reparando os arquivos do jogo") and the `previousRomInvalid` notice on `needs-rom`.
- [ ] T071 [US3] Manual check: quickstart §6.

**Checkpoint**: atualizações do app que mudam etapas não exigem ação do jogador.

---

## Phase 6: User Story 4 - Interrupção sem estado inconsistente (Priority: P2)

**Goal**: interromper em qualquer ponto nunca deixa assets pela metade marcados como prontos, e
a próxima abertura retoma por etapa.

**Independent Test**: derrubar o run em ≥ 10 pontos e conferir que a execução seguinte termina
pronta e íntegra (SC-005).

### Tests for User Story 4 ⚠️

- [X] T072 [P] [US4] Write `packages/extractor/test/pipeline/interruption.test.ts` (SC-005). Use 3 fake stages with multiple outputs. Add an `onCheckpoint(name)` hook to `RunArgs`, with these names:

  - `after-lock`
  - `after-cleanup`
  - `before-stage:<id>`
  - `mid-stage:<id>`, called by the fake stage between files
  - `after-stage-run:<id>`
  - `after-old-removed:<id>`
  - `after-rename:<id>`
  - `after-manifest:<id>`
  - `before-manifest-entry-drop`, used in the update scenario

  For every checkpoint, in a fresh workspace:
  1. Throw a sentinel error from the hook to simulate a crash: no cleanup, and the lock file left behind with a dead pid via an injected `isAlive`.
  2. Run again without the hook.
  3. Assert the result is `completed`, `checkAssets` is `ready`, `verifyOutputs` reports no mismatch, and `staging/` is empty.

  Also assert that right after each crash, `checkAssets` is never `ready` unless the crash point is after the last manifest write. Cover both the first run and the update scenario (B bumped).
- [X] T073 [P] [US4] Extend `packages/extractor/test/pipeline/run.test.ts`. Leftover `staging/*` folders and `stages/<id>` folders absent from the manifest are deleted at start. A stage already complete and valid is skipped on resume (spy on `run`).
- [X] T074 [P] [US4] Extend `packages/app/test/assets-controller.test.ts`:
  - `cancel()` while extracting posts `cancel` and emits `cancelling`;
  - `cancelled` → `needs-rom { savedRom: true }`;
  - with no exit within 5 s (fake timers), `kill()` is called;
  - `startExtraction()` from `needs-rom { savedRom: true }` forks `extract` with mode `resume`;
  - `incomplete` from `checkAssets` → mode `resume`;
  - `isBusy()` is true in `validating`, `extracting` and `cancelling`;
  - `shutdown()` cancels and resolves within 5 s.

### Implementation for User Story 4

- [X] T075 [US4] In `packages/extractor/src/pipeline/run.ts`, add the `onCheckpoint` calls at the exact points named in T072, plus startup cleanup of `staging/*` and orphan `stages/<id>` folders. Map `incomplete` correctly in `check.ts`: the manifest exists but registered stages are missing and none has a version mismatch. Must make T072 and T073 pass.
- [X] T076 [US4] Implement `verifyOutputs({ workspaceDir, registry })` in `packages/extractor/src/pipeline/check.ts`. It returns `{ ok, mismatches: Array<{ stageId, output, expected, actual }> }` using `digestTree`. Export it from `index.ts`.
- [X] T077 [US4] Update `packages/app/src/main/assets-controller.ts` with `cancel()`, the 5 s kill timeout, the `resume` mode, `isBusy()` and `shutdown()`, so T074 passes.
- [X] T078 [US4] In `packages/app/src/main/index.ts`, on `window.on("close")`, if `controller.isBusy()`:
  1. `preventDefault`.
  2. Show `dialog.showMessageBox(window, { type: "question", buttons: ["Fechar mesmo assim", "Continuar"], defaultId: 1, cancelId: 1, message: "A extração está em andamento.", detail: "Se fechar agora, ela será retomada na próxima vez que você abrir o jogo." })`.
  3. On "Fechar mesmo assim", `await controller.shutdown()`, then `window.destroy()`.

  Also call `controller.shutdown()` in `before-quit`.
- [X] T079 [US4] In `packages/client/src/FirstRun.svelte`, add "Retomar extração" when `needs-rom.savedRom` is true (calls `startExtraction()`), the `cancelling` view and the `resume` title "Retomando a preparação do jogo".
- [ ] T080 [US4] Manual check: quickstart §5, including killing `electron.exe` from Task Manager.

**Checkpoint**: extração robusta a cancelamento, fechamento e queda.

---

## Phase 7: User Story 5 - Log de erros que o jogador consegue enviar (Priority: P3)

**Goal**: falhas mostram uma mensagem simples com "Tentar de novo" e "Abrir log"; o log basta
para diagnosticar e não contém dados da ROM.

**Independent Test**: forçar falta de permissão ou de espaço e conferir a tela e o log.

### Tests for User Story 5 ⚠️

- [X] T081 [P] [US5] Extend `packages/extractor/test/log.test.ts` for `createFileLogger(path, { maxBytes })`.
  - Lines have the format `ISO LEVEL [stageId] message`.
  - `error` appends the error `code` and stack.
  - Past `maxBytes`, the file rotates to `extractor.1.log`, keeping only one backup.
  - Parent dirs are created.
  - Passing a `Uint8Array` or `Buffer` as the error or the message never writes its bytes: they are replaced by `<binary N bytes>`.
- [X] T082 [P] [US5] Extend `packages/extractor/test/pipeline/run.test.ts` with these failure cases:
  - With an injected `statfs` reporting less than the sum of `estimateBytes` + 64 MiB, the run returns `disk-full { requiredBytes, availableBytes }` before creating any staging folder.
  - A stage throwing an error with `code: "ENOSPC"` → `disk-full`.
  - `EACCES`/`EPERM` while writing → `write-permission { path }`.
  - In every failure, the logger received a first `info` line with the app version (new `RunArgs.appVersion?`), the stage versions and the ROM SHA-1, plus an `error` line with the stage id.
  - No log line contains ROM bytes.
- [X] T083 [P] [US5] Extend `packages/app/test/assets-controller.test.ts`:
  - each `failed` message → `failed { failure }`;
  - `startExtraction()` from `failed` goes back to `checking`;
  - `openLog()` calls the injected `showItemInFolder` with `paths.logFile`.

### Implementation for User Story 5

- [X] T084 [US5] Implement `createFileLogger` with rotation and binary redaction in `packages/extractor/src/log.ts` so T081 passes. Export it from `index.ts`.
- [X] T085 [US5] In `packages/extractor/src/pipeline/run.ts`, add the pre-flight space check with an injectable `statfs` (research R12), the error mapping (`ENOSPC` → `disk-full`, `EACCES`/`EPERM` → `write-permission`) and the start and failure log lines, so T082 passes. Add `disk-full` and `write-permission` to `PipelineError` per contracts/extractor-library-api.md.
- [X] T086 [US5] In `packages/app/src/extractor-host/entry.ts`, switch to `createFileLogger(logPath)`, pass `appVersion`, and map `PipelineError` → `AssetsFailure`: `stage-failed` → `{ code: "stage-failed", stageTitle }`, and `rom-mismatch` → the `rom-copy-invalid` message. Log the validation results too, without paths outside the chosen file.
- [X] T087 [US5] Update `packages/app/src/main/assets-controller.ts` for the `failed`, retry and `openLog` paths so T083 passes. In `packages/app/src/main/index.ts`, inject `shell.showItemInFolder`.
- [X] T088 [US5] In `packages/client/src/FirstRun.svelte`, render `failed` with one PT-BR message per `failure.code`:
  - `disk-full`: required and available space in MB/GB with 1 decimal;
  - `write-permission`: the folder path;
  - `busy`, `rom-copy-failed`, `stage-failed` (with `stageTitle`) and `unexpected`: one message each.

  Show the buttons "Tentar de novo" (`startExtraction()`) and "Abrir log" (`openExtractionLog()`).
- [ ] T089 [US5] Manual check: quickstart §7.

**Checkpoint**: todo erro é recuperável pela interface ou diagnosticável pelo log.

---

## Phase 8: User Story 6 - Extrator por linha de comando (Priority: P3)

**Goal**: o desenvolvedor roda o mesmo extrator pela CLI, escolhendo ROM, pasta de saída e
etapas.

**Independent Test**: `npm run extract` com uma ROM sintética numa pasta vazia; rodar de novo
pedindo só uma etapa; conferir saídas, manifesto e códigos de saída.

### Tests for User Story 6 ⚠️

- [X] T090 [P] [US6] Extend `packages/extractor/test/pipeline/plan.test.ts` for the `only` and `force` options of `planRun`.
  - `only: ["C"]` with A missing plans A and C, but not an unrelated D.
  - `force: ["A"]` on a complete manifest plans A (`forced`) plus its dependents (`dependency-rerun`).
  - An unknown id in `only`/`force` throws `StageRegistryError`.
- [X] T091 [P] [US6] Write `packages/extractor/test/cli.test.ts` for `main(argv, io)`, where `io` is `{ stdout, stderr, isTTY, references?, registry? }` and is injected. Cover every row of contracts/cli.md:
  - `--list` prints `rom-unpack v1` and exits 0 without `--rom`.
  - A missing `--rom` exits 2; an unknown option exits 2; an unknown stage in `--stages` exits 2.
  - A rejected ROM exits 3 and prints `romRejectionMessage` to stderr.
  - A synthetic ROM into a temp `--out` exits 0 and writes `manifest.json`.
  - A second run prints "em dia, pulada" and exits 0.
  - `--force rom-unpack` re-runs.
  - `--verify` exits 0, and 1 after corrupting one output byte.
  - `busy` exits 4.
  - Progress lines appear every 10 percentage points when not a TTY.
- [X] T092 [P] [US6] Add a parity test (SC-008) to `packages/extractor/test/cli.test.ts`. The same synthetic ROM run through `runPipeline` (as the app does) and through `main` gives manifests equal after removing `createdAt`, `updatedAt` and `completedAt`.

### Implementation for User Story 6

- [X] T093 [US6] Complete `planRun` in `packages/extractor/src/pipeline/plan.ts` for `only` and `force` so T090 passes. Pass both through `RunArgs` in `run.ts`.
- [X] T094 [US6] Implement `packages/extractor/src/cli.ts`:
  - `export async function main(argv: string[], io): Promise<number>`, using `parseArgs` from `node:util` with the options in contracts/cli.md (`--out` default `assets`);
  - `--list` prints id, version, title, inputs and outputs;
  - `--verify` calls `validateRom` then `verifyOutputs`;
  - otherwise it validates and runs `runPipeline` with `createConsoleLogger` (plus `createFileLogger` when `--log` is given);
  - `SIGINT` aborts → exit 130;
  - add the direct-execution guard `if (import.meta.main) process.exitCode = await main(process.argv.slice(2), defaultIo)`.

  Must make T091 and T092 pass.
- [X] T095 [US6] Manual check: quickstart §3 with a real ROM.

**Checkpoint**: todas as histórias funcionando de forma independente.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T096 [P] Add the section "Preparar o jogo (ROM)" to `README.md` (PT-BR):
  - what the player needs: their own dump of Pokémon SoulSilver (EUA), `.nds`;
  - what each refusal message means;
  - where data lives (`%APPDATA%\SoulSilver Desktop\rom`, `extraction`, `logs`);
  - how to send the log;
  - for developers: `npm run extract` (link contracts/cli.md) and how to plug a new stage (link the contract section "Como uma etapa futura se pluga").
- [ ] T097 [P] Confirm `REFERENCE_ROM_SHA1` against the No-Intro DAT and a real dump (quickstart §2). Update the comment in `packages/extractor/src/rom/reference.ts` with the source, and remove "pending".
- [X] T098 [P] Run `npm run check:assets` and `git status`. Confirm that no `.nds`, no `assets/` content and no binary fixture is tracked, and that the extractor tests created none inside the repo.
- [X] T099 Run `npm run dist` and `node scripts/verify-package.ts packages/app/dist` (quickstart §8). Confirm `out/main/extractor-host.js` is in the package and no forbidden file is.
- [X] T100 Measure on a modest Windows PC: validation < 5 s, first extraction < 2 min and startup check < 1 s (SC-002, SC-003, SC-007). If the startup check misses, profile `countFiles` before changing the design (research R9).
- [ ] T101 Full quickstart run (§1–8). Mark `specs/003-rom-extraction-pipeline/checklists/requirements.md` and the PR checklist.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup e bloqueia todas as histórias.
- **US1 (Phase 3)**: depende da Foundational. É o MVP.
- **US2 (Phase 4)**: depende da Foundational. T055 e T058 (mensagens em `shared`) são independentes de US1; T054 e T057 completam o `validate.ts` criado em T041; as de app e tela (T056, T059, T060) dependem de T046 e T051.
- **US3 (Phase 5)**: biblioteca (T062–T064, T066–T068) depende só da Foundational; app (T065, T069, T070) depende de US1.
- **US4 (Phase 6)**: biblioteca (T072, T073, T075, T076) depende da Foundational e, para o cenário de atualização, de T067; app depende de US1.
- **US5 (Phase 7)**: biblioteca (T081, T082, T084, T085) depende da Foundational; app depende de US1.
- **US6 (Phase 8)**: depende da Foundational, de T076 (`verifyOutputs`) e de `romUnpackStage` (T043) para `--list`.
- **Polish (Phase 9)**: depois das histórias desejadas.

### Dentro de cada história

- Testes antes da implementação, e eles MUST falhar primeiro.
- Biblioteca (`extractor`) → contratos (`shared`) → app (`assets-controller`, host, `index.ts`, preload) → tela (`FirstRun.svelte`) → verificação manual.
- `packages/app/src/main/assets-controller.ts`, `packages/extractor/src/pipeline/run.ts` e `FirstRun.svelte` são editados em várias histórias: não paralelizar tasks que tocam o mesmo arquivo.

### Parallel Opportunities

- Setup: T002, T003 e T004.
- Foundational: T005, T006, T007, T009, T010, T011, T012, T013, T014, T016, T017, T019, T021, T023, T024, T026 e T028 (arquivos diferentes). As implementações seguem cada teste.
- US1: todos os testes T031–T037 em paralelo; T040 e T042 em paralelo com T038/T039.
- Depois de US1, as partes de biblioteca de US2, US3, US4, US5 e US6 podem andar em paralelo (arquivos de teste diferentes; a implementação em `run.ts`/`plan.ts` é sequencial).

---

## Parallel Example: User Story 1

```text
Task: "T031 validate.test.ts (accept path)"
Task: "T032 copy.test.ts"
Task: "T033 nds/header.test.ts"
Task: "T034 nds/filesystem.test.ts"
Task: "T035 narc.test.ts"
Task: "T036 stages/rom-unpack.test.ts"
Task: "T037 app/test/assets-controller.test.ts (first-run)"

# depois:
Task: "T040 nds/narc.ts"
Task: "T042 rom/copy.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 + Phase 2.
2. Phase 3 (US1).
3. **Validar**: quickstart §4. O jogador chega a "Assets prontos" com a ROM certa.

### Incremental Delivery

1. Setup + Foundational → pipeline genérico testado.
2. US1 → MVP jogável até a tela principal.
3. US2 → recusas específicas (mesma prioridade P1; entregar junto com US1 para os amigos).
4. US3 + US4 → atualizações e robustez (pré-requisito para os specs 4 a 9, que vão mudar etapas).
5. US5 + US6 → suporte (log) e ferramenta de desenvolvimento (CLI, usada nos specs 4 a 9).

---

## Notes

- T057 mantém a numeração estável depois de dividir a validação entre US1 e US2; segue a mesma regra das demais.
- Cada task termina com typecheck, lint e testes verdes.
- Commits pequenos por task ou grupo lógico, mensagens em inglês.
