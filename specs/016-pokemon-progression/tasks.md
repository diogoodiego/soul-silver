# Tasks: Progressão dos Pokémon

**Input**: Design documents from `/specs/016-pokemon-progression/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: obrigatórios (princípio V, FR-014, SC-001 a SC-003). Cada teste é escrito antes da
implementação e falha até ela existir. Os fixtures são sintéticos, com valores de referência
numéricos, nunca arquivos da ROM (princípio II).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: US1 XP e nível, US2 quinto golpe, US3 evolução, US4 amizade

---

## Phase 1: Setup

- [X] T001 Criar `packages/shared/src/progression/index.ts` e exportá-lo em `packages/shared/src/index.ts`
- [X] T002 [P] Registrar em `docs/balance-log.md` a definição de participante em tempo real (research R3: XP inteira para cada jogador, sem divisão entre jogadores) e o adiamento das decisões para o fim do combate (R4)

---

## Phase 2: Foundational (bloqueia todas as histórias)

- [X] T003 [P] Teste da migração 3 → 4 (cada membro de `party` e `storage` recebe `ivs` todos 31, `evs` todos 0, `nature: 0`, `experience = level³` com `0` no nível 1; `pending: []`) e do schema (IV 0–31; EV 0–255 com soma ≤ 510 rejeitando 511; `nature` 0–24; `pending[].member` < `party.length` como regra de coerência) em `packages/shared/test/save/migrate.test.ts`, `schema.test.ts` e `coherence.test.ts`
- [X] T004 Save v4 em `packages/shared/src/save/schema.ts`, `migrate.ts` e `coherence.ts` conforme [contracts/save-v4.md](contracts/save-v4.md): `SAVE_SCHEMA_VERSION = 4`; `partyMember` ganha `experience`, `ivs`, `evs`, `nature`; schema `progressionItem` (`level-up {member, level, gains}`, `learn {member, move}`, `evolve {member, into}`); `pending` no save e em `newProgress()`
- [X] T005 [P] Teste do protocolo v8 (`exp-gain`, `progression`, `progression-ack`, `learn-answer` com `forget` 0–3 ou `null`, `evolve-answer`) em `packages/shared/test/game/protocol.test.ts`
- [X] T006 Protocolo v8 em `packages/shared/src/game/protocol.ts` e `PROTOCOL_VERSION = 8` em `packages/shared/src/protocol-version.ts`, conforme [contracts/game-protocol-v8.md](contracts/game-protocol-v8.md)
- [X] T007 Ajustar fixtures e testes existentes que montam `PartyMember` (equipe de dev em `packages/server/src/game-server.ts`, `packages/server/test/harness.ts`, `packages/server/test/companion.test.ts`, `capture.test.ts`, `packages/app/test/save-store.test.ts`) para os campos novos
- [X] T008 Stats do membro: helper `memberStats(member, species, natures)` que chama `computeStats` com `ivs`, `evs` e a natureza (`increased`/`decreased` de `natures.json`) em `packages/shared/src/progression/stats.ts`, com teste para 3 espécies de referência (SC-003) em `packages/shared/test/progression/stats.test.ts`; usar no lugar dos stats atuais do combatente em `packages/server/src/companion.ts`

---

## Phase 3: User Story 1 - XP e subida de nível (P1) 🎯 MVP

**Goal**: vencer dá XP e EVs aos participantes; a subida de nível aparece depois do combate.

**Independent Test**: um selvagem derrotado credita a XP de referência; o nível e os stats mudam
só quando o combate termina.

- [X] T009 [P] [US1] Teste da fórmula `floor(floor(floor(b × L / 7) / s) × a)` com `a` 1 e 1,5 e `s` de 1 a 6, contra valores de referência (SC-001), e de `levelFor(exp, curve)` nos níveis 1, 2, 50 e 100 das 6 curvas, além da medium-fast inteira contra `n³` (SC-002), em `packages/shared/test/progression/experience.test.ts`
- [X] T010 [P] [US1] Teste de `addEvs` (limite de 255 por stat e 510 no total, aplicados em ordem hp, attack, defense, speed, spAttack, spDefense) em `packages/shared/test/progression/evs.test.ts`
- [X] T011 [P] [US1] Implementar `expGain` e `levelFor` (XP limitada ao valor do nível 100) em `packages/shared/src/progression/experience.ts`
- [X] T012 [P] [US1] Implementar `addEvs` em `packages/shared/src/progression/evs.ts`
- [X] T013 [US1] Teste de `buildQueue(member, oldLevel, newLevel, data)`: um `level-up` com `gains` para cada nível, em ordem, em `packages/shared/test/progression/queue.test.ts`
- [X] T014 [US1] Implementar `buildQueue` (só `level-up` nesta história) em `packages/shared/src/progression/queue.ts`
- [X] T015 [US1] Teste do servidor: participação por selvagem e jogador (o membro desmaiado não recebe; o nível 100 recebe EVs e não recebe XP; dois jogadores recebem a XP inteira cada um), crédito na queda, nenhuma mensagem `progression` enquanto `inCombat`, resolução ao voltar para `walk` e `startCombat` recusado com fila pendente, em `packages/server/test/progression.test.ts`
- [X] T016 [US1] Implementar `createProgression` em `packages/server/src/progression.ts`: registra os ativos via `companion.ts`, credita XP e EVs quando o selvagem cai (`packages/server/src/wild.ts`), enfileira em `save.pending`, envia `exp-gain` e, fora do combate, envia `progression` um item por vez e avança com `progression-ack`
- [X] T017 [US1] Expor em `packages/server/src/companion.ts` um evento de membro ativo e de fim de combate, e bloquear `startCombat` enquanto `pending` não estiver vazio
- [X] T018 [US1] Ao carregar o save, subir `experience` até o mínimo da curva real do nível (research R8) em `packages/server/src/session.ts`; na captura, gerar `ivs`, `nature` e `experience` com o RNG do servidor em `packages/server/src/wild.ts` e `packages/server/src/capture.ts`
- [X] T019 [US1] Encaminhar `progression-ack` da sessão para a progressão em `packages/server/src/session.ts` e `packages/server/src/index.ts`
- [X] T020 [US1] Toast de `exp-gain` e tela de subida de nível com o ganho de cada stat em `packages/client/src/ProgressionPrompt.svelte`, montada em `packages/client/src/GameSession.svelte`, mensagens tratadas em `packages/client/src/net/game-connection.ts`

---

## Phase 4: User Story 2 - Quinto golpe (P1)

**Goal**: o golpe novo é aprendido direto com vaga e pede escolha com 4 golpes conhecidos.

**Independent Test**: um membro com 4 golpes que sobe para um nível do learnset abre a escolha, e
tanto esquecer quanto não aprender funcionam.

- [X] T021 [US2] Estender o teste de `buildQueue`: `learn` depois do `level-up` do mesmo nível; um golpe já conhecido não entra, em `packages/shared/test/progression/queue.test.ts`
- [X] T022 [US2] Adicionar `learn` a `buildQueue` usando o learnset por nível em `packages/shared/src/progression/queue.ts`
- [X] T023 [US2] Teste no servidor: com menos de 4 golpes o golpe é aprendido sem prompt; com 4, `learn-answer {forget: i}` troca o golpe (PP cheio) e `{forget: null}` mantém os golpes; uma resposta fora de ordem é ignorada, em `packages/server/test/progression.test.ts`
- [X] T024 [US2] Tratar `learn` e `learn-answer` em `packages/server/src/progression.ts` e `packages/server/src/session.ts`
- [X] T025 [US2] Escolha de golpe (4 atuais + o novo, botão "não aprender") em `packages/client/src/ProgressionPrompt.svelte`, navegável por teclado e gamepad pelo mapa de `packages/client/src/input/input.ts`

---

## Phase 5: User Story 3 - Evolução por nível cancelável (P1)

**Goal**: a evolução `level` acontece depois do combate, com animação, e pode ser cancelada.

**Independent Test**: um Cyndaquil (155) que chega ao 14 vira Quilava (156) ao aceitar e continua
Cyndaquil ao cancelar (SC-004).

- [X] T026 [US3] Estender o teste de `buildQueue`: `evolve` depois dos níveis quando a condição `{kind: "level"}` tem `level ≤ novo`; pular o nível evolui uma vez; os métodos que não são `level` (item, troca, amizade, horário) não geram item, em `packages/shared/test/progression/queue.test.ts`
- [X] T027 [US3] Adicionar `evolve` a `buildQueue` em `packages/shared/src/progression/queue.ts`
- [X] T028 [US3] Teste no servidor: com fixture 155 → 156 no nível 14, `evolve-answer {accept: true}` troca a espécie, recalcula os stats, soma ao HP atual a diferença do HP máximo e enfileira os `learn` da nova espécie; `{accept: false}` não muda nada e a evolução volta no próximo nível; `party` atualizado chega aos outros jogadores, em `packages/server/test/progression.test.ts`
- [X] T029 [US3] Tratar `evolve` e `evolve-answer` em `packages/server/src/progression.ts` e `packages/server/src/session.ts`; marcar a espécie nova como vista e capturada na Pokédex
- [X] T030 [US3] Animação de evolução (silhueta piscando entre as duas espécies) com botão de cancelar em `packages/client/src/ProgressionPrompt.svelte` e `packages/client/src/render/combat-fx.ts`

---

## Phase 6: User Story 4 - Amizade (P3)

**Goal**: a amizade muda por subida de nível e desmaio como no original.

**Independent Test**: os valores depois de subir de nível e desmaiar batem com a tabela.

- [X] T031 [P] [US4] Teste de `friendshipOnLevelUp` (+5 com < 100, +3 com < 200, +2 com ≥ 200, limitado a 255) e `friendshipOnFaint` (−1, mínimo 0) em `packages/shared/test/progression/friendship.test.ts`
- [X] T032 [P] [US4] Implementar em `packages/shared/src/progression/friendship.ts`
- [X] T033 [US4] Aplicar o ganho a cada `level-up` resolvido e a perda no desmaio, em `packages/server/src/progression.ts` e `packages/server/src/companion.ts`; usar `baseFriendship` da espécie no lugar de `CATCH_FRIENDSHIP` em `packages/server/src/capture.ts`

---

## Phase 7: Polish

- [X] T034 Fila pendente reaberta: teste de save com `pending` não vazio, oferecido de novo ao entrar (SC-006), em `packages/server/test/progression.test.ts`
- [X] T035 Rodar `pnpm -r test` e `pnpm -r typecheck`; corrigir falhas
- [X] T036 Validar no app pelo [quickstart.md](quickstart.md) com a skill `run-soulsilver` (Cyndaquil 13 → 14 → Quilava, cancelar, quinto golpe)

---

## Dependencies

- Setup → Foundational → US1 → (US2, US3, US4)
- US2 e US3 mexem nos mesmos arquivos (`queue.ts`, `progression.ts`, `ProgressionPrompt.svelte`): fazer em sequência
- US4 depende só de US1 e pode correr em paralelo com US2/US3 (T031/T032)

## Parallel Examples

- Foundational: T003 e T005 juntos
- US1: T009, T010, T011, T012 juntos
- US4: T031 e T032 junto com US2

## Implementation Strategy

MVP = Phases 1–3 (XP, EVs, nível e stats depois do combate). Depois US2 e US3, que completam as
decisões; US4 por último, sem efeito visível.
