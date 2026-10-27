# Tasks: Interpretador de scripts

**Input**: `/specs/020-script-interpreter/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)

**Tests**: incluídos. O princípio V (test-first) é obrigatório para o interpretador: cada teste é escrito e falha antes da implementação. Fixtures sintéticas, sem ROM (princípio II).

**Format**: `- [ ] ID [P?] [Story] Descrição com caminho`. Código e comentários em inglês.

## Phase 1: Setup

- [X] T001 Criar as pastas `packages/shared/src/script/` (com `handlers/`), `packages/shared/test/script/` e o export `@soulsilver/shared/script` em `packages/shared/package.json` e `packages/shared/src/index.ts`
- [X] T002 [P] Criar o helper de fixtures `packages/shared/test/script/fixture.ts`: `makeScript(code, labels)` devolvendo um `ScriptFile` sintético válido e um `FakeHost` que grava os efeitos chamados

---

## Phase 2: Foundational (bloqueia todas as histórias)

**⚠️ Nenhuma história começa antes desta fase.**

- [X] T003 Escrever teste vermelho de migração em `packages/shared/test/save/migrate-v5.test.ts`: save v4 sobe para v5 com `flags: []` e `vars: {}` sem perder campos; save v5 com flag duplicada ou fora de 1..65535, ou var fora de 0..65535, é recusado
- [X] T004 Implementar save v5 em `packages/shared/src/save/schema.ts` (`SAVE_SCHEMA_VERSION` 4 → 5; `flags: number[]` com ids únicos 1..65535; `vars: Record<string, number>` com valores 0..65535; `newProgress()` com ambos vazios), `packages/shared/src/save/migrate.ts` e `packages/shared/src/save/coherence.ts`
- [X] T005 [P] Definir `ScriptHost` (efeitos: flags, vars, itens, dinheiro, equipe, warp, áudio, bridge) e os tipos `Request`/`Answer`/`RunState` em `packages/shared/src/script/host.ts` conforme `data-model.md`
- [X] T006 Escrever testes vermelhos do núcleo em `packages/shared/test/script/runner.test.ts`: `step` executa até o bloqueante e devolve `blocked`; `resume` continua; `End` dá `done`; salto para rótulo inexistente dá `aborted`; mais de `MAX_STEPS` (10 000) comandos sem bloqueio dá `aborted`; pilha de chamadas acima de 32 dá `aborted`; um comando fora da tabela de handlers dá `missing` com `{ name, file, entry, index }`
- [X] T007 Implementar `ScriptRunner` em `packages/shared/src/script/runner.ts` (PC, pilha, `cmp`, `result`, `steps`, `snapshot()`) e `packages/shared/src/script/missing.ts` (`MissingCommand`), tratando `{ raw: true }` como faltante; fazer T006 passar
- [X] T008 Adicionar ao protocolo (12 → 13) em `packages/shared/src/game/protocol.ts` e `packages/shared/src/protocol-version.ts` as mensagens de `contracts/protocol-v13.md`: `scriptSay`, `scriptChoice`, `scriptFade`, `scriptWait`, `scriptLock`, `npcs`, `scriptDebug` (servidor→cliente) e `scriptAck`, `scriptChoice`, `debugScript`, `debugSetFlag` (cliente→servidor), com schemas zod; ajustar `packages/shared/test/game/protocol-v11.test.ts` e testes de handshake para a versão 13
- [X] T009 Criar `packages/server/src/scripts.ts` com o carregador de `script-file` e `map-events` sob demanda (cache por arquivo, erro claro de schema como em `packages/server/src/world-loader.ts`) e o registro de um runner por jogador; teste em `packages/server/test/scripts-loader.test.ts`

**Checkpoint**: save v5, núcleo do runner, protocolo 13 e carregador prontos.

---

## Phase 3: User Story 1 — Eventos de história como no original (P1) 🎯 MVP

**Meta**: falar com NPC, ler placa, pisar em gatilho e entrar em mapa dispara o script e o cliente apresenta o resultado.

**Teste independente**: com scripts sintéticos, cada contexto dispara o script, bloqueantes suspendem até a confirmação, não bloqueantes seguem no mesmo tick; no jogo real, introdução até Violet City sem faltantes.

### Testes (vermelhos primeiro)

- [X] T010 [P] [US1] Testes de fluxo em `packages/shared/test/script/flow.test.ts`: `GoTo`, `CallStd`/`Call`, `Return`, `End`, comparação de variável e valor (`<`, `=`, `>`), `If`-salto condicional
- [X] T011 [P] [US1] Testes de flags e variáveis em `packages/shared/test/script/flags.test.ts`: set/clear/check de flag, set/add/sub/copy de variável, faixa 0..65535 (clamp ou erro conforme o original)
- [X] T012 [P] [US1] Testes de mensagem em `packages/shared/test/script/message.test.ts`: mensagem bloqueia até `ack`; substituição de nome do jogador e de itens/espécies; sim/não devolve `result` 0/1; nome e gênero vêm do save sem bloquear (FR-009)
- [X] T013 [P] [US1] Testes de itens e dinheiro em `packages/shared/test/script/items.test.ts`: dar/tirar item, bolsa cheia (`result` falso), checar item, dar/tirar dinheiro dentro de 0..999999
- [X] T014 [P] [US1] Testes de Pokémon em `packages/shared/test/script/pokemon.test.ts`: dar Pokémon (equipe cheia vai ao armazenamento), dar o inicial, curar equipe
- [X] T015 [P] [US1] Testes de mundo em `packages/shared/test/script/world.test.ts`: warp bloqueia até a transição, fade, espera, tocar música/efeito, travar/liberar jogador
- [X] T016 [P] [US1] Testes das ligações em `packages/shared/test/script/bridge.test.ts`: movimento/câmera, batalha contra treinador e Pokémon fixo, loja e PC chamam `host.bridge`; sem suporte do host vira `missing`
- [X] T017 [P] [US1] Testes dos contextos em `packages/server/test/scripts-contexts.test.ts`: interação com NPC e placa na frente do jogador, gatilho em `x,z,w,h` com `variable == value`, `onTransition`/`onLoad` ao entrar, `frames` avaliados ao entrar e quando a variável muda; disparo durante um script é ignorado (FR-012)
- [X] T018 [P] [US1] Testes de bloqueio em `packages/server/test/scripts-blocking.test.ts`: resposta com `id` velho é ignorada, resposta sem pedido pendente é descartada, timeout de 60 s e desconexão descartam o runner e destravam, o tick nunca espera

### Implementação

- [X] T019 [P] [US1] Handlers de fluxo em `packages/shared/src/script/handlers/flow.ts`
- [X] T020 [P] [US1] Handlers de flags e variáveis em `packages/shared/src/script/handlers/flags.ts`
- [X] T021 [P] [US1] Handlers de mensagem, escolha e nome/gênero em `packages/shared/src/script/handlers/message.ts`
- [X] T022 [P] [US1] Handlers de itens e dinheiro em `packages/shared/src/script/handlers/items.ts`
- [X] T023 [P] [US1] Handlers de Pokémon e cura em `packages/shared/src/script/handlers/pokemon.ts`
- [X] T024 [P] [US1] Handlers de warp, fade, espera, áudio e trava em `packages/shared/src/script/handlers/world.ts`
- [X] T025 [P] [US1] Handlers de ligação (`host.bridge`) em `packages/shared/src/script/handlers/bridge.ts`
- [X] T026 [US1] Tabela `nome → handler` e `packages/shared/src/script/index.ts` reunindo T019–T025
- [X] T027 [US1] Implementar o `ScriptHost` do servidor em `packages/server/src/scripts.ts`: efeitos sobre o estado do jogador (flags/vars/bolsa/equipe/dinheiro), conversão de bloqueantes em mensagens `script*`, retomada em `scriptAck`/`scriptChoice`, timeout e descarte na desconexão
- [X] T028 [US1] Disparar os contextos em `packages/server/src/session.ts` (interação, gatilho, entrada de mapa, `frames`), travar/liberar o jogador e impedir runners concorrentes
- [X] T029 [US1] Receber e rotear `scriptAck`/`scriptChoice` em `packages/server/src/connection.ts` (validação de forma, descarte de malformadas com log)
- [X] T030 [US1] Cliente: tratar `scriptSay`/`scriptChoice`/`scriptFade`/`scriptWait`/`scriptLock` em `packages/client/src/net/game-connection.ts`, `packages/client/src/GameSession.svelte` e `packages/client/src/game/DialogBox.svelte`, enviando `scriptAck`/`scriptChoice`; textos via i18n em `packages/client/src/i18n/pt-BR.ts`
- [ ] T031 [US1] Priorizar pelo relatório: ler `events-report.json` da extração, listar comandos usados da introdução até Violet City sem handler e implementar os que faltarem em `packages/shared/src/script/handlers/`; registrar o que ficou de fora em `specs/020-script-interpreter/coverage-gap.md`
- [ ] T032 [US1] Verificação manual (skill `run-soulsilver`): novo jogo, introdução até Violet City, conferir ordem e textos e log de faltantes vazio (SC-001)

**Checkpoint**: MVP — a história roda para um jogador.

---

## Phase 4: User Story 2 — Progresso independente por jogador (P1)

**Meta**: flags e variáveis individuais, persistidas, e NPCs/eventos filtrados por jogador.

**Teste independente**: dois jogadores no mesmo mapa com flags diferentes recebem listas de NPCs diferentes.

- [X] T033 [P] [US2] Teste vermelho em `packages/server/test/scripts-isolation.test.ts`: um jogador conclui evento que levanta a `hideFlag` de um NPC; o NPC some só para ele e continua para o outro; dois runners simultâneos do mesmo script não interferem (SC-002)
- [X] T034 [P] [US2] Teste vermelho em `packages/server/test/save-sync.test.ts` (estender): flags e variáveis sobrevivem a salvar, recarregar e entrar em outra partida; o host recusa save com ids inválidos
- [X] T035 [US2] Filtrar NPCs por `hideFlag === 0 || !flags.has(hideFlag)` em `packages/server/src/replication.ts` e `packages/server/src/relevance.ts`, enviando `npcs` por jogador ao entrar no mapa e quando uma flag muda
- [X] T036 [US2] Zerar as flags temporárias do mapa (faixa de ids de sistema/temporárias, definida em `packages/shared/src/script/handlers/flags.ts`) ao trocar de mapa
- [X] T037 [US2] Marcar o jogador como "ocupado" para os demais enquanto roda script (princípio VII) em `packages/server/src/session.ts` e exibir no cliente em `packages/client/src/render/map-scene.ts`
- [X] T038 [US2] Gravar e carregar flags/vars no fluxo de save em `packages/server/src/session.ts` e `packages/app/src/main/session-controller.ts`, e nova partida iniciando vazia em `packages/client/src/NewGame.svelte` se aplicável

**Checkpoint**: US1 e US2 funcionam juntas em grupo.

---

## Phase 5: User Story 3 — Comando faltante não trava o jogo (P2)

**Meta**: encerramento seguro e log de faltantes.

**Teste independente**: comando injetado sem handler encerra o script, destrava e aparece no log.

- [X] T039 [P] [US3] Teste vermelho em `packages/server/test/scripts-missing.test.ts`: comando fora da tabela e `{ raw: true }` encerram o script, enviam `scriptLock { locked: false }` em até 1 s e gravam `{ time, command, file, entry, index, player }` (SC-003); o segundo jogador não é afetado
- [X] T040 [US3] Implementar o log de faltantes em `packages/server/src/scripts.ts`: agregação por comando com contagem e JSONL opcional na pasta de dados do host (desligado por padrão); mensagem de log legível
- [X] T041 [US3] Teste e tratamento dos casos de borda em `packages/server/test/scripts-edge.test.ts` e `packages/server/src/scripts.ts`: destino de salto/chamada inexistente, laço infinito, pilha cheia e cliente que nunca confirma, todos terminando em destravado + log

**Checkpoint**: nenhuma lacuna de comando causa soft-lock.

---

## Phase 6: User Story 4 — Depuração de scripts (P3)

**Meta**: acompanhar o script e editar flags em desenvolvimento.

**Teste independente**: com o depurador ligado, o comando atual avança; alterar uma flag afeta o próximo evento.

- [X] T042 [P] [US4] Teste vermelho em `packages/server/test/scripts-debug.test.ts`: `scriptDebug` só é enviado a quem ligou `debugScript`; traz arquivo, entrada, PC, comando atual, flags e vars; `debugSetFlag` é recusado com a depuração desligada
- [X] T043 [US4] Implementar `debugScript`/`debugSetFlag`/`scriptDebug` em `packages/server/src/scripts.ts` e `packages/server/src/connection.ts` usando `runner.snapshot()`
- [X] T044 [US4] Painel `packages/client/src/game/ScriptDebug.svelte` (script, comando atual, flags/vars, edição de flag), ligado em `packages/client/src/screens/Settings.svelte` na seção de desenvolvimento e textos em `packages/client/src/i18n/pt-BR.ts`
- [ ] T045 [US4] Verificação manual: abrir o painel durante um evento, ver o comando avançar, alterar uma flag e repetir o evento

---

## Phase 7: Polish

- [X] T046 [P] Teste de desempenho em `packages/server/test/scripts-perf.test.ts`: 4 jogadores executando scripts custam ≤ 1 ms por tick
- [ ] T047 [P] Teste de determinismo/replay: a execução de um script sintético reproduz o mesmo estado em `packages/server/test/replay.test.ts` (estender)
- [X] T048 Executar `typecheck`, `lint` e a suíte inteira; corrigir regressões do protocolo 13
- [X] T049 Rodar a validação de `specs/020-script-interpreter/quickstart.md` de ponta a ponta e atualizar o quickstart com os resultados
- [X] T050 Rodar `graphify update .` para atualizar o grafo

---

## Dependencies & Execution Order

- Setup → Foundational → US1 → (US2, US3 em paralelo) → US4 → Polish.
- US2 depende de US1 (runner, host e `npcs`). US3 depende só do runner (T007) e do host do servidor (T027). US4 depende de T007 e T043.
- Dentro de cada história: testes vermelhos → handlers/implementação → integração → verificação manual.
- T019–T025 são independentes entre si (arquivos distintos); T026 depende de todos.

## Parallel Examples

- **US1 testes**: T010–T018 ao mesmo tempo (arquivos diferentes).
- **US1 handlers**: T019–T025 ao mesmo tempo após os testes.
- **US2 e US3**: depois de T028, T033/T034 e T039 em paralelo.

## Implementation Strategy

1. **MVP**: Phases 1–3 (US1). Entrega a introdução até Violet City para um jogador. Parar e validar com T032.
2. **Incremento 1**: US2 (grupo) — torna o multiplayer coerente.
3. **Incremento 2**: US3 (faltantes) — pode ser feito junto do MVP, pois a lógica base já nasce em T007; aqui entram o log persistente e os casos de borda.
4. **Incremento 3**: US4 (depurador) e Polish.

## Notas da implementação (2026-10-26)

- **Ordem test-first**: o núcleo do runner (T007) foi escrito antes do seu teste (T006); todos os demais grupos tiveram o teste vermelho antes.
- **T011–T016**: os testes dos grupos ficaram em `packages/shared/test/script/groups.test.ts`, mais `table.test.ts`, que roda cada handler com os argumentos da tabela real de comandos.
- **T009**: o carregador ficou em `packages/app/src/server-host/scripts-loader.ts` (o lint proíbe `node:fs` no servidor); teste com a extração local em `packages/app/test/scripts-loader.test.ts`.
- **T029**: as mensagens do cliente são roteadas em `session.ts`, onde ficam as demais; `connection.ts` não muda.
- **T030**: a escolha do inicial é um sim/não por espécie, e fades e sons de script ainda não aparecem no cliente; os dois têm `shortcut:` no código.
- **T035**: o filtro por flag é feito em `session.ts` antes de `replicate`; NPCs passaram a ser entidades `npc`, desenhadas como marcadores até o id gráfico do evento ser ligado à folha `overworld-npc`.
- **T040**: o log de faltantes é a linha no log do servidor mais o JSONL opcional (`SOULSILVER_SCRIPT_LOG`); não há agregação em memória.
- **T041**: os casos de borda estão em `scripts-missing.test.ts`, `scripts-blocking.test.ts` e `runner.test.ts`.
- **T044**: o painel aparece com F3, junto do painel de depuração, e não em Configurações.
- **Abertas**:
  - **T031**: a lista do que falta está em `coverage-gap.md`; o maior bloqueio é o movimento (spec de cutscenes).
  - **T032**: no app, o gatilho da Route 30 disparou, parou em `ScrCmd_609` e destravou o jogador; a conversa com uma pessoa foi verificada só em sessão real sem tela (`scripts-loader.test.ts`), não com a caixa de diálogo na tela.
  - **T045**: o painel apareceu no app; a troca de flag só foi verificada nos testes do servidor.
  - **T047**: o replay não foi estendido.
