---

description: "Lista de tasks da feature 004-game-data-extraction"
---

# Tasks: Dados do jogo

**Input**: Design documents from `/specs/004-game-data-extraction/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: incluídos. O princípio V exige test-first para o extrator. Toda task de teste MUST
ser escrita e falhar antes da task de implementação correspondente. Não há UI nova.

**Organization**: tasks agrupadas por história de usuário (US1 a US3 do spec).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: US1 a US3 do spec
- Caminhos relativos à raiz do repositório

## Regras gerais para quem executa

- Código, identificadores, chaves de enum e commits em inglês. Mensagens de `problem`, títulos de
  etapa e texto do relatório em PT-BR.
- `packages/extractor` e `packages/shared/src/game-data/` usam imports relativos com extensão
  `.ts` e só sintaxe apagável (nada de `enum`, `namespace` ou parameter properties). A CLI roda
  com `node` direto.
- `packages/shared/src/game-data/` MUST NOT importar módulos do Node nem `electron` (o servidor vai
  importá-lo).
- Os testes usam só builders sintéticos. Nunca leia a ROM real nem `assets/` nos testes
  (princípio II). Arquivos temporários vão em `os.tmpdir()`.
- Offsets, contagens e mapeamentos de layout: copie exatamente de
  [research.md](./research.md) (R1, R3, R6, R7, R8, R10, R11, R15).
- Antes de concluir qualquer task: `npm run typecheck`, `npm run lint` e `npm test` passando.
- Atenção no Git Bash: heredocs com `'EOF'` podem colapsar `\\`. Para literais de caminho do
  Windows em testes, prefira barras normais (`D:/x`).

---

## Phase 1: Setup

- [X] T001 In `packages/shared`:
  - run `npm install zod@^4.6 -w @soulsilver/shared`, so it becomes a runtime `dependency`;
  - in `packages/shared/package.json`, add the export `"./game-data": "./src/game-data/index.ts"`;
  - in `packages/shared/tsconfig.json`, add `"allowImportingTsExtensions": true`;
  - confirm `package-lock.json` is updated.
- [X] T002 [P] Create `packages/shared/src/game-data/index.ts` with only `export const GAME_DATA_FORMAT_VERSION = 1;`. Create `packages/extractor/test/fixtures/game-data/README.md` explaining that the folder holds synthetic builders of the original binary formats (research R16) and an `encodeBlz` used only by tests.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: envelope e parser de schemas, BLZ, leitura de código, etapa `code-decompress`,
layout, helper de escrita, builders sintéticos e a fábrica de etapas de dados.

**⚠️ CRITICAL**: nenhuma história começa antes desta fase.

### Schemas: envelope e parser

- [X] T003 [P] Write `packages/shared/test/game-data/parse.test.ts` (test-first) against a tiny test-only kind registered through `createGameDataCodec(schemas)`, the generic factory used by `index.ts`. Cover, per contracts/game-data-api.md "Garantias":
  - a valid envelope `{ kind, formatVersion: 1, records }` parses;
  - wrong `kind` fails with path `kind`;
  - `formatVersion: 2` fails with path `formatVersion`;
  - an unknown field fails with that field's path (strict objects);
  - `records` out of order or with a duplicate `id` fails with the path of the first offending record, e.g. `records.3.id`;
  - nested paths use dots and indices (`records.5.baseStats.hp`);
  - `problem` is non-empty PT-BR text, e.g. contains "esperado";
  - `parseGameDataJson` with invalid JSON gives path `""` and a problem starting "JSON inválido";
  - `serializeGameDataFile` gives `JSON.stringify(value, null, 2) + "\n"`, is stable across calls, and round-trips through `parseGameDataJson`.
- [X] T004 Implement `packages/shared/src/game-data/common.ts` and `packages/shared/src/game-data/parse.ts` so T003 passes. They provide:
  - the zod helpers `int(min, max)` and `id()` (integer ≥ 0);
  - `textRef(catalog)` with catalogs `"species-names" | "move-names" | "item-names" | "ability-names" | "type-names" | "nature-names"`;
  - `stats(min, max)` with keys `hp, attack, defense, speed, specialAttack, specialDefense` in that order;
  - `fileSchema(kind, record)`, which builds the strict envelope and refines `records` to be strictly increasing by `id`;
  - `createGameDataCodec(schemas)`, returning `{ parseGameDataFile, parseGameDataJson, serializeGameDataFile }`. It maps the first zod issue to `{ file, path, problem }`, with path segments joined by "." and a PT-BR problem built from the issue code: "esperado inteiro entre A e B, recebido X", "campo desconhecido", "valor não permitido", "registros fora de ordem ou repetidos".

### BLZ e código

- [X] T005 [P] Create `packages/extractor/test/fixtures/game-data/blz-encode.ts` with `encodeBlz(plain: Uint8Array): Uint8Array`, a simple greedy BLZ encoder for tests:
  - backward matching with `len 3..18` and `disp 3..4098`;
  - the 8-byte footer per research R2, so that `blz(encodeBlz(x))` restores `x`.
- [X] T006 [P] Write `packages/extractor/test/data/blz.test.ts` (test-first) for `decompressBlz(bytes)`:
  - round-trips `encodeBlz` output for random, repetitive and all-literal buffers;
  - leaves the uncompressed head (before the compressed region) untouched;
  - throws `BlzFormatError` when the footer sizes exceed the buffer.
- [X] T007 Implement `decompressBlz` and `BlzFormatError` in `packages/extractor/src/data/blz.ts` so T006 passes (algorithm in research R2).
- [X] T008 [P] Write `packages/extractor/test/data/code.test.ts` (test-first) for `decompressArm9(arm9, loadAddress)` and `decompressOverlay(bytes, y9Entry)`.
  - ARM9 with module params, built by putting the magic `21 06 C0 DE DE C0 06 21` at params + 0x1C and `compressedStaticEnd` at params + 0x14: the compressed region is decompressed and the tail is appended unchanged.
  - `compressedStaticEnd === 0` returns the input as is.
  - Missing magic throws.
  - An overlay with bit 24 of the y9 word at 0x1C set is decompressed; without it, it is returned as is.
- [X] T009 Implement `packages/extractor/src/data/code.ts` (`decompressArm9`, `decompressOverlay`, `readOverlayTable(y9)`) so T008 passes.
- [X] T010 [P] Write `packages/extractor/test/stages/code-decompress.test.ts` (test-first). Build a ROM with `buildNdsRom({ arm9: <module-params arm9 compressed with encodeBlz>, overlays9: [compressed, plain] })` and set the y9 compressed flag for overlay 0; extend `buildNdsRom` options with `overlayFlags?: number[]` if needed. Run `romUnpackStage` + `codeDecompressStage` through `runPipeline`, then assert:
  - `stages/code-decompress/code/arm9.bin` equals the plain ARM9;
  - `code/overlay9/0000.bin` and `0001.bin` equal the plain overlays;
  - the stage metadata matches contracts/stages.md: `id "code-decompress"`, title "Descomprimindo o código do jogo", version 1, weight 2, inputs `rom-unpack/binaries`, output `code`, `estimateBytes` 8 MiB.
- [X] T011 Implement `codeDecompressStage` in `packages/extractor/src/stages/code-decompress.ts` so T010 passes. Add it to `defaultStages` in `packages/extractor/src/stages/index.ts`, after `romUnpackStage`.

### Layout, builders e escrita

- [X] T012 [P] Create `packages/extractor/src/data/layout.ts` with the `DataLayout` type and `SOULSILVER_US_LAYOUT`, with values exactly from research R1, R3 and R10:
  - NARC paths: personal `a/0/0/2`, moves `a/0/1/1`, levelup `a/0/3/3`, evolutions `a/0/3/4`, egg moves `a/2/2/9`, items `a/0/1/7`, growth `a/0/0/3`, messages `a/0/2/7`;
  - `abilityNameBank: 720`;
  - `tutorCompatFile: "fielddata/wazaoshie/waza_oshie.bin"`;
  - ARM9 offsets: `natures 0xff639`, `machines 0x1000cc`, `itemMap 0x100194`;
  - overlay tables: `typeChart { overlay: 12, offset: 0x353bc }`, `tutors { overlay: 1, offset: 0x23ae0 }`;
  - counts: `species 493`, `moves 467`, `items 536`, `machines 100`, `tutors 52`, `tutorCompatEntries 505`, `natures 25`, `types 18`, `growthRates 6`;
  - `forms`: the 12 entries `{ personalIndex, species, form }` from research R3 (496–498 → 386/1–3, 499–500 → 413/1–2, 501 → 487/1, 502 → 492/1, 503–507 → 479/1–5).
- [X] T013 [P] Create `packages/extractor/test/fixtures/game-data/builders.ts` with builders that write the original binary formats (research R3–R8):
  - `personal({...})` → 44 bytes;
  - `move({...})` → 16 bytes;
  - `item({...})` → 34 bytes;
  - `levelUp([[level, move], ...])` → u16 stream + `0xFFFF`;
  - `evolutions([[method, param, into], ...])` → 44 bytes;
  - `eggMoves({ [species]: moves[] })`;
  - `growth(values101)` → 404 bytes;
  - `tutorCompat(entries: bigint[])`;
  - `typeChart(triples, ignored)` → bytes with the `254,254,0` separator and the `255` terminator;
  - `natures(rows)`;
  - `machineTable(moves100)`;
  - `tutorList(records)`;
  - `itemMap(dataIndexByItemId)`;
  - `msgBankHeader(count)`.

  Also create `syntheticLayout(...)` (a small layout: e.g. 6 species, 2 forms, 8 moves, 10 items, 4 machines, 3 tutors, 18 types, 25 natures, 6 growth rates) and `writeInputs(workspaceDir, parts)`. The latter creates `stages/rom-unpack/{narc,filesystem}` and `stages/code-decompress/code/{arm9.bin,overlay9/NNNN.bin}`, placing tables at the synthetic layout's offsets.
- [X] T014 [P] Write `packages/extractor/test/data/write.test.ts` (test-first) for `writeGameDataFile(dir, kind, data, fileName)`. It writes `serializeGameDataFile` output. On a schema failure it throws an `Error` whose message contains the file name, the path and the problem, and writes nothing. Then implement `packages/extractor/src/data/write.ts`.
- [X] T015 Create `packages/extractor/src/data/stages.ts` exporting `createDataStages(layout: DataLayout): Stage[]` (empty for now) and the shared helper `dataStage({ id, title, inputs, files, run })`. The helper defines `version 1`, `weight 1`, `outputs ["json"]` and `estimateBytes` per contracts/stages.md. Append `...createDataStages(SOULSILVER_US_LAYOUT)` to `defaultStages`.
- [X] T016 Keep the 003 tests independent of the data stages, now that `defaultStages` grows:
  - in `packages/extractor/test/cli.test.ts`, pass `registry: createRegistry([romUnpackStage])` in `io()` and in the parity test (both sides);
  - in `packages/extractor/test/stages/rom-unpack.test.ts`, keep the explicit registry;
  - confirm `npm test` is green.

**Checkpoint**: parser genérico, BLZ, `code-decompress` e infraestrutura de dados prontos.

---

## Phase 3: User Story 1 - Espécies e golpes tipados (Priority: P1) 🎯 MVP

**Goal**: `species.json`, `moves.json`, `types.json`, `type-chart.json`, `natures.json` e
`abilities.json` gerados, validados e carregáveis com erro claro.

**Independent Test**: com entradas sintéticas, rodar `data-species`, `data-moves` e `data-tables`
e conferir cada campo; um arquivo alterado à mão é recusado com arquivo, caminho e problema.

### Tests for User Story 1 ⚠️ (escrever primeiro, devem falhar)

- [X] T017 [P] [US1] Write `packages/shared/test/game-data/schemas-us1.test.ts` (test-first) for the `species`, `moves`, `types`, `type-chart`, `natures` and `abilities` schemas, per data-model.md. For each rule below, one valid record and one invalid record with the expected path.
  - **Species**: `baseStats` 0–255 each; `types` length 1–2; `abilities` length 1–2; `catchRate` and `baseExperience` 0–255; `evYield` 0–3 each; `gender.kind` in `male-only | female-only | genderless | mixed` with `raw` 0–255; `growthRate` in the six keys; `eggGroups` length 1–2 from the 15 keys; `heldItems.common/rare` id or `null`; `name.catalog === "species-names"`; `forms` integer array.
  - **Moves**: `category` in `physical | special | status`; `accuracy` 1–100 or `null`; `target` in the 13 keys; all 8 flag booleans present; `effect.chance` 0–100; `name.catalog === "move-names"`.
  - **Type chart**: `against` has exactly 18 values, each in {0, 5, 10, 20}; `foresightIgnored` is a list of `{ attacker, defender }`.
  - **Natures**: `increased`/`decreased` in `attack | defense | speed | specialAttack | specialDefense` or `null`, both `null` or both non-null and different.
  - **Abilities**: `{ id, name }` with `ability-names`.
- [X] T018 [P] [US1] Write `packages/extractor/test/data/personal.test.ts` (test-first) for `readPersonal(bytes, personalIndex, layout)` → `SpeciesRecord`, using the `personal` builder.
  - Stats map from file order HP, Atk, Def, **Spe**, SpA, SpD to the named keys.
  - Equal type bytes give a single type.
  - Second ability 0 is dropped.
  - EV bits are decoded 2 per stat in the same order.
  - Gender raw 0, 254, 255 and 31 give `male-only`, `female-only`, `genderless` and `mixed`.
  - Held item 0 becomes `null`.
  - Equal egg groups collapse to one.
  - Color byte bit 7 becomes `flip`.
  - Form indices resolve `species/form` from the layout; base species list their form ids in `forms`.
  - A buffer shorter than 44 bytes throws.
- [X] T019 [P] [US1] Write `packages/extractor/test/data/move.test.ts` (test-first) for `readMove(bytes, id)` → `MoveRecord`.
  - Categories 0, 1, 2 map to their keys.
  - Accuracy 0 becomes `null`.
  - Power is raw (0 and 1 preserved).
  - Priority is read as signed (0xFF → −1).
  - Each target value from research R11 maps to its key, and an unlisted value gives `"unknown"` with `targetRaw` kept.
  - Each flag bit maps to its key, with `flagsRaw` kept.
  - Effect id and chance are raw.
  - A buffer shorter than 16 bytes throws.
- [X] T020 [P] [US1] Write `packages/extractor/test/data/tables.test.ts` (test-first, US1 part).
  - `readTypeChart(code, offset)` builds an 18×18 matrix with default 10, collects the pairs after the separator into `foresightIgnored`, and throws naming "tabela de tipos" and the offset when a multiplier is not in {0, 5, 20}, an id is ≥ 18, or there is no terminator within 200 triples.
  - `readNatures(code, offset)` maps the column order Atk, Def, Spe, SpA, SpD to keys, makes rows 0/6/12/18/24 neutral (`null`/`null`), and throws on a row without exactly one +1 and one −1.
  - `readAbilityCount(bankBytes)` returns the u16 header minus 1.
  - `types()` returns 18 records with keys `normal, fighting, flying, poison, ground, rock, bug, ghost, steel, unknown, fire, water, grass, electric, psychic, ice, dragon, dark`.
- [X] T021 [P] [US1] Write `packages/extractor/test/data/stages-us1.test.ts` (test-first). Using `writeInputs` and `syntheticLayout`, run `data-species`, `data-moves` and `data-tables` through `runPipeline` and assert:
  - `species.json` has the synthetic species plus forms, in id order, and no records for 494/495-like entries;
  - `moves.json` has ids `1..layout.counts.moves` and skips entries beyond;
  - `types.json`, `type-chart.json`, `natures.json` and `abilities.json` contain the expected records;
  - each file parses with `parseGameDataJson`;
  - each stage's metadata matches contracts/stages.md (titles "Lendo os Pokémon", "Lendo os golpes", "Lendo tipos, naturezas e experiência"; their inputs).
- [X] T022 [P] [US1] Write `packages/shared/test/game-data/load.test.ts` (SC-004). Take a valid synthetic `moves` file and, for each of 5 manual edits (accuracy 150, category "magic", missing `pp`, extra field `foo`, ids out of order), assert that `parseGameDataJson("moves", text, "moves.json")` returns `{ ok: false, error: { file: "moves.json", path, problem } }` with the expected path.

### Implementation for User Story 1

- [X] T023 [P] [US1] Implement the schemas in `packages/shared/src/game-data/species.ts`, `moves.ts` and `tables.ts` (types, type-chart with `foresightIgnored`, natures, abilities), exactly per data-model.md. Register them in `packages/shared/src/game-data/index.ts` with `GAME_DATA_FILES` entries: species → `data-species/species.json`, moves → `data-moves/moves.json`, types / type-chart / natures / abilities → `data-tables/*.json`. Export the inferred record types. Must make T017 and T022 pass.
- [X] T024 [P] [US1] Implement `readPersonal` in `packages/extractor/src/data/readers/personal.ts` so T018 passes.
- [X] T025 [P] [US1] Implement `readMove` in `packages/extractor/src/data/readers/move.ts` so T019 passes.
- [X] T026 [P] [US1] Implement `readTypeChart`, `readNatures`, `readAbilityCount` and `types()` in `packages/extractor/src/data/readers/tables.ts` so T020 passes.
- [X] T027 [US1] Add three stages to `createDataStages` in `packages/extractor/src/data/stages.ts`. Each writes through `writeGameDataFile`. Must make T021 pass.
  - **`data-species`**: reads personal `1..counts.species` and each layout form; skips everything else; fills `forms` on base species.
  - **`data-moves`**: reads `1..counts.moves`.
  - **`data-tables`**: types, type chart (overlay from `code/overlay9`), natures (`code/arm9.bin`), and abilities `1..readAbilityCount(msg bank)`.

**Checkpoint**: MVP. O combate tem stats, tipos, golpes, tabela de tipos e naturezas.

---

## Phase 4: User Story 2 - Progressão: learnsets, evoluções e experiência (Priority: P2)

**Goal**: `learnsets.json`, `machines.json`, `tutors.json`, `evolutions.json`, `items.json` e
`growth-rates.json` gerados e validados.

**Independent Test**: com entradas sintéticas contendo learnsets, evoluções, curvas e itens
conhecidos, conferir os arquivos campo a campo.

### Tests for User Story 2 ⚠️

- [X] T028 [P] [US2] Write `packages/shared/test/game-data/schemas-us2.test.ts` (test-first) for `learnsets`, `machines`, `tutors`, `evolutions`, `items` and `growth-rates` per data-model.md.
  - **Learnsets**: `levelUp[].level` 1–100.
  - **Machines**: `kind` `tm | hm`; `number` 1–92 for TM and 1–8 for HM.
  - **Tutors**: `cost` ≥ 0.
  - **Evolutions**: `condition.kind` in `none | level | item | move | species | beauty | raw` with the matching field; `method` includes `unknown`.
  - **Items**: `pocket` in the 8 keys; `partyUse.params` is 40 lowercase hex chars.
  - **Growth rates**: `experience` has exactly 100 values and is non-decreasing; `key` is one of the six.
- [X] T029 [P] [US2] Write `packages/extractor/test/data/learnset.test.ts` (test-first).
  - `readLevelUp(bytes)` decodes `(level << 9) | move`, keeps the order, stops at `0xFFFF`, and throws when there is no terminator.
  - `readEggMoves(bytes)` gives a map species → moves, with markers ≥ 20000 and end at `0xFFFF`.
  - `readMachineCompat(personalBytes)` maps bit k to machine k+1, including HM bits 92–99.
  - `readMachines(code, offset, 100)` gives TM01–TM92 as ids 1–92 (`kind "tm"`) and HM01–HM08 as ids 93–100 (`kind "hm"`, `number` 1–8), and throws when a move is outside 1–467 or the next u16 is not 0.
  - `readTutors(overlay, offset, 52)` decodes records `{move, cost, area}`, keeps cost 0, and throws when `area > 3`.
  - `readTutorCompat(bytes, index)` maps entry i < 493 to personal i+1 and entries 493–504 to the form indices in layout order.
- [X] T030 [P] [US2] Write `packages/extractor/test/data/evolution.test.ts` (test-first) for `readEvolutions(bytes)`.
  - Empty entries (method 0) are omitted.
  - Each method id 1–26 maps to its key in research R6, with `condition`: level methods → `{ kind: "level" }`, item methods (6, 7, 16–19) → `{ kind: "item" }`, 20 → `move`, 21 → `species`, 15 → `beauty`, the others → `none`.
  - An unknown id gives `method: "unknown"` with `condition: { kind: "raw", value }`.
  - The original order is kept.
- [X] T031 [P] [US2] Write `packages/extractor/test/data/item.test.ts` (test-first).
  - `readItemMap(code, offset, 536)` returns the data index per item id, and throws when id 0 is not data 0 or an index exceeds the member count.
  - `readItem(bytes, id, dataIndex)` decodes price, hold effect and parameter, pluck, fling effect and power, natural gift power, and the bitfield at 0x08 (type bits 0–4, preventToss bit 5, selectable bit 6, pocket bits 7–10 → keys `items, medicine, balls, machines, berries, mail, battle-items, key-items`, battlePockets bits 11–15). It also decodes `fieldUse`, `battleUse`, `partyUse.kind` and `partyUse.params` as 40 hex chars, and throws when the buffer is shorter than 34 bytes.
- [X] T032 [P] [US2] Extend `packages/extractor/test/data/tables.test.ts` with `readGrowthRates(members)`. It returns 6 records with ids 0–5, keys in research R8 order, and `experience` for levels 1–100 (dropping level 0). Members 6–7 are ignored.
- [X] T033 [P] [US2] Write `packages/extractor/test/data/stages-us2.test.ts` (test-first). With `writeInputs` and `syntheticLayout`, run `data-learnsets`, `data-evolutions`, `data-items` and `data-tables`, and assert:
  - `learnsets.json` has one record per species and form, with level-up, machines, egg (`[]` for forms) and tutors;
  - `machines.json` and `tutors.json` are as built;
  - `evolutions.json` only contains species that evolve;
  - `items.json` skips item ids mapped to data 0;
  - `growth-rates.json` has 6 records;
  - every file parses, and each stage's metadata matches contracts/stages.md.

### Implementation for User Story 2

- [X] T034 [P] [US2] Implement the schemas in `packages/shared/src/game-data/learnsets.ts`, `evolutions.ts`, `items.ts` and the `growth-rates` schema in `tables.ts`. Register them in `index.ts` with `GAME_DATA_FILES` entries: learnsets / machines / tutors → `data-learnsets`, evolutions → `data-evolutions`, items → `data-items`, growth-rates → `data-tables`. Must make T028 pass.
- [X] T035 [P] [US2] Implement `readLevelUp`, `readEggMoves`, `readMachineCompat`, `readMachines`, `readTutors` and `readTutorCompat` in `packages/extractor/src/data/readers/learnset.ts` so T029 passes.
- [X] T036 [P] [US2] Implement `readEvolutions` in `packages/extractor/src/data/readers/evolution.ts` so T030 passes.
- [X] T037 [P] [US2] Implement `readItemMap` and `readItem` in `packages/extractor/src/data/readers/item.ts` so T031 passes.
- [X] T038 [P] [US2] Implement `readGrowthRates` in `packages/extractor/src/data/readers/tables.ts` so T032 passes.
- [X] T039 [US2] Extend `createDataStages` in `packages/extractor/src/data/stages.ts` so T033 passes.
  - **`data-learnsets`**: title "Lendo os golpes que cada Pokémon aprende"; inputs `rom-unpack/narc`, `rom-unpack/filesystem`, `code-decompress/code`; writes `learnsets.json`, `machines.json`, `tutors.json`.
  - **`data-evolutions`**: title "Lendo as evoluções"; writes `evolutions.json`.
  - **`data-items`**: title "Lendo os itens"; inputs `rom-unpack/narc`, `code-decompress/code`; writes `items.json`.
  - **`data-tables`**: add `growth-rates.json`.

**Checkpoint**: progressão, lojas e mochila têm os dados de que precisam.

---

## Phase 5: User Story 3 - Relatório de sanidade (Priority: P3)

**Goal**: `npm run extract -- --out assets --report` valida os arquivos, confere contagens e
lista alertas.

**Independent Test**: relatório sobre dados sintéticos corretos (sem alertas) e sobre dados
alterados (falha ou alerta esperado).

### Tests for User Story 3 ⚠️

- [X] T040 [P] [US3] Write `packages/extractor/test/data/report.test.ts` (test-first) for `buildSanityReport(workspaceDir, { expected })`, which returns `SanityReport` per data-model.md. Generate correct synthetic data by running all data stages with `writeInputs`, then pass `expected` with the synthetic counts. Assert:
  - correct data gives `ok: true`, every file `ok`, every count `ok`, and zero warnings;
  - a missing `moves.json` gives `ok: false` and file status `missing`;
  - an edited invalid field gives `invalid` with path and problem;
  - one record removed gives `ok: false` with the count showing actual vs expected;
  - each edit below produces a warning with `kind`, `recordId`, `field`, `value` and `expected`, and `ok` stays `true`:
    - a species base stat 0 (the schema allows 0–255; the expected range is 1–255);
    - a species ability id greater than the abilities count;
    - a learnset move that is not in `moves.json`;
    - an evolution with method `unknown`;
    - a species `heldItems` id that is not in `items.json`;
  - a growth rate that decreases breaks the schema, so it gives file status `invalid`, not a warning;
  - the `ignored` list is filled from the layout (moves beyond the count, growth members 6–7, unused item ids).
- [X] T041 [P] [US3] Extend `packages/extractor/test/cli.test.ts`:
  - `--report` without `--rom` on synthetic extracted data, with `io.expected` set, exits 0 and prints "Resultado: OK";
  - with a count mismatch it exits 1 and prints "FALHA";
  - `--report --verify`, `--report --stages x` and `--report --force x` exit 2.
- [X] T042 [P] [US3] Write `packages/extractor/test/data/report-format.test.ts` for `formatSanityReport(report)`. It produces the sections "Arquivos", "Contagens", "Alertas (n)", "Ignorados" and the final line "Resultado: OK" or "Resultado: FALHA (...)", as in contracts/cli-report.md.

### Implementation for User Story 3

- [X] T043 [US3] Implement `packages/extractor/src/data/report.ts` so T040 and T042 pass:
  - `EXPECTED_COUNTS`, exactly from research R15: species 493, forms 12, moves 467, abilities 123, items 513, TMs 92, HMs 8, tutors 52, natures 25, types 18, growth rates 6, learnsets 505;
  - `buildSanityReport`, which loads each file in `GAME_DATA_FILES` from `stages/<stage>/json/<file>` with `parseGameDataJson`, counts records, runs the range checks of research R15 and the cross-references (move, item, ability, type, species), and fills `ignored`;
  - `formatSanityReport`.
- [X] T044 [US3] Add `--report` to `packages/extractor/src/cli.ts` per contracts/cli-report.md. It needs no `--rom`, uses `--out`, adds `io.expected?` for tests, and exits 0, 1 or 2. Update the usage text. Must make T041 pass.

**Checkpoint**: extrações erradas aparecem no relatório.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T045 [P] Write `packages/extractor/test/data/determinism.test.ts` (SC-003). Run all data stages twice into two workspaces from the same synthetic inputs and assert that every `json/*.json` is byte-identical and the manifest output digests are equal.
- [X] T046 [P] Write `packages/extractor/test/data/stages-update.test.ts` (SC-005). After a full run, bump `data-moves` to version 2 in a cloned stage list and run again. Assert that `ran` is exactly `["data-moves"]` and that the other data stages are in `skipped`.
- [X] T047 [P] Export from `packages/extractor/src/index.ts`: `createDataStages`, `SOULSILVER_US_LAYOUT`, `codeDecompressStage`, `buildSanityReport`, `formatSanityReport`, `EXPECTED_COUNTS` and `decompressBlz`. Update `specs/003-rom-extraction-pipeline/contracts/extractor-library-api.md` only if a 003 signature changed (expected: none).
- [X] T048 [P] Add the section "Dados do jogo" to `README.md` (PT-BR), after "Extrator por linha de comando". It covers:
  - the list of generated files and where they live (`stages/data-*/json/`);
  - that values are original and unadjusted;
  - how to run `npm run extract -- --out assets --report`;
  - that the report is local only and not run in CI.

  Link `specs/004-game-data-extraction/data-model.md`.
- [X] T049 Run `npm run check:assets` and `git status` and confirm that no extracted JSON, ROM or binary fixture is tracked.
- [X] T050 Manual, with the real ROM: quickstart §2–§4. Record in the PR: the elapsed time of the new stages (SC-006, ≤ 30 s), the report result (SC-001; explain any warning that remains) and the identical digests after `--force code-decompress` (SC-003).
- [X] T051 Manual: quickstart §5. Fill the 10 Pokémon × 10 moves comparison table against public references in the PR (SC-002), and fix any mismatch by fixing the reader, never by editing data.
- [X] T052 Manual: quickstart §6 (the app updates with only the seven new stages, without asking for the ROM).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup e bloqueia todas as histórias. T004 depende de
  T003; T007 de T005 e T006; T009 de T007 e T008; T011 de T009 e T010; T015 de T012 e T014; T016
  de T015.
- **US1 (Phase 3)**: depende da Foundational. É o MVP.
- **US2 (Phase 4)**: depende da Foundational; usa `readPersonal` (T024) para a compatibilidade
  de TMs e `writeInputs` (T013). Pode rodar em paralelo com US1, exceto `tables.ts`, `stages.ts`
  e `index.ts` do shared, que são compartilhados (sequenciais).
- **US3 (Phase 5)**: depende de US1 e US2 (o relatório lê todos os arquivos).
- **Polish (Phase 6)**: T045 e T046 dependem de US1 e US2; T050–T052, de tudo.

### Dentro de cada história

- Testes antes da implementação, e eles MUST falhar primeiro.
- Schemas (`shared`) → leitores (`readers/`) → etapas (`stages.ts`).
- `packages/extractor/src/data/stages.ts`, `packages/extractor/src/data/readers/tables.ts`,
  `packages/shared/src/game-data/index.ts` e `tables.ts` são editados em mais de uma história:
  não paralelizar tasks que tocam o mesmo arquivo.

### Parallel Opportunities

- Setup: T002.
- Foundational: T003, T005, T006, T008, T010, T012, T013 e T014.
- US1: testes T017–T022 juntos; depois T023–T026 juntos; T027 por último.
- US2: testes T028–T033 juntos; T034–T037 juntos; T038 depois de T026; T039 por último.
- US3: T040–T042 juntos.
- Polish: T045–T048.

---

## Parallel Example: User Story 1

```text
Task: "T017 shared schemas-us1.test.ts"
Task: "T018 extractor personal.test.ts"
Task: "T019 extractor move.test.ts"
Task: "T020 extractor tables.test.ts (US1)"
Task: "T021 extractor stages-us1.test.ts"
Task: "T022 shared load.test.ts"

# depois:
Task: "T023 schemas species/moves/tables"
Task: "T024 readers/personal.ts"
Task: "T025 readers/move.ts"
Task: "T026 readers/tables.ts (US1)"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 + Phase 2.
2. Phase 3 (US1).
3. **Validar**: `npm run extract` com a ROM real gera `species.json`, `moves.json` e as tabelas;
   conferir a amostra parcial de SC-002.

### Incremental Delivery

1. Setup + Foundational → BLZ e infraestrutura de dados testados.
2. US1 → dados de combate (MVP para o Marco 2).
3. US2 → dados de progressão.
4. US3 → relatório para pegar extrações erradas.
5. Polish → determinismo, isolamento e validação com a ROM real.

---

## Notes

- Cada task termina com typecheck, lint e testes verdes.
- Nunca "corrija" um valor editando o JSON gerado: corrija o leitor (princípio I).
- Commits pequenos por task ou grupo lógico, mensagens em inglês.
