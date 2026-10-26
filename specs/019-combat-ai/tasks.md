# Tasks: IA de combate dos Pokémon

**Input**: Design documents from `/specs/019-combat-ai/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: obrigatórios (princípio V, IA de selvagens): cada teste é escrito antes e falha antes da
implementação. Fixtures sintéticos, nunca dados reais da ROM (princípio II). Todo sorteio usa
`createRng` semeado.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: US1 percepção e luta, US2 golpes e preparação, US3 dificuldade por nível,
  US4 temperamento e fuga, US5 alvo em grupo, US6 depuração, US7 reuso

---

## Phase 1: Setup

- [X] T001 Criar `content/ai/profiles.json` (perfis `novice`, `rookie`, `skilled`, `veteran` com todos os campos de [data-model.md](data-model.md)), `content/ai/temperaments.json`, `content/ai/wild-levels.json` e `content/ai/tuning.json` com os valores de [contracts/ai-data.md](contracts/ai-data.md); envelope `{ kind, formatVersion: 1, value }`
- [X] T002 [P] Registrar perfis, temperaturas, margem de troca de alvo, razão de dormência, ruídos e `aiMinCastS` em `docs/balance-log.md`
- [X] T003 [P] Criar `packages/shared/src/ai/index.ts` e exportá-lo em `packages/shared/src/index.ts` e no `exports` de `packages/shared/package.json`

---

## Phase 2: Foundational (bloqueia todas as histórias)

- [X] T004 [P] Teste dos schemas em `packages/shared/test/ai/schemas.test.ts`: perfil válido; `sightAngleDeg` fora de 1–360 rejeitado; `typeKnowledge`, `dodgeChance` e `leadFactor` fora de 0–1 rejeitados; `temperature` ≤ 0 rejeitada; ids de perfil duplicados rejeitados; `source` e `aiFlags` aceitos e ignorados; faixas de nível com lacuna, sobreposição ou perfil inexistente rejeitadas; os quatro temperamentos obrigatórios; espécie fora de 1–493 rejeitada
- [X] T005 Schemas zod `SkillProfile`, `Temperament`, `WildLevelTable`, `AiTuning` e `AI_FORMAT_VERSION = 1` em `packages/shared/src/ai/schemas.ts`, seguindo `packages/shared/src/wild/schemas.ts`
- [X] T006 [P] Teste do loader (erro cita arquivo, caminho do campo e problema; arquivo ausente falha claro) em `packages/server/test/ai-loader.test.ts`
- [X] T007 Loader dos quatro arquivos em `packages/server/src/ai-loader.ts`, seguindo `packages/server/src/wild-loader.ts`
- [X] T008 Definir `AiView`, `OpponentView`, `NoiseEvent`, `Decision` e `AiHooks` em `packages/shared/src/ai/view.ts` conforme [data-model.md](data-model.md); `OpponentView` não tem campo de cooldown (`readyAt`) nem de posição não vista
- [X] T009 [P] Teste de `AiView` em `packages/server/test/ai-view.test.ts`: adversário atrás de `blocked` não aparece em `visible`; cooldown do adversário nunca está no objeto; ruído de golpe e de corrida aparece com raios de `tuning.noise`
- [X] T010 Em `packages/server/src/combat.ts`, expor leitura somente leitura do combatente próprio e de status/casting dos outros, e registrar `NoiseEvent` quando uma entidade corre ou executa golpe (sem regra nova de combate); parâmetro opcional `minCastTicks` em `CombatInput`, sem efeito para jogadores
- [X] T011 Montar `AiView` por IA em `packages/server/src/ai.ts` (usa `sight.ts` e o ruído do T010)

**Checkpoint**: dados carregam e a IA enxerga só o que pode.

---

## Phase 3: User Story 1 - Selvagem que percebe e luta (P1) 🎯 MVP

**Goal**: um selvagem agressivo nota o jogador, mostra "!", se aproxima e luta com os próprios golpes.

**Independent Test**: cenário sem interface com o ciclo Ocioso → Alerta → Aproximação → Combate e só golpes do conjunto do selvagem.

### Tests (escrever antes, devem falhar)

- [X] T012 [P] [US1] Teste de `sight.ts` em `packages/shared/test/ai/sight.test.ts`: cone (dentro/fora do ângulo e do alcance); `blocked` e `ledge` bloqueiam; `water` e `tallGrass` não; célula única e diagonal; nenhuma importação de `combat`
- [X] T013 [P] [US1] Teste de percepção em `packages/shared/test/ai/perception.test.ts`: parede entre selvagem e jogador não percebe; som de corrida a 6 tiles é ouvido e de andar não; som vira direção com erro de `noise.bearingErrorDeg` e não grava memória; memória vale `memoryS` e expira; ao perder o alvo vai à última posição, procura por `searchS` e desiste
- [X] T014 [P] [US1] Teste da máquina de estados em `packages/shared/test/ai/controller.test.ts`: agressivo ocioso vê jogador → Alerta (`alert` ligado por `alertS`) → Aproximação → Combate; Ocioso vaga só dentro da zona e evita água, ressalto e borda; só emite botões de golpes que conhece; nunca emite botão de slot em cooldown
- [X] T015 [P] [US1] Teste de ação em `packages/shared/test/ai/action.test.ts`: mais golpes corpo a corpo → aproxima; mais golpes à distância → mantém distância e anda lateralmente; mira com erro angular dentro de `aimErrorDeg`; `leadFactor` 1 antecipa o alvo em movimento; reação só após `reactionS`

### Implementation

- [X] T016 [US1] `packages/shared/src/ai/sight.ts`: linha de visão por DDA sobre `tileAt` e teste de cone, sem dependência de `combat` (pesquisa R4)
- [X] T017 [US1] `packages/shared/src/ai/perception.ts`: visão, audição e memória de alvo (R5), guardando velocidade observada
- [X] T018 [US1] `packages/shared/src/ai/action.ts`: distância preferida por proporção de golpes de contato, movimento lateral, mira com erro e antecipação, atraso de reação (R9)
- [X] T019 [US1] `packages/shared/src/ai/controller.ts`: `createController(profile, temperament, hooks)` com estados Ocioso, Alerta, Aproximação e Combate, alvo = adversário visível mais próximo (substituído por ameaça no US5), devolvendo `CombatInput` e `Decision`
- [X] T020 [US1] `packages/server/src/ai.ts`: criar um controlador por selvagem, rodar a cada tick, entregar o `CombatInput` a `combat.input` e manter `alert` em `Entity.data` pelo estado Alerta
- [X] T021 [US1] Trocar `stepAi` e `drive` pelo controlador em `packages/server/src/wild.ts` (mantém spawn e despawn); atualizar `packages/server/test/wild.test.ts` e `wild-fixture.ts`

**Checkpoint**: um selvagem agressivo percebe, avisa, se aproxima e ataca no jogo.

---

## Phase 4: User Story 2 - Golpes legíveis e coerentes (P1)

**Goal**: o jogador lê cada ataque pela preparação e vê golpes que fazem sentido contra o seu Pokémon.

**Independent Test**: Ember contra planta com perfil forte; todo golpe da IA passa por `casting`.

### Tests

- [X] T022 [P] [US2] Teste de pontuação em `packages/shared/test/ai/scoring.test.ts`: perfil forte com Ember contra tipo planta escolhe Ember em mais de 50% de 1.000 decisões; golpe com imunidade recebe `immuneScore` com `typeKnowledge` alto e é tratado como neutro com `typeKnowledge` 0; status só em alvo sem status; cura só com HP abaixo de `healHpFraction`; buff no começo da luta ou com adversário além de `buffSafeTiles`; temperatura baixa ≈ melhor golpe e alta varia mais; mesma semente repete a escolha
- [X] T023 [P] [US2] Teste em `packages/server/test/ai-combat.test.ts`: em 200 lutas simuladas, 0 golpes em cooldown e todo uso de golpe da IA é precedido de `casting` pelo tempo do arquétipo (ou `aiMinCastS`)

### Implementation

- [X] T024 [US2] `packages/shared/src/ai/scoring.ts`: dano esperado com `computeDamage` (random 92, sem crítico) e `effectiveness`, chance de acertar por formato de hitbox/distância/velocidade, utilidade, sorteio ponderado por softmax com `temperature` (R8)
- [X] T025 [US2] Integrar o intervalo de decisão (`decisionIntervalS`) e a escolha de golpe ao estado Combate em `packages/shared/src/ai/controller.ts`; guardar as pontuações em `Decision`
- [X] T026 [US2] Aplicar `aiMinCastS` ao botão da IA em `packages/server/src/ai.ts` via `minCastTicks` (T010)

**Checkpoint**: golpes coerentes e sempre com aviso.

---

## Phase 5: User Story 3 - Dificuldade por faixa de nível (P1)

**Goal**: rotas iniciais fáceis, áreas avançadas mais fortes.

**Independent Test**: 100 lutas do inicial nível 5 contra a Route 29 com ≥ 90% de vitória.

- [X] T027 [P] [US3] Teste da tabela de faixas em `packages/shared/test/ai/wild-levels.test.ts`: nível 3 → `novice`; nível 40 → perfil mais forte; nível fora da tabela falha claro; trocar o JSON muda o perfil sem alterar código
- [X] T028 [P] [US3] Bot de referência em `packages/server/test/ai-bot.ts` (mira no mais próximo, usa o golpe de maior poder pronto, esquiva de golpes em preparação em 50% das vezes) e fixture da Route 29 (ids e taxas diurnas) em `packages/server/test/ai-route29-fixture.ts`
- [X] T029 [US3] Teste das 100 lutas em `packages/server/test/ai-route29.test.ts`: semente fixa por luta, inicial nível 5, vence ≥ 90 de 100
- [X] T030 [US3] `profileFor(level)` em `packages/shared/src/ai/profile.ts` e uso no spawn de `packages/server/src/wild.ts`
- [X] T031 [US3] Calibrar `content/ai/profiles.json` e `wild-levels.json` até T029 passar; registrar os valores finais em `docs/balance-log.md`

---

## Phase 6: User Story 4 - Temperamento e fuga (P2)

**Goal**: cada temperamento reage de um jeito; o ferido às vezes foge.

**Independent Test**: cenários por temperamento, limiar de HP, raio máximo e escape de bola.

### Tests

- [X] T032 [P] [US4] Teste em `packages/shared/test/ai/temperaments.test.ts`: passivo ignora jogador e, atacado, foge ou revida conforme `fightWeight` (1.000 sorteios); arisco foge ao ver e só luta encurralado; agressivo mostra "!" e ataca; territorial ataca quem entra em `toleranceTiles` da zona e para ao sair; passivo com HP abaixo de `fleeHpFraction` foge; em Fuga sem saída volta a lutar
- [X] T033 [P] [US4] Teste em `packages/shared/test/ai/states.test.ts`: puxado além do raio máximo entra em Retorno, volta à zona e ignora provocação por `returnIgnoreS`; `enrage(untilTick)` deixa qualquer temperamento agressivo até o tick; imobilizado (sono, congelamento, paralisia que trava), cast travado e recuo entram em Incapacitado e não decidem nada até se recuperar; Reposicionamento sai de golpe em preparação e contorna obstáculo

### Implementation

- [X] T034 [US4] Transições por temperamento a partir de `content/ai/temperaments.json` em `packages/shared/src/ai/controller.ts` (campos `onSeePlayer`, `onHurt`, `fightWeight`, `fightWhenCornered`, `toleranceTiles`, `chaseLimitTiles`)
- [X] T035 [US4] Estados Fuga, Retorno, Reposicionamento, Incapacitado e esquiva (`dodgeChance`, `reactionS`) em `packages/shared/src/ai/controller.ts` e `action.ts` (R9)
- [X] T036 [US4] Limiar de fuga por HP vindo do perfil e do temperamento em `packages/shared/src/ai/controller.ts`
- [X] T037 [US4] Ligar o escape de Poké Ball a `controller.enrage` em `packages/server/src/capture.ts` e `packages/server/src/ai.ts`, usando `states.angryAfterEscapeS` e mantendo `angryOnEscapeChance` do spec 15
- [X] T038 [US4] Migrar a leitura de temperamento das espécies para `content/ai/temperaments.json`, remover `packages/shared/src/wild/temperament.ts` (`stepAi`) e seus testes antigos, e ajustar `content/wild/temperaments.json` e `packages/server/src/wild-loader.ts` para o que sobrar

---

## Phase 7: User Story 5 - Alvo estável em grupo (P2)

**Goal**: o selvagem escolhe quem atacar de forma compreensível, sem trocar o tempo todo.

**Independent Test**: 4 adversários com ameaça oscilando e contagem de trocas de alvo.

- [X] T039 [P] [US5] Teste em `packages/shared/test/ai/threat.test.ts`: dano recebido, proximidade e quem atacou primeiro somam conforme `tuning.threat`; ameaça decai por `decayPerS`; oscilação abaixo de `targetSwitchMargin` não troca; margem superada troca; empate vai ao menor `entityId`; em 600 ticks de oscilação o alvo muda 0 vezes dentro da margem
- [X] T040 [US5] `packages/shared/src/ai/threat.ts` com a tabela e a histerese (R7)
- [X] T041 [US5] Usar a tabela de ameaça na escolha de alvo de `controller.ts` (substitui "mais próximo" do T019) e alimentá-la com dano recebido em `packages/server/src/ai.ts`
- [X] T042 [US5] Descartar alvo, ameaça e memória de adversário que morre, sai do mapa ou desconecta em `packages/shared/src/ai/controller.ts`

---

## Phase 8: User Story 6 - Depuração visível (P2)

**Goal**: ver estado, alvo e raciocínio de cada IA; reproduzir sessões com as mesmas decisões.

**Independent Test**: sobreposição ligada numa luta confere com o estado interno; duas reproduções geram o mesmo log.

### Tests

- [X] T043 [P] [US6] Teste do protocolo v11 (`debugAi` e `aiDebug` válidos; `aiDebug` com `target`/`lastSeen`/`chosenSlot` nulos; mensagem malformada rejeitada) em `packages/shared/test/game/protocol.test.ts` e `packages/server/test/malformed.test.ts`
- [X] T044 [P] [US6] Teste em `packages/server/test/ai-debug.test.ts`: cliente sem `debugAi` não recebe `aiDebug`; ligado recebe a 4 Hz só IAs da área a ≤ 20 tiles, com as pontuações da última decisão
- [X] T045 [P] [US6] Teste de determinismo em `packages/server/test/ai-replay.test.ts`: duas reproduções da mesma gravação geram `decisionLog` idêntico (segue `determinism.test.ts`); IA não usa `Math.random` nem `Date`

### Implementation

- [X] T046 [US6] Protocolo 10 → 11 conforme [contracts/game-protocol-v11.md](contracts/game-protocol-v11.md) em `packages/shared/src/game/protocol.ts` e `packages/shared/src/protocol-version.ts`; ajustar testes e fixtures que fixam a versão
- [X] T047 [US6] Enviar `aiDebug` por cliente em `packages/server/src/session.ts` e `packages/server/src/ai.ts`
- [X] T048 [US6] `decisionLog` em memória e opção `aiLog` do host (JSONL, desligada por padrão) em `packages/server/src/ai.ts` e `packages/app/src/server-host/entry.ts`
- [X] T049 [US6] Receber `aiDebug` em `packages/client/src/net/game-connection.ts` e desenhar cone, última posição, raio da zona, estado, alvo e pontuações em `packages/client/src/render/ai-overlay.ts`
- [X] T050 [US6] Ligar/desligar a sobreposição com o painel de debug existente e textos em `packages/client/src/GameSession.svelte` e `packages/client/src/i18n/pt-BR.ts`
- [ ] T051 [US6] Verificar à mão na Route 29 (skill `run-soulsilver`): cone, "!", mudança de estado, última posição ao quebrar a visão atrás de árvore, raio da zona e pontuações (passos 5 do [quickstart.md](quickstart.md)) — parcial (2026-10-25): cone, raio da zona e estado conferidos na Route 29; o "!" no app ainda não foi visto (coberto por `wild.test.ts` e `controller.test.ts`)

---

## Phase 9: User Story 7 - Controlador reutilizável (P3)

**Goal**: o spec de treinadores reaproveita o controlador trocando perfil e ligando troca/item.

**Independent Test**: perfil novo em dados funciona sem código e os ganchos existem e não fazem nada.

- [X] T052 [P] [US7] Teste em `packages/shared/test/ai/reuse.test.ts`: perfil com `source: "trainer"` e `aiFlags` carrega e se comporta como os demais; `chooseSwitch` e `chooseItem` existem, são chamados no ponto de decisão e não alteram o input; `sight.ts` responde "este ponto vê aquele" sem controlador nem combate
- [X] T053 [US7] Expor `AiHooks` (`chooseSwitch`, `chooseItem`, padrão `undefined`) e chamá-los no ponto de decisão de `packages/shared/src/ai/controller.ts`
- [X] T054 [US7] Documentar em `packages/shared/src/ai/index.ts` (comentário curto) os pontos de extensão para o spec de treinadores, sem mapear flags originais

---

## Phase 10: Polish & cross-cutting

- [X] T055 Dormência e escalonamento: teste `packages/server/test/ai-perf.test.ts` (IA a mais de `dormantTiles` de todo jogador não executa nada; fase por `entityId % período`; 30 IAs ativas e 4 jogadores ficam abaixo de `performance.budgetMsPerTick`) e implementação em `packages/server/src/ai.ts` (R10)
- [X] T056 Revisar `packages/server/test/combat-perf.test.ts` e `perf.test.ts` para incluir o custo da IA e garantir que o tick de 50 ms não regride
- [X] T057 Teste de que nenhum arquivo de IA importa `electron`, `three` ou `svelte` (simulação isolada, princípio IV) em `packages/shared/test/ai/isolation.test.ts`
- [X] T058 Rodar `npm run typecheck`, `npm run lint` e `npm test` na raiz e corrigir o que falhar
- [X] T059 Executar o [quickstart.md](quickstart.md) por completo e registrar o resultado das 100 lutas e do orçamento em `specs/019-combat-ai/quickstart.md`

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 (bloqueia tudo) → histórias.
- **US1** (percepção, estados básicos, integração em `wild.ts`) é o MVP e vem primeiro.
- **US2** depende de US1 (estado Combate); **US3** depende de US2 (os perfis só importam com escolha de golpe).
- **US4** depende de US1; **US5** depende de US1 e troca a escolha de alvo do T019.
- **US6** depende de US1 (decisões existentes) e de US2 (pontuações a exibir); o protocolo (T046) pode começar após a Phase 2.
- **US7** depende de US1; é pequena e pode correr junto de US4 ou US5.
- Polish (T055 a T059) depende das histórias desejadas.
- Dentro de cada história: testes (falhando) → implementação → integração.

## Parallel Opportunities

- Phase 1: T002 e T003.
- Phase 2: T004, T006 e T009 (testes) em paralelo.
- US1: T012 a T015 em paralelo; depois T016, T017 e T018 (arquivos diferentes) em paralelo.
- US2: T022 e T023. US4: T032 e T033. US6: T043, T044 e T045.
- Após US1: US4, US5 e US7 podem andar em paralelo (arquivos de teste diferentes; `controller.ts` é compartilhado, então integrar um de cada vez).

## Implementation Strategy

1. **MVP**: Phases 1, 2 e 3 (US1). Um selvagem agressivo percebe, avisa e luta no jogo.
2. **Incremento 2**: US2 e US3 fecham o núcleo de dificuldade e SC-006 (≥ 90% de vitória).
3. **Incremento 3**: US4 e US5 (temperamentos, fuga, grupo).
4. **Incremento 4**: US6 (depuração e reprodução) e US7 (reuso), depois Polish.
5. Cada marco precisa de `typecheck`, `lint` e testes verdes antes de marcar tarefas (Fluxo de Desenvolvimento da constituição).
