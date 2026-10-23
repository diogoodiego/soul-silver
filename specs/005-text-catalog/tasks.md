---

description: "Lista de tasks da feature 005-text-catalog"
---

# Tasks: Textos e i18n

**Input**: Design documents from `/specs/005-text-catalog/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: incluídos. O princípio V exige test-first para o extrator. Toda task de teste MUST
ser escrita e falhar antes da task de implementação correspondente. Não há UI nova.

**Organization**: tasks agrupadas por história de usuário (US1 a US3 do spec).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: US1 a US3 do spec
- Caminhos relativos à raiz do repositório

## Regras gerais para quem executa

- Código, identificadores, nomes de variável da marcação e commits em inglês. Mensagens de
  erro para o desenvolvedor e textos da interface de busca em PT-BR.
- `packages/shared/src/text/` MUST NOT importar módulos do Node nem `electron` (o servidor e o
  renderer vão importá-lo). Imports relativos com extensão `.ts`; só sintaxe apagável.
- `packages/extractor/src/text/` pode usar `node:*`. A CLI roda com `node` direto.
- Testes usam só bancos sintéticos cifrados pelo builder de teste
  (`packages/extractor/test/fixtures/text/build-bank.ts`), que é **independente** do código de
  produção: ele reimplementa a cifra a partir de [research R1–R2](./research.md). Nunca leia a ROM
  real nem `assets/` nos testes (princípio II).
- Tabela de caracteres, códigos e nomes de variável: copie exatamente de
  [research.md R4–R5](./research.md) e [contracts/markup.md](./contracts/markup.md).
- Antes de concluir qualquer task: `npm run typecheck`, `npm run lint` e `npm test` passando.
- No Git Bash, prefira o Write/Edit para arquivos com `\` ou chaves; heredocs com `'EOF'` podem
  colapsar barras e `{}`.

---

## Phase 1: Setup

- [X] T001 In `packages/shared/package.json`, add the export `"./text": "./src/text/index.ts"`.
- [X] T002 [P] Create the folders and placeholder index files:
  `packages/shared/src/text/index.ts` (empty re-exports, filled by later tasks),
  `packages/shared/test/text/`, `packages/extractor/src/text/`,
  `packages/extractor/test/text/`, `packages/extractor/test/fixtures/text/`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: identificadores, tabela de variáveis, marcação, cifra, compressão, tabela de
caracteres e o builder sintético. Sem isso nenhuma história funciona.

**⚠️ CRITICAL**: nenhuma história começa antes desta fase.

### Identificadores e variáveis (shared)

- [X] T003 [P] Write `packages/shared/test/text/ids.test.ts` (test-first) for
  `parseTextId` / `formatTextId` in `packages/shared/src/text/ids.ts`:
  - `"0237:25"` → `{ bank: 237, index: 25 }`; `"species-names:25"` → same;
  - `formatTextId(237, 25)` → `"0237:25"`, always 4-digit bank;
  - bank ≥ 10000, index negative or non-integer, unknown bank name, missing `:` → error naming the id.
- [X] T004 Implement `packages/shared/src/text/ids.ts`: `TEXT_BANK_NAMES` (research R7 table:
  0237 species-names, 0750 move-names, 0222 item-names, 0720 ability-names, 0735 type-names,
  0034 nature-names, 0221 item-descriptions, 0749 move-descriptions, 0722 ability-descriptions,
  0729 trainer-names, 0279 map-names), `TEXT_REF_BANKS` (feature 004 catalogs → bank: species-names
  237, move-names 750, item-names 222, ability-names 720, type-names 735, nature-names 34), and the
  two functions. Must make T003 pass.
- [X] T005 [P] Write `packages/shared/test/text/variables.test.ts` (test-first): `variableByName`
  and `variableByCommand` return the entries of research R5 / contracts/markup.md: `0x0100`
  `pokemon-species`, `0x0101` `pokemon-name`, `0x0103` `trainer-name`, `0x0105` `ability`,
  `0x0106` `move`, `0x0108` `item`, `0x010B` `box`, `0x010D` `stat`, `0x010F` `type`, `0x0111`
  `status`, `0x0112` `pocket`, `0x011C` `phrase`, `0x0132`–`0x013B` `number1`–`number10` with
  value `"number"`; unknown command in range → `undefined`; `varXXXX` names resolve to their command.
- [X] T006 Implement `packages/shared/src/text/variables.ts` with `TEXT_VARIABLES`,
  `variableByName`, `variableByCommand`. Must make T005 pass.

### Marcação (shared)

- [X] T007 [P] Write `packages/shared/test/text/markup.test.ts` (test-first) for `parseMarkup` and
  `serializeMarkup` (contracts/markup.md):
  - each command parses to its token: `{n}`, `{page}`, `{scroll}`, `{pad}`, `{color:2}`,
    `{trainer-name:0}`, `{number3:1,2}`, `{cmd:FF02:1,0}`, `{raw:01A3}`, `{cmd:0105}`;
  - escapes `\{`, `\}`, `\\` become text and back;
  - round trip: `serializeMarkup(parseMarkup(s)) === s` for canonical `s`; and
    `parseMarkup(serializeMarkup(t))` deep-equals `t`;
  - errors with `position` and a PT-BR `problem`: unclosed `{`, unknown name `{foo:0}`,
    non-canonical `{color: 02}`, `{cmd:FF00:1}` (must be `{color:1}`), 3-digit hex `{raw:1A3}`,
    a raw newline in text, a stray `}`, a backslash before an unknown char.
- [X] T008 Implement `packages/shared/src/text/markup.ts` (`parseMarkup`, `serializeMarkup`,
  `MarkupError`) following the grammar of contracts/markup.md. Must make T007 pass.

### Formatação (shared)

- [X] T009 [P] Write `packages/shared/test/text/format.test.ts` (test-first) for `formatText`,
  `textVariables` and `screenText` (data-model.md, contracts/text-api.md):
  - `formatText("{trainer-name:0}’s Photo", {"trainer-name:0": "Red"})` → `"Red’s Photo"`;
  - a missing variable throws `TextFormatError` with `variable` = `"trainer-name:0"` and the `id`
    when given; an extra value throws too;
  - a repeated variable takes the same value everywhere;
  - `number*` accepts numbers and numeric strings;
  - `{n}`, `{page}`, `{scroll}`, `{color:1}`, `{cmd:FF02:1,0}`, `{raw:01A3}` pass through unchanged;
  - an inserted value containing `{` is escaped so it is not read as a command;
  - `textVariables` lists `nome:slot` keys once, in order;
  - `screenText` turns `{n}`, `{page}`, `{scroll}` into a space, drops `{color}`/`{cmd}`, keeps
    variables literal.
- [X] T010 Implement `packages/shared/src/text/format.ts` (`formatText`, `textVariables`,
  `screenText`, `TextFormatError`). Must make T009 pass.

### Schemas e catálogo (shared)

- [X] T011 [P] Write `packages/shared/test/text/schemas.test.ts` (test-first) for `textBankFile`,
  `textIndexFile`, `textReportFile`, `parseTextJson`, `serializeTextFile` (data-model.md):
  - a valid `text-bank` parses; `records` out of order or duplicated → path `records.N.id`;
  - `text` with invalid markup → path `records.N.text`, problem contains the position;
  - `language` must match `^[a-z]{2,3}(-[A-Za-z0-9]+)*$`; `bank` 0–9999; unknown extra field → its path;
  - `kind` other than `text-bank` → path `kind`; `formatVersion` ≠ 1 → path `formatVersion`;
  - `serializeTextFile` is deterministic and refuses invalid data with the file name.
- [X] T012 Implement `packages/shared/src/text/schemas.ts` on top of
  `createGameDataCodec` / `fileSchema` from `packages/shared/src/game-data/` (reuse, do not copy),
  with `text-bank`, `text-index`, `text-report` (data-model.md), `parseTextFile`, `parseTextJson`,
  `serializeTextFile`. The `text` field validates with `parseMarkup`. Must make T011 pass.
- [X] T013 [P] Write `packages/shared/test/text/catalog.test.ts` (test-first) for
  `createTextCatalog`, `validateTranslation` and `UnknownTextError`:
  - `get(id, "en")` returns the English text with `fallback: false`;
  - a language with only some ids returns its own text for those and English (`fallback: true`) for the rest;
  - an unknown language falls back to English, `fallback: true`;
  - an id that exists in no language throws `UnknownTextError` with the id;
  - a translation that drops or renames a variable makes `createTextCatalog` throw, naming the id,
    the variable and the problem (SC-007); a translation with the same variables passes;
  - `validateTranslation` reports variables missing, extra, and with a different flag;
  - `has` and `ids` agree with the data.
- [X] T014 Implement `packages/shared/src/text/catalog.ts` (`createTextCatalog`,
  `validateTranslation`, `UnknownTextError`). Must make T013 pass.
- [X] T015 Create `packages/shared/src/text/index.ts` re-exporting everything from `ids`,
  `variables`, `markup`, `format`, `schemas` and `catalog`, matching contracts/text-api.md. Run
  `npm run typecheck` and `npm test` for `shared`.

### Builder sintético e cifra (extractor)

- [X] T016 [P] Write `packages/extractor/test/fixtures/text/build-bank.ts`: `buildBank(entries,
  { seed, compressed? })` returns the bytes of a message bank. It must be **independent of the
  production code**: write the cipher and the 9-bit/15-bit packing again from research R1–R2.
  Entries are arrays of 16-bit words (text words, `0xE000`, `0x25BC`, `0x25BD`, `0xFFFE`
  commands); `compressed: true` packs the text as research R2 says (`0xF100` marker, 9-bit
  codes, `0x1FF` end, padding of 1 bits, truncation to `ceil(9·n/15)` words). Every entry ends in
  `0xFFFF`. Also export `randomBank(seed)` (deterministic PRNG) for the property tests.
- [X] T017 [P] Write `packages/extractor/test/text/bank.test.ts` (test-first) for `decodeBank`
  and `encodeBank` in `packages/extractor/src/text/bank.ts`:
  - decodes a 3-entry bank built by `buildBank` with two seeds, including seed 0 and 0xFFFF;
  - the offset table is XOR-ed with the per-entry key (test with a seed that makes the key nonzero);
  - a compressed entry decodes to its characters, including one whose last character ends exactly
    on a word boundary and one that needs the padding;
  - empty text (only `0xFFFF`) gives `[]`;
  - a bank with count 0 decodes to no entries;
  - corrupt input throws `BankFormatError` naming the bank number and the problem: truncated
    table, entry past the end of the file, no `0xFFFF` terminator, compressed entry without the
    `0x1FF` end when the data runs out;
  - `encodeBank(decodeBank(b))` equals `b` for each bank.
- [X] T018 Implement `packages/extractor/src/text/bank.ts` (`decodeBank`, `encodeBank`,
  `BankFormatError`, `Bank`, `BankEntry`) per research R1–R2. Must make T017 pass.

### Tabela de caracteres e palavras (extractor)

- [X] T019 [P] Write `packages/extractor/test/text/charmap.test.ts` (test-first) for
  `packages/extractor/src/text/charmap.ts`: `CHARMAP` covers exactly the codes of research R4
  (digits `0x121`–`0x12A`, `A`–`Z` `0x12B`–`0x144`, `a`–`z` `0x145`–`0x15E`, space `0x1DE`, and the
  symbol/accent table, one test per row). `codeToChar(code)` returns the char or `undefined`;
  `charToCode` is its inverse for every entry (no two codes map to the same char).
- [X] T020 Implement `packages/extractor/src/text/charmap.ts` with the full table from research R4.
  Must make T019 pass.
- [X] T021 [P] Write `packages/extractor/test/text/words.test.ts` (test-first) for
  `wordsToMarkup` and `markupToWords` in `packages/extractor/src/text/words.ts`:
  - `0xE000` → `{n}`, `0x25BC` → `{page}`, `0x25BD` → `{scroll}`, `0x1E2` → `{pad}`;
  - a `0xFFFE` command with its params → `{name:slot}` when the command is in `TEXT_VARIABLES`
    (flag from the second param, omitted when 0), `{color:N}` for `0xFF00`, `{cmd:XXXX:p}` otherwise;
  - an unknown character code → `{raw:XXXX}` and the list `unknown` gets the entry;
  - text escapes: `{`, `}`, `\` in a character are escaped on the way out;
  - `markupToWords(wordsToMarkup(w)) === w` for every shape above (property test on random words).
- [X] T022 Implement `packages/extractor/src/text/words.ts` (`wordsToMarkup`, `markupToWords`),
  using `charmap.ts` and `TEXT_VARIABLES` from `@soulsilver/shared/text`. Must make T021 pass.

### Schema e leitura de catálogo (extractor, base)

- [X] T023 Create `packages/extractor/src/text/catalog-files.ts` with `loadTextCatalog(dir)` that
  reads `en/NNNN.json` files and validates each with `parseTextJson` (from T012); test it in
  `packages/extractor/test/text/catalog-files.test.ts` (test-first): loads a folder built by the
  stage in US1, reports the file and path on invalid JSON, ignores files that do not match
  `NNNN.json`.

**Checkpoint**: identificadores, marcação, formatação, catálogo com fallback, cifra e tabela de
caracteres prontos e testados.

---

## Phase 3: User Story 1 - Buscar um texto por identificador e preencher as variáveis (Priority: P1) 🎯 MVP

**Goal**: a etapa `text-catalog` gera o catálogo de inglês, com ida e volta conferida, e o
desenvolvedor busca um texto e preenche as variáveis.

**Independent Test**: com bancos sintéticos, rodar a etapa e buscar textos por identificador e
por nome legível; com a ROM real, conferir a amostra de New Bark Town (SC-002, quickstart §5).

### Tests for User Story 1 ⚠️ (escrever primeiro, devem falhar)

- [X] T024 [P] [US1] Write `packages/extractor/test/text/roundtrip.test.ts` (test-first, SC-003):
  for 200 random banks from `randomBank`, `encodeBank(decodeBank(b)) === b` and the markup round
  trip holds for every entry. Also a bank with a single text and a bank whose compressed text
  ends exactly at a word boundary.
- [X] T025 [P] [US1] Write `packages/extractor/test/text/stage.test.ts` (test-first) for
  `textCatalogStage` in `packages/extractor/src/text/stage.ts`, run through `runPipeline` with a
  synthetic `rom-unpack` input (a `narc/a/0/2/7` folder with `buildBank` files):
  - metadata matches contracts/stage-and-cli.md (id `text-catalog`, title "Convertendo os
    textos", version 1, weight 3, input `rom-unpack/narc`, output `catalog`, 40 MiB);
  - writes `catalog/en/NNNN.json` for every bank, `index.json` and `report.json`, all validated;
  - a bank with an unknown command and an unknown character completes the stage, and both appear in
    `report.json` with bank and count (nothing dropped);
  - a corrupt bank fails the stage naming the bank number;
  - a bank whose round trip differs fails the stage (simulate by a test-only hook that corrupts
    `encodeBank` output);
  - named banks get their `name` from `TEXT_BANK_NAMES`; unnamed ones get `null`;
  - progress fraction goes 0→1.
- [X] T026 [P] [US1] Write `packages/extractor/test/text/stage-update.test.ts` (test-first,
  SC-005 and FR-018): running the stage twice on the same input gives byte-identical files;
  bumping the stage `version` re-runs only `text-catalog` (its dependencies are only
  `rom-unpack`).
- [X] T027 [P] [US1] Write `packages/extractor/test/text/find.test.ts` (test-first) for
  `findTexts(banks, query, { limit })` in `packages/extractor/src/text/find.ts` (research R13):
  case-insensitive and accent-insensitive (`"pokemon"` finds `"Pokémon"`); `{n}`, `{page}`,
  `{scroll}` act as a space so a phrase crossing a break is found; variables stay literal
  (`"{trainer-name:0}"` is searchable as text); results ordered by bank then index; `limit`
  respected; no hit → empty array.
- [X] T028 [P] [US1] Write `packages/shared/test/text/lookup.test.ts` (test-first) for the
  feature-004 reference resolution: `resolveNameRef(catalog, { catalog, index })` returns the text
  of `TEXT_REF_BANKS[catalog]` entry `index`; an unknown catalog or missing index throws naming the
  reference. Put `resolveNameRef` in `packages/shared/src/text/catalog.ts`.

### Implementation for User Story 1

- [X] T029 [US1] Implement `packages/extractor/src/text/stage.ts` (`textCatalogStage`):
  - reads `narc/a/0/2/7` members in index order from the `rom-unpack` `narc` output (use the
    layout's `messages` path and `readNarcMember`-style helpers from `packages/extractor/src/data/inputs.ts`);
  - for each bank: `decodeBank`, convert entries with `wordsToMarkup`, build the `text-bank`
    file, validate with `serializeTextFile` (it throws on invalid), then run the round-trip check
    (`markupToWords` → `encodeBank` must equal the input bytes) and fail the stage on mismatch;
  - writes `catalog/en/NNNN.json`, `catalog/index.json` (`text-index`) and `catalog/report.json`
    (`text-report`, counts and unknown codes per bank);
  - `version 1`, `weight 3`, `estimateBytes: () => 40 * MIB`, `outputs: ["catalog"]`.
  Must make T025 pass.
- [X] T030 [US1] Register `textCatalogStage` in `packages/extractor/src/stages/index.ts` after the
  data stages, so `defaultStages` is `[romUnpack, codeDecompress, ...data, textCatalogStage]`. Re-run
  `packages/extractor/test/cli.test.ts` and `packages/extractor/test/data/stages-update.test.ts`;
  fix any test that assumed the old list (keep the 003 tests on an explicit registry).
- [X] T031 [US1] Implement `packages/extractor/src/text/find.ts` (`findTexts`) and the
  normalisation helper `screenText`-style key used for matching. Must make T027 pass.
- [X] T032 [US1] Implement `resolveNameRef` in `packages/shared/src/text/catalog.ts` and export it
  from `packages/shared/src/text/index.ts`. Must make T028 pass.
- [X] T033 [US1] Export from `packages/extractor/src/index.ts`: `textCatalogStage`, `decodeBank`,
  `encodeBank`, `wordsToMarkup`, `markupToWords`, `loadTextCatalog`, `findTexts`.
- [X] T034 [US1] Run `npm run extract -- --rom "<sua ROM>" --out assets` and then check the
  output folder `assets/stages/text-catalog/catalog/`: 829 files in `en/`, `index.json`,
  `report.json`. Record the stage time in the PR (SC-009). If any bank fails the round trip, stop
  and report the bank number: do not change the decoder to hide it.
- [ ] T035 [US1] Manual check: quickstart §5 (New Bark Town, word by word against the original
  game). Record the table in the PR. Any mismatch is a reader bug, never a catalog edit.

**Checkpoint**: MVP. O catálogo de inglês existe, a ida e volta fecha, e um desenvolvedor busca
e preenche textos.

---

## Phase 4: User Story 2 - Catálogo por idioma, editável e com fallback (Priority: P2)

**Goal**: o tradutor edita arquivos de texto por idioma, e uma tradução que muda variáveis é
recusada antes do jogo.

**Independent Test**: criar um catálogo paralelo sintético com poucas chaves, buscar com fallback
e tentar uma tradução que quebra uma variável.

### Tests for User Story 2 ⚠️

- [X] T036 [P] [US2] Write `packages/shared/test/text/parallel-catalog.test.ts` (test-first): a
  `pt-BR` source with 3 of 1000 keys: `get` returns the translated text for the 3, English for the
  rest (`fallback: true`); `languages()` lists `en` and `pt-BR`; a translation that adds a
  variable not in English is refused by `createTextCatalog` (SC-007, FR-013).
- [X] T037 [P] [US2] Write `packages/extractor/test/text/catalog-files-i18n.test.ts`
  (test-first): `loadTextCatalog` on `catalog/pt-BR/` with a subset of banks loads only those; a
  `pt-BR` file whose `language` is `en` is refused with path `language`; a `pt-BR` file with a
  record id that does not exist in English is refused (translation cannot add texts); the
  translated bank is validated against English (variables) using `validateTranslation`.

### Implementation for User Story 2

- [X] T038 [US2] Extend `packages/extractor/src/text/catalog-files.ts` with
  `loadTranslatedCatalog(dir, language, english)` that loads `catalog/<language>/NNNN.json` for the
  banks present, rejects unknown ids and language mismatches, and calls `validateTranslation`.
  Must make T037 pass.
- [X] T039 [US2] Ensure `createTextCatalog` in `packages/shared/src/text/catalog.ts` uses the same
  `validateTranslation` for every non-fallback language. Must make T036 pass.
- [ ] T040 [US2] Document the tradutor's workflow in `README.md` (section "Textos", written in US3
  T048): copy `en/0034.json` to `pt-BR/`, change `language`, keep only the translated records,
  never change `{…}` markup. Add a PT-BR example file under
  `specs/005-text-catalog/examples/pt-BR-0034.json` (3 records, invented text, no ROM content).

**Checkpoint**: estrutura de tradução pronta; o tradutor não toca em código.

---

## Phase 5: User Story 3 - Achar o identificador de um trecho (Priority: P3)

**Goal**: `npm run extract -- --out assets --find "trecho"` mostra identificador e texto.

**Independent Test**: buscar trechos conhecidos num catálogo sintético, com e sem acentos.

### Tests for User Story 3 ⚠️

- [X] T041 [P] [US3] Write `packages/extractor/test/text/cli-find.test.ts` (test-first) for the
  CLI `--find`, `--lang`, `--limit` (contracts/stage-and-cli.md): prints the count line and one
  line per result with `id`, bank name when named, and the markup text cut at 160 chars; no
  match prints `nenhum texto contém "…"` and exits 0; missing catalog exits 1; `--find` with
  `--rom`, `--stages`, `--force`, `--verify` or `--report` exits 2; `--limit 0` and `--limit 1001`
  exit 2; `--lang pt-BR` falls back to English for missing keys and marks them.
- [X] T042 [P] [US3] Write `packages/extractor/test/text/report.test.ts` (test-first) for the
  "Textos" section of `--report`: correct data → all rows `ok`; a missing `report.json` → failure;
  a count different from `EXPECTED_TEXT_COUNTS` (829 banks, 49984 texts) → failure; a round-trip
  mismatch recorded in the report → failure; unknown codes and commands → alerts only (top 10 by
  count); a name reference from feature 004 with no text → failure (SC-004).

### Implementation for User Story 3

- [X] T043 [US3] Implement the `--find`, `--lang` and `--limit` options in
  `packages/extractor/src/cli.ts` per contracts/stage-and-cli.md, with the exit codes stated there.
  Must make T041 pass.
- [X] T044 [US3] Implement `packages/extractor/src/text/report.ts`: `EXPECTED_TEXT_COUNTS`, the
  "Textos" section builder, and the feature-004 reference check (uses `TEXT_REF_BANKS` and the
  004 data files). Wire it into `packages/extractor/src/data/report.ts` / the `--report` path of
  `cli.ts` so the section appears after the data section. Must make T042 pass.
- [X] T045 [US3] Update `packages/extractor/src/index.ts` exports for `findTexts` and
  `EXPECTED_TEXT_COUNTS` if not already exported.
- [ ] T046 [US3] Manual check: quickstart §4. Run the three `--find` commands and time them
  (SC-008, under 2 s).

**Checkpoint**: depuração de eventos possível pela linha de comando.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T047 [P] Write `packages/extractor/test/text/determinism.test.ts` (SC-005): two runs of
  `textCatalogStage` on the same synthetic bank folder produce identical `catalog/**` bytes.
- [X] T048 [P] Add the section "Textos" to `README.md` (PT-BR): what the catalog is, the markup
  table (contracts/markup.md link), `--find` and `--report`, and the tradutor workflow from T040.
- [X] T049 [P] Run `npm run check:assets` and `git status`; confirm no `.json` from the real ROM and
  no `.nds` are tracked, and no text fixture is a real bank.
- [X] T050 Run `npm run typecheck`, `npm run lint` and `npm test` for the whole repo; all green.
- [ ] T051 Manual: quickstart §6 (a `pt-BR` subset and a refused translation).
- [ ] T052 Manual: quickstart §7 (the app updates with only `text-catalog`, without asking the ROM).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup e bloqueia todas as histórias. T004 depende de
  T003; T006 de T005; T008 de T007; T010 de T009; T012 de T011 (e de `game-data/` da 004); T014
  de T013; T015 de T004, T006, T008, T010, T012, T014; T018 de T016 e T017; T020 de T019; T022 de
  T020, T021 e T006; T023 de T012 e T018.
- **US1 (Phase 3)**: depende da Foundational. É o MVP.
- **US2 (Phase 4)**: depende de US1 (lê `en/`) e da Foundational (`validateTranslation`).
- **US3 (Phase 5)**: depende de US1 (lê o catálogo) e de T015.
- **Polish (Phase 6)**: depende das histórias desejadas; T050–T052 por último.

### Dentro de cada história

- Testes antes da implementação, e eles MUST falhar primeiro.
- `shared` (schemas, catálogo) → `extractor` (leitores, etapa) → CLI.
- `packages/extractor/src/stages/index.ts`, `packages/extractor/src/cli.ts`,
  `packages/extractor/src/index.ts`, `packages/shared/src/text/catalog.ts` e `README.md` são editados
  em mais de uma história: não paralelizar tasks que tocam o mesmo arquivo.

### Parallel Opportunities

- Setup: T002.
- Foundational: T003, T005, T007, T009, T011, T013, T016, T017, T019, T021 (testes em arquivos
  diferentes).
- US1: testes T024–T028 juntos; depois T029, T031, T032 (arquivos diferentes); T030 e T033 por último.
- US2: testes T036–T037 juntos; T038 e T039 em arquivos diferentes.
- US3: testes T041–T042 juntos; T043 e T044 em arquivos diferentes.
- Polish: T047–T049.

---

## Parallel Example: User Story 1

```text
Task: "T024 roundtrip.test.ts"
Task: "T025 stage.test.ts"
Task: "T026 stage-update.test.ts"
Task: "T027 find.test.ts"
Task: "T028 lookup.test.ts"

# depois:
Task: "T029 src/text/stage.ts"
Task: "T031 src/text/find.ts"
Task: "T032 resolveNameRef in shared"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 + Phase 2.
2. Phase 3 (US1).
3. **Validar**: `npm run extract` com a ROM real gera os 829 arquivos em `catalog/en/`, a ida e
   volta fecha, e a amostra de New Bark Town (T035) bate palavra por palavra.

### Incremental Delivery

1. Setup + Foundational → marcação, cifra e formatação testadas.
2. US1 → catálogo de inglês e busca por identificador (MVP).
3. US2 → catálogo paralelo e recusa de traduções que quebram variáveis.
4. US3 → `--find` e seção "Textos" no relatório.
5. Polish → determinismo, documentação e validação com a ROM real.

---

## Notes

- Cada task termina com typecheck, lint e testes verdes.
- Se uma ida e volta falhar com a ROM real, pare e investigue o leitor. Nunca "conserte" o
  catálogo nem silencie a checagem (princípio I).
- Commits pequenos por task ou grupo lógico, mensagens em inglês.
