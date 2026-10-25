# Tasks: Pokémon companheiro e regras do combate no mundo

**Input**: Design documents from `/specs/014-companion-combat-rules/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: obrigatórios (princípio V e SC-005): cada teste é escrito antes e falha antes da
implementação. Fixtures sintéticos, nunca dados reais da ROM (princípio II).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: US1 seguir, US2 combate, US3 troca/desmaio/blackout, US4 interação

---

## Phase 1: Setup

- [X] T001 Criar `content/companion/follow.json`, `reactions.json` e `battle-rules.json` com os valores padrão de [contracts/companion-data.md](contracts/companion-data.md) (`distanceTiles: 1`, `respawnTiles: 3`, `largeFramePx: 32`, `combatRadiusTiles: 6`, `stepForwardTiles: 1`, `swapAnimSeconds: 0.5`, `swapCooldownSeconds: 3`, `chaseLimitTiles: 10`, `disengageTiles: 8`, `disengageSeconds: 5`, `moneyLossBase: [8,16,24,36,48,64,80,100,120]`, `homeSpawn` na casa do jogador em New Bark Town)
- [X] T002 [P] Registrar raio de combate, cooldown/animação de troca, perseguição e desengajamento como mecânica nova em `docs/balance-log.md`
- [X] T003 [P] Criar `packages/shared/src/companion/index.ts` e exportá-lo em `packages/shared/src/index.ts`

---

## Phase 2: Foundational (bloqueia todas as histórias)

- [X] T004 [P] Teste dos schemas (valores válidos; `moneyLossBase` com ≠ 9 entradas rejeitado; `fallback` ausente rejeitado; erro com arquivo e caminho do campo) em `packages/shared/test/companion/schemas.test.ts`
- [X] T005 Implementar schemas zod `FollowRules`, `ReactionRules`, `BattleRules` em `packages/shared/src/companion/schemas.ts` (emoções `exclaim | question | note | heart | sweat | angry | sleep`; `place` `town | route | cave | indoor`; `time` `morning | day | night`)
- [X] T006 [P] Teste da migração 1 → 2 (`party: []`, `money: 3000`, `badges: 0`, `respawn: null`) e da coerência (`respawn.area` existe; `hp` ≤ HP máximo) em `packages/shared/test/save/migrate-v2.test.ts`
- [X] T007 Save v2 em `packages/shared/src/save/schema.ts`: `SAVE_SCHEMA_VERSION = 2`; `party: PartyMember[0..6]` com `species` int 1–493, `level` int 1–100, `moves` int[1..4], `hp` int ≥ 0, `friendship` int 0–255; `money` int 0–999999; `badges` int 0–16; `respawn: {area, x, y} | null`
- [X] T008 Migração `SAVE_MIGRATIONS[1]` em `packages/shared/src/save/migrate.ts` e regra nova em `packages/shared/src/save/coherence.ts`; ajustar `snapshot` e o save base em `packages/server/src/session.ts` e fixtures de save existentes
- [X] T009 [P] Teste de `lead(party)` (primeiro com `hp > 0`; undefined quando todos desmaiados; muda ao reordenar) em `packages/shared/test/companion/lead.test.ts`
- [X] T010 [P] Implementar `lead` em `packages/shared/src/companion/lead.ts`
- [X] T011 Protocolo v6 em `packages/shared/src/game/protocol.ts` e `PROTOCOL_VERSION = 6` em `packages/shared/src/protocol-version.ts`: bits 4 combate, 5 recolher, 6 interagir em `buttons`; mensagem cliente `swap {partyIndex 0–5}`; `controlledId` em `welcome`/`state`; mensagens `reaction`, `fainted`, `blackout` ([contracts/game-protocol-v6.md](contracts/game-protocol-v6.md)); atualizar testes de protocolo existentes
- [X] T012 Carregador `packages/server/src/companion-loader.ts` (lê `content/companion/*.json` com os schemas de T005, como `combat-loader.ts`) e ligação no arranque do servidor em `packages/server/src/game-server.ts`
- [X] T013 Party do save vira a fonte dos combatentes: helper que cria combatente a partir de `PartyMember` em `packages/server/src/combat.ts`; flag de dev passa a semear uma equipe de teste no save novo em `packages/server/src/session.ts`

**Checkpoint**: save v2, protocolo v6 e dados carregados; testes existentes verdes.

---

## Phase 3: User Story 1 - Companheiro segue o treinador (P1) 🎯 MVP

**Goal**: o líder da equipe segue pelo rastro, pula ressaltos, atravessa warps, vai para a bola em prédios (se grande) e locais restritos, e é visto por todos.

**Independent Test**: New Bark Town → Cherrygrove entrando em todos os prédios; Onix no Centro Pokémon.

- [X] T014 [P] [US1] Teste do rastro: para quando o treinador para; fica `distanceTiles` atrás; replica `hop`; aparece atrás do treinador após `warp`; reaparece além de `respawnTiles`; girar no lugar não move; nunca ocupa tile fora do rastro, em `packages/shared/test/companion/trail.test.ts`
- [X] T015 [P] [US1] Teste de tamanho (frame > `largeFramePx` em largura ou altura = grande) em `packages/shared/test/companion/size.test.ts`
- [X] T016 [P] [US1] Implementar fila do rastro e passo do companheiro (`TrailStep {area, x, y, facing, step: "walk" | "hop" | "warp"}`, capacidade `respawnTiles + 2`) em `packages/shared/src/companion/trail.ts`
- [X] T017 [P] [US1] Implementar `isLarge(species, spriteSet)` em `packages/shared/src/companion/size.ts`
- [X] T018 [US1] Teste do servidor: entidade `pokemon` com `data: {owner, role: "companion", species, state}`; troca de líder ao desmaiar/reordenar; `follow → ball` em `indoor` sendo grande e em `restrictedMaps`; `ball → follow` ao sair; sem colisão com jogadores e companheiros, em `packages/server/test/companion.test.ts`
- [X] T019 [US1] Implementar `packages/server/src/companion.ts` (cria/remove entidade, grava rastro a cada mudança de tile do treinador, aplica estado bola/seguindo) e chamá-lo no `step()` de `packages/server/src/session.ts`
- [X] T020 [US1] Excluir companheiros da colisão entre entidades em `packages/shared/src/game/movement.ts` (ou onde a colisão de entidades é decidida)
- [X] T021 [US1] Desenhar companheiro com o sprite de overworld da espécie, direção e pulo, e ocultar no estado `ball`, em `packages/client/src/render/game-renderer.ts`

**Checkpoint**: SC-001 e SC-002 verificáveis.

---

## Phase 4: User Story 2 - Assumir o controle em combate (P1)

**Goal**: botão de combate passa o controle ao Pokémon em ≤ 0,5 s; treinador parado e intocável; contido no raio; câmera segue; recolher devolve.

**Independent Test**: medir tempo até o controle, tentar sair do raio, atingir o treinador, recolher.

- [X] T022 [US2] Teste de `battle-mode`: `walk → combat` cria o Pokémon `stepForwardTiles` à frente no tick seguinte (também saindo da bola); input move o Pokémon em 8 direções; posição nunca passa de `combatRadiusTiles` do treinador, incluindo tentativa deliberada; treinador ignorado por hitboxes e marcado `data.inCombat`; recolher volta a `follow`; sem companheiro o botão não faz nada; fim por `disengageTiles`/`disengageSeconds`, em `packages/server/test/battle-mode.test.ts`
- [X] T023 [US2] Implementar `packages/server/src/battle-mode.ts` (`BattleState {mode: "walk" | "combat", activeIndex, swapReadyTick, anchor, lastThreatTick}`, contenção no círculo por tick, `controlledId`) e integrar ao input e ao `step()` em `packages/server/src/session.ts`
- [X] T024 [US2] Ignorar entidades com `data.inCombat` na resolução de hitbox em `packages/server/src/combat.ts`
- [X] T025 [P] [US2] Ações remapeáveis combate/recolher (padrão gamepad LB/B) mapeadas nos bits 4–5 em `packages/client/src/input/input.ts`
- [X] T026 [P] [US2] Câmera segue `controlledId` em `packages/client/src/render/camera.ts`
- [X] T027 [P] [US2] Marca visual "em combate" sobre jogadores com `data.inCombat` em `packages/client/src/render/game-renderer.ts`

**Checkpoint**: SC-004 e SC-006 verificáveis.

---

## Phase 5: User Story 3 - Trocar, desmaiar, fugir e blackout (P2)

**Goal**: troca pelo seletor rápido com animação vulnerável e cooldown; desmaio abre seletor; blackout com perda de dinheiro Gen 4.

**Independent Test**: trocar, trocar em cooldown, desmaiar, perder com a equipe inteira.

- [X] T028 [P] [US3] Teste de `moneyLoss` (`min(dinheiro, maiorNível × base[min(insígnias, 8)])`; dinheiro menor que a perda → 0) e `respawnPoint` (`respawn ?? homeSpawn`) em `packages/shared/test/companion/blackout.test.ts`
- [X] T029 [P] [US3] Implementar `packages/shared/src/companion/blackout.ts`
- [X] T030 [US3] Testes em `packages/server/test/battle-mode.test.ts`: `swap` cria o novo vulnerável por `swapAnimSeconds`; ignorado em cooldown, desmaiado, já ativo ou fora de combate; ordem da equipe inalterada; desmaio põe a entidade na bola e envia `fainted {canContinue}`; recolher após desmaio sai do combate; último desmaio (inclusive durante a animação de troca) → blackout: dinheiro reduzido, posição de reaparição, equipe curada, `mode = walk`, mensagem `blackout`; desconexão em combate encerra o combate
- [X] T031 [US3] Implementar troca, desmaio e blackout em `packages/server/src/battle-mode.ts`; HP do membro da equipe atualizado a partir do combatente em `packages/server/src/combat.ts`
- [X] T032 [US3] Expor `chaseLimitTiles` para a IA de selvagens (spec 15) como campo lido do `BattleRules` em `packages/server/src/battle-mode.ts`, com comentário de que a perseguição chega no spec 15
- [X] T033 [US3] Ponto de distribuição de XP no fim do combate (gancho vazio chamado na transição `combat → walk`, documentado para o spec 16) em `packages/server/src/battle-mode.ts`
- [X] T034 [P] [US3] `packages/client/src/SwapPicker.svelte`: abre pela ação seletor (padrão RB) ou ao receber `fainted`; lista só não desmaiados; envia `swap`; opção recolher; nenhum outro menu abre em combate
- [X] T035 [P] [US3] Tela/aviso de blackout com o dinheiro perdido em `packages/client/src/GameSession.svelte`

**Checkpoint**: blackout e perda de dinheiro cobertos por testes (SC-005).

---

## Phase 6: User Story 4 - Interagir com o companheiro (P3)

**Goal**: tecla dedicada vira treinador e companheiro um para o outro com balão e reação do catálogo.

**Independent Test**: interagir em cidade, rota, caverna e interior, de dia e de noite.

- [X] T036 [P] [US4] Teste de `pickReaction` (lugar por `areaType` + `towns`; faixas manhã 04–09, dia 10–19, noite 20–03; `friendshipMin/Max`; mais condições vence; empate pelo RNG; sem regra → `fallback`) em `packages/shared/test/companion/reactions.test.ts`
- [X] T037 [P] [US4] Implementar `packages/shared/src/companion/reactions.ts`
- [X] T038 [US4] Tratar bit 6 no servidor: ignorar em combate; virar treinador e companheiro um para o outro; enviar `reaction`, em `packages/server/src/companion.ts` com teste em `packages/server/test/companion.test.ts`
- [X] T039 [US4] Validar no carregamento que cada `text {bank, index}` de `reactions.json` existe no catálogo, em `packages/server/src/companion-loader.ts`
- [X] T040 [P] [US4] Ação remapeável interagir (padrão Y) no bit 6, bloqueada com menu ou cutscene aberta, em `packages/client/src/input/input.ts`
- [X] T041 [P] [US4] `packages/client/src/ReactionDialog.svelte` (texto do catálogo na caixa de diálogo) e balão de emoção sobre o companheiro em `packages/client/src/render/game-renderer.ts`

**Checkpoint**: SC-003 verificável.

---

## Phase 7: Polish

- [ ] T042 Preencher `towns`, `restrictedMaps` e ~40 regras de reação com ids reais conferidos na extração em `content/companion/*.json`
- [X] T043 [P] Rodar `pnpm -r test` e typecheck; corrigir quebras
- [ ] T044 Rodar o [quickstart.md](quickstart.md) no app real (skill `run-soulsilver`), incluindo LAN com dois clientes

---

## Dependencies & Execution Order

- Setup → Foundational → US1 → US2 → US3; US4 depende só de US1.
- US2 precisa do companheiro (US1). US3 precisa do modo combate (US2).
- Dentro de cada fase: testes antes da implementação.

### Parallel Opportunities

- Phase 2: T004, T006, T009/T010 juntos; T011 em paralelo com os de save.
- US1: T014, T015 juntos; depois T016, T017 juntos.
- US2: T025, T026, T027 juntos após T023.
- US3: T028/T029 em paralelo com T030; T034, T035 juntos.
- US4: T036/T037 e T040/T041 juntos; US4 pode correr ao lado de US2/US3.

## Implementation Strategy

1. **MVP**: Setup + Foundational + US1 (companheiro seguindo e validado em New Bark → Cherrygrove).
2. US2: entrar e sair de combate controlando o Pokémon.
3. US3: troca, desmaio e blackout.
4. US4: interação.
5. Polish e quickstart completo.
