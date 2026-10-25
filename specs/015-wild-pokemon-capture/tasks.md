# Tasks: Pokémon selvagens e captura

**Input**: Design documents from `/specs/015-wild-pokemon-capture/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: obrigatórios (princípio V e SC-001, SC-003): cada teste é escrito antes e falha antes da
implementação. Fixtures sintéticos, nunca dados reais da ROM (princípio II). Testes estatísticos usam
`createRng` semeado.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: US1 spawn, US2 temperamentos, US3 captura, US4 compartilhado + Pokédex

---

## Phase 1: Setup

- [X] T001 Criar `content/wild/spawn.json`, `temperaments.json` e `balls.json` com os valores de [contracts/wild-data.md](contracts/wild-data.md) (`defaultCap: 6`, `spawnIntervalSeconds: 4`, `viewMarginTiles: 2`, `maxTries: 16`, `despawnRadiusTiles: 24`, `despawnSeconds: 30`, `leashTiles: 10`, `shinyOdds: 8192`, `timeBands {morning: 4, day: 10, night: 20}`, `turnSeconds: 5`, `angryOnEscapeChance: 0.5`, `storageMax: 30`, `throwRangeTiles: 6`; `default: "passive"`; todas as bolas do bolso `balls`, ids conferidos em `items` extraído)
- [X] T002 [P] Registrar temperamentos, limites, despawn, leash, `turnSeconds` para Quick/Timer Ball e as bolas ×1 provisórias (Love, Lure, Dive) em `docs/balance-log.md`
- [X] T003 [P] Criar `packages/shared/src/wild/index.ts` e exportá-lo em `packages/shared/src/index.ts`

---

## Phase 2: Foundational (bloqueia todas as histórias)

- [X] T004 [P] Teste dos schemas (valores válidos; temperamento desconhecido rejeitado; `when` desconhecido rejeitado; `types` obrigatório quando `when: "types"`; espécie fora de 1–493 rejeitada) em `packages/shared/test/wild/schemas.test.ts`
- [X] T005 Implementar schemas zod `SpawnRules`, `Temperaments`, `Balls` em `packages/shared/src/wild/schemas.ts` (temperamentos `passive | skittish | aggressive | territorial`; `when` `night-or-cave | first-turn | timer | types | nest | repeat | level | fast | moon | heavy`)
- [X] T006 Loader dos três arquivos com erro por arquivo e campo em `packages/server/src/wild-loader.ts`, seguindo `packages/server/src/companion-loader.ts`
- [X] T007 [P] Teste da migração 2 → 3 (`bag: []`, `pokedex.seen`/`caught` com as espécies da `party`, `storage: []`, `shiny: false` em cada membro) e da coerência (`caught ⊆ seen`; espécies de `party` e `storage` em `caught`; item sem duplicata; `count` 1–999) em `packages/shared/test/save/migrate.test.ts` e `packages/shared/test/save/coherence.test.ts`
- [X] T008 Save v3 em `packages/shared/src/save/schema.ts`, `migrate.ts` e `coherence.ts`: `SAVE_SCHEMA_VERSION = 3`; `bag: {item, count 1–999}[]`; `pokedex: {seen: int[], caught: int[]}` espécies 1–493 únicas; `storage: PartyMember[] ≤ 30`; `PartyMember.shiny: boolean`; `newProgress()` com os campos vazios
- [X] T009 [P] Teste do protocolo v7 (bit `throw` = 8; `select-ball`; `capture` com `shakes` 0–3; `captured`, `bag`, `pokedex`, `pokedex-add`, `notice` com códigos `no-balls | storage-full | ball-returned`) em `packages/shared/test/game/protocol.test.ts`
- [X] T010 Protocolo v7 em `packages/shared/src/game/protocol.ts` e `PROTOCOL_VERSION = 7` em `packages/shared/src/protocol-version.ts`, conforme [contracts/game-protocol-v7.md](contracts/game-protocol-v7.md)
- [X] T011 Carregar as regras de `content/wild` na sessão e enviar `bag` e `pokedex` no join em `packages/server/src/session.ts`; flag de dev dá 20 Poké Balls em `packages/app/src/server-host/entry.ts`

---

## Phase 3: User Story 1 - Selvagens fiéis às tabelas (P1) 🎯 MVP

**Goal**: selvagens aparecem na grama e nas cavernas pela tabela do mapa e horário.

**Independent Test**: 1.000 spawns simulados da Route 29 por horário batem com a tabela (qui-quadrado p ≥ 0,01).

- [X] T012 [P] [US1] Teste de `timeOfDay(hour, bands)` (3h59 noite, 4h manhã, 10h dia, 20h noite) em `packages/shared/test/wild/time-of-day.test.ts`
- [X] T013 [P] [US1] Teste de `rollSlot`/`rollLevel` com fixture sintético da Route 29 (ids e taxas): qui-quadrado p ≥ 0,01 em 1.000 rolagens por horário; noite sem espécie só do dia e vice-versa; nível em `[minLevel, maxLevel]`; shiny ≈ 1/8192 em 10⁶ rolagens em `packages/shared/test/wild/spawn.test.ts`
- [X] T014 [P] [US1] Teste de `pickCell` (só `tallGrass`, ou `free` em `areaType: "cave"`; nunca dentro da visão + `viewMarginTiles` de qualquer jogador em 1.000 sorteios; `null` após `maxTries`; zona vazia → `null`) em `packages/shared/test/wild/spawn.test.ts`
- [X] T015 [P] [US1] Teste de `wildMoves(learnset, level)` (últimos 4 distintos com nível ≤ atual; menos de 4 quando o learnset é curto) em `packages/shared/test/wild/moves.test.ts`
- [X] T016 [US1] Implementar `packages/shared/src/wild/time-of-day.ts`
- [X] T017 [US1] Implementar `rollSlot`, `rollLevel`, `rollShiny`, `zoneCells`, `pickCell` em `packages/shared/src/wild/spawn.ts`
- [X] T018 [US1] Implementar `wildMoves` em `packages/shared/src/wild/moves.ts`
- [X] T019 [US1] Teste do spawner no servidor (respeita `cap`; nada sem encounter ou sem zona; despawn após `despawnSeconds` sem jogador a `despawnRadiusTiles`; não some em combate ou captura; mudança de horário só afeta novos) em `packages/server/test/wild.test.ts`
- [X] T020 [US1] Implementar `SpawnArea` e o spawner no tick em `packages/server/src/wild.ts`: entidade `pokemon` com `data: {role: "wild", species, level, shiny}` e `combat.spawn(world, id, spec, "wild")`; hora pelo relógio local do host
- [X] T021 [US1] Integrar o spawner ao tick e remover selvagens desmaiados em `packages/server/src/session.ts`
- [X] T022 [US1] Renderizar selvagens com paleta shiny e brilho ao aparecer em `packages/client/src/render/game-renderer.ts` e `packages/client/src/render/combat-fx.ts`

**Checkpoint**: selvagens corretos andam na Route 29 e somem ao se afastar.

---

## Phase 4: User Story 3 - Captura com Poké Ball arremessada (P1)

**Goal**: mirar, arremessar e capturar com a fórmula da Gen 4.

**Independent Test**: arremessos em selvagens com HP e status variados; chance, balançadas e destino conferidos.

- [X] T023 [P] [US3] Teste de `catchValue` e `rollShakes` contra tabela de referência Gen 4 (HP cheio, metade e 1; cada status ×1/×1,5/×2; `a ≥ 255` captura direta; Master Ball sempre) em `packages/shared/test/wild/capture.test.ts`
- [X] T024 [P] [US3] Teste de `ballMultiplier` para cada `when` (Dusk à noite/caverna e não de dia; Quick só no 1º turno; Timer por turnos com teto 4; Net por tipo; Nest por nível; Repeat se capturado; Level, Fast, Moon, Heavy pelas regras de HGSS) em `packages/shared/test/wild/capture.test.ts`
- [X] T025 [US3] Implementar `catchValue`, `rollShakes`, `ballMultiplier` em `packages/shared/src/wild/capture.ts`
- [X] T026 [US3] Teste da captura no servidor (bola sai do Pokémon controlado ou do treinador; erro gasta a bola; sem bola → `notice no-balls`; primeiro acerto trava `capturing` e o segundo recebe `ball-returned`; empate no tick → menor id de conexão; falha → `angry` com `angryOnEscapeChance`; sucesso → equipe ou `storage`; `storage` cheio bloqueia antes; desmaiado não capturável; jogador sai durante as balançadas → selvagem volta) em `packages/server/test/capture.test.ts`
- [X] T027 [US3] Implementar arremesso como projétil do combate, `CaptureAttempt`, consumo da bolsa e destino em `packages/server/src/capture.ts`; integrar em `packages/server/src/session.ts` e `packages/server/src/combat.ts`
- [X] T028 [US3] Ação `throw` e troca de bola remapeáveis em `packages/client/src/input/input.ts` e `packages/client/test/input/input.test.ts`; envio de `select-ball` em `packages/client/src/net/game-connection.ts`
- [X] T029 [US3] Animação da bola, 0–3 balançadas e resultado; avisos de `notice` em `packages/client/src/render/game-renderer.ts` e `packages/client/src/GameSession.svelte`

**Checkpoint**: MVP jogável — encontrar e capturar na Route 29.

---

## Phase 5: User Story 2 - Selvagens com temperamento (P2)

**Goal**: passivo, arisco, agressivo e territorial com retorno à origem.

**Independent Test**: um selvagem de cada temperamento perto do jogador reage como descrito.

- [X] T030 [P] [US2] Teste da máquina de estados (`wander → flee` passivo ao sofrer dano e arisco em `sightTiles`; `wander → chase` agressivo em `detectTiles` e territorial em `territoryTiles` da origem; `* → return` além de `leashTiles`; espécie sem entrada usa `default`; `angry` força `chase`) em `packages/shared/test/wild/temperament.test.ts`
- [X] T031 [US2] Implementar `stepAi(state, ctx)` puro em `packages/shared/src/wild/temperament.ts`
- [X] T032 [US2] Aplicar `stepAi` no tick, mover com colisão do mapa e atacar com golpes do `wildMoves` via combate (alvo pela regra `chaseLimitTiles` do spec 14) em `packages/server/src/wild.ts`; teste em `packages/server/test/wild.test.ts`

---

## Phase 6: User Story 4 - Selvagens compartilhados e Pokédex (P2)

**Goal**: todos veem os mesmos selvagens; cada um tem sua Pokédex.

**Independent Test**: dois clientes no mesmo mapa comparam espécie, shiny e posição.

- [X] T033 [P] [US4] Teste de `markSeen`/`markCaught` (sem duplicata; capturar marca visto) em `packages/shared/test/wild/pokedex.test.ts`
- [X] T034 [US4] Implementar `packages/shared/src/wild/pokedex.ts`
- [X] T035 [US4] Marcar "visto" quando o selvagem entra na relevância do jogador e "capturado" na captura, enviando `pokedex-add` e gravando no save, em `packages/server/src/relevance.ts` e `packages/server/src/session.ts`
- [X] T036 [US4] Teste com dois jogadores no harness (mesma espécie, nível, shiny e posição; selvagem capturado some para ambos) em `packages/server/test/wild.test.ts` usando `packages/server/test/harness.ts`

---

## Phase 7: Polish

- [X] T037 [P] Atualizar o driver da skill para arremessar e mudar o horário em `.claude/skills/run-soulsilver/driver.mjs`
- [X] T038 Rodar `pnpm -r test` e o [quickstart.md](quickstart.md) completo no app

---

## Dependencies

- Setup → Foundational → US1 → US3 (precisa de selvagens) → US2 e US4 (em paralelo) → Polish.
- Dentro de cada história: testes → shared → server → client.

## Parallel Examples

- Foundational: T004, T007, T009 juntos.
- US1: T012, T013, T014, T015 juntos.
- US3: T023 e T024 juntos.
- Depois de US3: Phase 5 e Phase 6 em paralelo.

## Implementation Strategy

MVP = Phases 1–4 (spawn fiel + captura). Depois temperamentos e Pokédex, cada um entregável sozinho.
