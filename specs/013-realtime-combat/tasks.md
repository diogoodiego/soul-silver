---
description: "Tasks for 013-realtime-combat"
---

# Tasks: Combate em tempo real

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: obrigatórios para a lógica (constituição V, test-first): cada teste é escrito e falha antes
da implementação. Render (three.js) e HUD (Svelte) são verificados à mão pelo [quickstart.md](quickstart.md).

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Criar `content/combat/` com envelopes vazios válidos (`archetypes.json`, `moves.json`, `statuses.json`, `tuning.json`, `coverage.json`) no formato de [contracts/combat-data.md](contracts/combat-data.md)
- [X] T002 [P] Criar `packages/shared/src/combat/index.ts` e o export `@soulsilver/shared/combat` em `packages/shared/package.json` (mesmo padrão de `game-data`)
- [X] T003 [P] Criar `packages/shared/test/combat/` e o fixture `packages/shared/test/combat/fixtures/type-chart-gen4.ts` com a tabela Gen 4 completa de 18 ids (incl. `???`, id 9), escrita à mão, em décimos (0, 5, 10, 20)

---

## Phase 2: Foundational (bloqueia todas as histórias)

- [X] T004 [P] Teste dos schemas em `packages/shared/test/combat/schemas.test.ts`: aceita os exemplos de [contracts/combat-data.md](contracts/combat-data.md); recusa `behavior` fora dos 9, `hits` fora de 1..10, `castS` fora de 0..5, `delta` fora de −6..+6, `chance` fora de 0..100, `durationS.max < min`; erro traz arquivo e caminho do campo (ex.: `records.12.hitbox.radiusPx`)
- [X] T005 Implementar schemas zod e `parseCombatJson(kind, text, file)` em `packages/shared/src/combat/schemas.ts` (Archetype, MoveMapping, Effect por `kind`, StatusDef, Tuning, Coverage; `formatVersion: 1`), reusando `fileSchema`/`ParseResult` de `packages/shared/src/game-data/`
- [X] T006 [P] Teste de tabela de tipos em `packages/shared/test/combat/types.test.ts`: `effectiveness(chart, moveType, defTypes)` compara as 18×18 células com o fixture de T003, tipos duplos multiplicam (0,25/4/0) e tipo único repetido não duplica
- [X] T007 Implementar `packages/shared/src/combat/types.ts` recebendo o `TypeChartRecord[]` extraído como dado
- [X] T008 [P] Teste de stats em `packages/shared/test/combat/stats.test.ts`: fórmula Gen 4 (HP e demais; IV, EV, natureza ±10%) com casos conhecidos; multiplicadores de estágio −6..+6 (2/8..8/2) e clamp em ±6
- [X] T009 Implementar `packages/shared/src/combat/stats.ts` (`computeStats`, `stageMultiplier`, `applyStage` retornando o delta efetivo)
- [X] T010 [P] Teste de dano em `packages/shared/test/combat/damage.test.ts`: fórmula Gen 4 inteira de research R2 (truncamentos, burn ×½ físico, +2, crit ×2 ignorando estágios ruins, random 85..100, STAB 1,5, tipo1, tipo2, mínimo 1, imunidade 0); faixas min/max iguais às originais para ≥10 casos de referência; RNG determinístico com `createRng`; chance de crítico por estágio de `tuning.crit.stageChances`
- [X] T011 Implementar `packages/shared/src/combat/damage.ts` (`computeDamage(input, rng)` → `{damage, effectiveness, crit}`)
- [X] T012 [P] Teste de hitbox em `packages/shared/test/combat/hitbox.test.ts`: círculo, cápsula e arco contra corpo circular, rotação pela mira, varredura de projétil (não atravessa alvo entre ticks), casos de borda tangentes
- [X] T013 Implementar `packages/shared/src/combat/hitbox.ts`
- [X] T014 Incluir `aim: {x,y} | null` (cada eixo em [−1,1]) em `playerInput`, a mensagem `combat-event` com `HitEvent[]` e o campo `arena?` no `hello` em `packages/shared/src/game/protocol.ts`; `PROTOCOL_VERSION` 4 → 5 em `packages/shared/src/protocol-version.ts`; atualizar os testes de protocolo existentes em `packages/shared/test/game/` (teste antes)
- [X] T015 Teste do loader em `packages/server/test/combat-loader.test.ts`: carrega `content/combat/` + dados extraídos de fixture; recusa `move` inexistente ou repetido, `archetype` inexistente, `hitbox` incompatível com o behavior, `status` inexistente; converte segundos em ticks com `round(s·20)`
- [X] T016 Implementar `packages/server/src/combat-loader.ts` (lê moves, species, type-chart extraídos e os 4 arquivos de combate; resolve mapeamento ou genérico por categoria)
- [X] T017 Teste do núcleo do combate em `packages/server/test/combat.test.ts`: criar combatente (stats, `hp` 0..stats.hp), golpe sai na borda de subida do bit 0..3 de `buttons`, ignorado em cooldown/conjuração/imóvel, `hp=0` para de agir e de receber dano, ordem determinística de dois acertos no mesmo tick
- [X] T018 Implementar `packages/server/src/combat.ts` (Combatant, ActiveMove, `step(tick)`, emissão de `HitEvent`) e integrar ao tick em `packages/server/src/world.ts` e ao input em `packages/server/src/session.ts`; `data` da entidade `pokemon` conforme [contracts/game-protocol-v5.md](contracts/game-protocol-v5.md)

**Checkpoint**: lógica pura testada; servidor resolve um golpe genérico de ponta a ponta em teste.

---

## Phase 3: User Story 6 - Arena de teste (P1)

**Goal**: dois Pokémon quaisquer lutam numa arena de dev com HUD de depuração.

**Independent Test**: abrir a arena, escolher Cyndaquil e Chikorita e ver HP, cooldowns e status.

- [X] T019 [US6] Teste em `packages/server/test/arena.test.ts`: `hello.arena` aceito só com `devArena`, recusado com `invalid-message` sem ele; `CombatantSpec` `level 1..100`, `moves` 1..4; controller `idle` não age; segundo Pokémon é `wild`
- [X] T020 [US6] Implementar `packages/server/src/arena.ts` (mapa vazio, dois combatentes a partir de `CombatantSpec`) e a flag `devArena` na sessão solo em `packages/server/src/game-server.ts`
- [X] T021 [US6] Criar `packages/client/src/ArenaHud.svelte` (escolha de espécie, nível e 4 golpes por lado; HP, `cd1..cd4`, status, estágios) e a entrada "Arena (dev)" em `packages/client/src/MainMenu.svelte` só com `import.meta.env.DEV`
- [X] T022 [US6] Verificar à mão o cenário de abertura da arena ([quickstart.md](quickstart.md)) e que o build de produção não mostra a entrada

---

## Phase 4: User Story 1 - Lutar por controle direto (P1) 🎯 MVP

**Goal**: mover, mirar e disparar os 4 golpes; o acerto depende da hitbox e o dano da fórmula.

**Independent Test**: na arena, golpes mirados no alvo causam dano na faixa; mirados fora, não.

- [X] T023 [P] [US1] Teste por behavior em `packages/server/test/combat-archetypes.test.ts`: `melee`, `projectile`, `beam`, `self-area`, `target-area`, `dash`, `self-buff`, `target-debuff`, `field` (alcance, `castS`, `hits` por alvo, `durationS`); `aim` null usa o `facing`; acerto reportado pelo cliente é ignorado (servidor só usa sua geometria)
- [X] T024 [P] [US1] Teste de dono em `packages/server/test/combat-owner.test.ts`: hitbox não afeta o próprio dono nem Pokémon de outro jogador (sem PvP); afeta `wild` (research R12)
- [X] T025 [US1] Implementar os 9 behaviors e `canHarm` em `packages/server/src/combat.ts` (projétil como entidade `projectile`)
- [X] T026 [US1] Escrever os 9 arquétipos base e `generic-physical`, `generic-special`, `generic-status` em `content/combat/archetypes.json`
- [X] T027 [P] [US1] Teste em `packages/server/test/combat-generic.test.ts`: todo golpe da extração de fixture sem mapeamento executa o genérico da categoria sem erro (SC-004)
- [X] T028 [US1] Mira e atalhos em `packages/client/src/input/input.ts`: mouse projetado no plano do mundo e analógico direito (com `STICK_DEADZONE`) → `aim`; teclas 1–4 e 4 botões do controle → bits 0..3; enviar por `packages/client/src/net/game-connection.ts`
- [X] T029 [US1] Desenhar combatentes, conjuração e projéteis em `packages/client/src/render/game-renderer.ts`
- [X] T030 [US1] Verificar à mão os cenários 2 e 4 do [quickstart.md](quickstart.md)

---

## Phase 5: User Story 2 - Efetividade na hora (P1)

**Goal**: knockback, piscada, número de dano e texto de efetividade/crítico.

**Independent Test**: fogo vs planta mostra "super efetivo" com 2× do dano neutro; normal vs fantasma "sem efeito".

- [X] T031 [P] [US2] Teste em `packages/server/test/combat-feedback.test.ts`: `HitEvent` com `effectiveness` em {0, 0.25, 0.5, 1, 2, 4}, `crit`, `knockback` (`tuning.knockbackPx` na direção do golpe, 0 na imunidade, `result: "immune"`); Ember vs Chikorita = 2× do mesmo golpe com efetividade neutra, mesmo RNG e sem crítico (SC-003)
- [X] T032 [US2] Aplicar knockback (respeitando colisão de `movement.ts`) e enviar `combat-event` aos clientes relevantes em `packages/server/src/combat.ts` e `packages/server/src/replication.ts`
- [X] T033 [US2] Criar `packages/client/src/render/combat-fx.ts`: piscada por `tuning.flashS`, número de dano, textos "super effective" / "not very effective" / "no effect" / crítico (inglês, via catálogo de textos do jogo, i18n)
- [X] T034 [US2] Verificar à mão os cenários 1 e 3 do [quickstart.md](quickstart.md)

---

## Phase 6: User Story 3 - Speed e peso dos golpes (P2)

**Goal**: Speed acelera movimento e reduz cooldown, com limites; golpes fortes demoram mais.

**Independent Test**: Rattata vs Hoothoot andando e usando Tackle; Tackle vs Hyper Beam.

- [X] T035 [P] [US3] Teste em `packages/shared/test/combat/cooldown.test.ts`: `clamp(a + b·power/100 + c·(35/pp − 1), min, max)`, `statusPower` para status, `cooldownS` do mapeamento sobrescreve; mais poder e menos PP → maior; escala por Speed com `t` limitado a 0..1, movimento entre `moveMinPx` e `moveMaxPx`, corte até `cooldownMaxCut` (research R5, R6)
- [X] T036 [US3] Implementar `packages/shared/src/combat/cooldown.ts` e preencher `content/combat/tuning.json` com os valores iniciais de research R5/R6
- [X] T037 [US3] Usar velocidade por Speed no passo de movimento do Pokémon em combate (feito em `packages/server/src/combat.ts`, movimento livre em 8 direções; `movement.ts` não foi tocado) e o cooldown escalado em `packages/server/src/combat.ts`; teste em `packages/server/test/combat.test.ts`
- [ ] T038 [US3] Verificar à mão o cenário 5 do [quickstart.md](quickstart.md)

---

## Phase 7: User Story 4 - Status e stats (P2)

**Goal**: 7 status com duração em segundos e estágios até voltar à Poké Ball.

**Independent Test**: aplicar cada status na arena; Swords Dance + Scratch.

- [X] T039 [P] [US4] Teste em `packages/shared/test/combat/status.test.ts`: burn (1/8 por `intervalS`, ataque físico ×½), poison 1/8, toxic n/16 crescente, paralysis (Speed ×¼, `skipMove`), sleep (duração aleatória `min..max`, imóvel), freeze (imóvel, `thawPerInterval`, descongela com golpe de fogo), confusion (`misdirect`, `±deviationDeg`, coexiste); um status principal por vez; `immuneTypes`; reaplicação no tick de expiração vale
- [X] T040 [US4] Implementar `packages/shared/src/combat/status.ts` e preencher `content/combat/statuses.json`
- [X] T041 [US4] Teste e implementação dos efeitos `status`, `stages`, `heal`, `recoil`, `drain` e `field` em `packages/server/src/combat.ts` (`packages/server/test/combat-effects.test.ts`); estágios persistem até `resetStages()` (chamado pelo spec 14); ±6 sem efeito adicional
- [X] T042 [US4] Mostrar status e estágios no `packages/client/src/ArenaHud.svelte` e indicação visual mínima de status em `packages/client/src/render/combat-fx.ts`
- [ ] T043 [US4] Verificar à mão os cenários 6 e 7 do [quickstart.md](quickstart.md)

---

## Phase 8: User Story 5 - Ajuste só por dados (P2)

**Goal**: todos os golpes do recorte mapeados; mudar dados muda o comportamento.

**Independent Test**: alterar `rangePx` de Ember e reiniciar a arena.

- [X] T044 [US5] Criar `scripts/combat-coverage.ts`: lê da extração os encontros de Route 29, 30 e 31 (todas as horas/métodos) e os iniciais com suas evoluções, une learnsets por nível, TM/HM, tutor e ovo, e grava `content/combat/coverage.json` ordenado
- [X] T045 [US5] Rodar o script com a extração local e versionar `content/combat/coverage.json`
- [X] T046 [P] [US5] Teste em `packages/server/test/combat-coverage.test.ts`: todo id de `coverage.json` tem entrada própria em `content/combat/moves.json` (SC-002); com extração local disponível (pular sem ela), regenerar e comparar com o versionado
- [X] T047 [US5] Mapear em `content/combat/moves.json` todos os golpes de `coverage.json` (arquétipo, hitbox, efeitos; poder variável, multi-hit, dois turnos e recarga via `castS`, `hits`, `cooldownS`)
- [ ] T048 [US5] Verificar à mão os cenários 8 e 9 do [quickstart.md](quickstart.md)

---

## Phase 9: Polish

- [X] T049 Registrar em `docs/balance-log.md` cada desvio: constantes de cooldown, limites de Speed, durações e intervalos de status, knockback e cada `cooldownS`/parâmetro numérico que difere do original (SC-007)
- [X] T050 [P] Teste de desempenho em `packages/server/test/combat-perf.test.ts`: 8 combatentes e 32 hitboxes ativas resolvidas em ≤ 1 ms por tick (média)
- [ ] T051 Verificar à mão o cenário 10 do [quickstart.md](quickstart.md) (sessão hospedada, sem fogo amigo) e o tempo de feedback em LAN (SC-005)
- [X] T052 Rodar `npm test`, lint e typecheck na raiz

---

## Dependencies

- Setup → Foundational → US6 (arena) → US1 → US2.
- US3, US4 e US5 dependem de US1 e são independentes entre si.
- Polish depois de todas.

## Parallel Opportunities

- Phase 2: os pares teste/implementação T004–T005, T006–T007, T008–T009, T010–T011, T012–T013 são independentes entre si.
- US1: T023, T024 e T027 em paralelo; T028–T029 (cliente) em paralelo com T025–T026 (servidor).
- Depois de US1: US3, US4 e US5 em paralelo.

## Implementation Strategy

1. MVP: Phases 1–4 (lógica pura + arena + golpes por mira). Demonstrável na arena.
2. Phase 5 dá o feedback de efetividade e fecha SC-003.
3. Phases 6–8 em qualquer ordem; Phase 8 fecha SC-002.
4. Polish fecha SC-005 e SC-007.
