---

description: "Tarefas do spec 026: Tempo e Pokégear"
---

# Tasks: Tempo e Pokégear

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: obrigatórios pela constituição (princípio V). Teste de lógica é escrito e falha antes da implementação. Render e UI ficam isentos de test-first, mas cada mudança visível tem captura na camada 4 ou roteiro na camada 5. A camada 3 (extensão do caminho dourado, local) e as 9 capturas da camada 4 fecham o spec.

**Format**: `- [ ] [ID] [P?] [Story?] Descrição com caminho`

**Ordem das fases**: US1 → US2 → US4 → US3. US4 (ligações e revanche) vem antes de US3 (abas do Pokégear) porque a extensão do caminho dourado precisa do telefone e não do rádio (plano, princípio XI). Os rótulos seguem o spec.

**Risco**: T001 e T002 sondam a ROM e podem mudar o escopo de US4 e do rádio (research R7). Não comece US4 antes de eles terminarem.

## Phase 1: Setup (sondagem)

- [X] T001 Descobrir na decomp pret/pokeheartgold (fora do repositório) e registrar em `specs/026-time-pokegear/research.md` (R7, perguntas 1 a 3): onde estão a tabela de contatos (id, nome, classe, trainer id, dias e faixas aceitos), os textos de ligação por contato e situação (cumprimento, dica, revanche, aviso de enxame) e o time de revanche (entrada própria na tabela de treinadores? critério de progressão?). Anotar os offsets ou arquivos da ROM e o formato dos registros
- [X] T002 [P] Descobrir e registrar em `research.md` (R7, perguntas 4 e 5): os bancos de texto dos canais do rádio e a ordem dos textos; quais canais têm efeito no jogo e qual; se `GetTimeOfDay` (ou equivalente) existe em `packages/extractor/src/events/command-table.ts`
- [X] T003 [P] Rodar `graphify query "map load script run on map entry weekday visibility flags"` e confirmar em `research.md` (R3) se o servidor roda os scripts de carga do mapa na entrada (`packages/server/src/scripts.ts`, `session.ts`) e se um `debugSetClock` reexecuta os da área atual ou só vale na próxima entrada. Se faltar `GetTimeOfDay`, abrir tarefa em Phase 2
- [X] T004 [P] Rodar `graphify query "trainer rematch team trainer-battles visibility flags"` e anotar em `research.md` (R5) onde `trainer-battles` escolhe o time e a visibilidade por jogador (`packages/server/src/trainer-battle.ts` ou equivalente)

## Phase 2: Foundational (bloqueia todas as histórias)

- [X] T005 [P] Teste vermelho em `packages/server/test/clock.test.ts`: o relógio da sessão com `source` injetado devolve `hour`, `minuteOfDay`, `weekday` (0 = domingo) e `band` coerentes; `set({ kind: "fixed", at })` fixa; `set({ kind: "offset", ms })` desloca; `set({ kind: "host" })` volta à fonte; `band` usa `timeBands` de `content/wild/spawn.json`
- [X] T006 Implementar `createSessionClock` em `packages/server/src/clock.ts`; ligar `hour`/`weekday` das opções de `packages/server/src/session.ts`, `wild.ts`, `capture.ts`, `companion.ts` e o host de scripts em `packages/server/src/scripts.ts` ao mesmo relógio (remove o `new Date()` de `packages/server/src/game-server.ts` linhas 122 e 123 e os padrões `12` e `0` de `session.ts`)
- [X] T007 [P] Teste vermelho de schema em `packages/shared/test/time/schemas.test.ts`: `tint.json` recusa cor fora de 0..1.5, `transitionMinutes` negativo ou não inteiro e faixa faltando (`morning`, `day`, `night`); erro com arquivo, campo e problema
- [X] T008 Schema zod `tintPalette` em `packages/shared/src/time/schemas.ts`, exportado de `packages/shared/src/index.ts`, e `content/time/tint.json` com a paleta inicial (valores visuais ajustados na camada 4)
- [X] T009 [P] Teste vermelho de schema em `packages/shared/test/phone/schemas.test.ts`: `phone.json` e `radio.json` (formato conforme T001 e T002) e `content/radio/channels.json` recusam `effect.kind` desconhecido, `factor` ≤ 0 e canal sem texto; erro com arquivo, campo e problema
- [X] T010 Schemas zod `phoneFile`, `radioFile` e `radioChannels` em `packages/shared/src/phone/schemas.ts` e `packages/shared/src/radio/schemas.ts`, exportados de `packages/shared/src/index.ts`
- [X] T011 [P] Teste vermelho da migração em `packages/shared/test/save/migrate-v10.test.ts`: save v9 sintético migra para v10 com `phone: { contacts: {}, pending: [], log: [] }` e o resto intacto; ida e volta do schema com uma ligação pendente de `kind: "story"`; recusa `rematch` fora de `none|ready|won`, `log` com mais de 20 itens e `pending` de `kind: "contact"` gravada ([contracts/save-v10.md](contracts/save-v10.md))
- [X] T012 Subir `SAVE_SCHEMA_VERSION` para 10 em `packages/shared/src/save/schema.ts` com o campo `phone` ([data-model.md](data-model.md)), migração `9:` em `packages/shared/src/save/migrate.ts` e atualizar fixtures de save, `newProgress` e `coherence.ts`
- [X] T013 [P] Teste vermelho do protocolo v20 em `packages/shared/test/game/protocol-v20.test.ts`: aceita e recusa cada mensagem de [contracts/protocol-v20.md](contracts/protocol-v20.md) (`clock`, `phone-call`, `phone-state`, `radio-state`, `gear-map`, `phoneDial`, `phoneAnswer`, `radioTune`, `gearOpen`, `gearClose`, `debugSetClock`), incluindo `debugSetClock` com `hour` fora de 0..23
- [X] T014 Adicionar as mensagens em `packages/shared/src/game/protocol.ts` e `PROTOCOL_VERSION` 20 em `packages/shared/src/protocol-version.ts`; o servidor responde "ação recusada" a tudo novo até as histórias implementarem
- [X] T015 [P] Teste vermelho em `packages/server/test/dev-clock.test.ts` (harness): em build de desenvolvimento com `devTools`, `debugSetClock` com `fixed`, `advance` e `host` muda o relógio e todos os jogadores recebem `clock`; fora disso nada muda e o log registra; `advance` soma minutos ao relógio atual
- [X] T016 Implementar `debugSetClock` em `packages/server/src/session.ts` com o mesmo portão `devTools` dos comandos do spec 025, enviando `clock` a todos os jogadores

**Checkpoint**: relógio único, contratos, migração e comando de dev prontos.

## Phase 3: User Story 1 - Ver o dia passar no mapa (P1) 🎯 MVP

**Objetivo**: mapas externos com tonalidade contínua por hora; interiores e cavernas sem; a faixa e as tabelas de spawn trocam para todos os jogadores.

**Teste independente**: fixar o relógio em manhã, dia e noite e comparar a tonalidade do mesmo ponto externo e de um interior.

- [X] T017 [P] [US1] Teste vermelho em `packages/shared/test/time/band.test.ts`: `timeOfDay(h, bands)` dá a faixa original para cada hora de 0 a 23 (manhã 4–9, dia 10–19, noite 20–3), com `bands` de `spawn.json` e com bandas alteradas
- [X] T018 [P] [US1] Teste vermelho em `packages/shared/test/time/tint.test.ts`: `tintAt(minuteOfDay, palette)` vale a cor da faixa no meio dela; é contínua nos 1440 minutos (`|tint(m+1) − tint(m)| ≤ ε`, inclusive na virada da meia-noite); a transição se centra em cada limite e dura `transitionMinutes`; `transitionMinutes: 0` salta só no limite
- [X] T019 [US1] Implementar `tintAt` em `packages/shared/src/time/tint.ts` e a mesma faixa por `timeOfDay` de `packages/shared/src/wild/time-of-day.ts` (única fonte, FR-002)
- [X] T020 [P] [US1] Teste vermelho em `packages/server/test/field-time.test.ts` (harness, 2 a 4 jogadores, relógio injetado): ao mudar o relógio de dia para noite, a faixa muda e `createWilds` passa a sortear da tabela da noite para todos os jogadores da sessão; os dois recebem `clock` com a mesma hora; a troca por `debugSetClock` não derruba ninguém
- [X] T021 [US1] Enviar `clock` ao entrar, na troca por comando e a cada 5 s de relógio real em `packages/server/src/session.ts`; garantir que `packages/server/src/wild.ts` lê a faixa do relógio da sessão
- [X] T022 [US1] Cliente: guardar o instante do relógio e avançá-lo localmente entre mensagens em `packages/client/src/net/game-connection.ts`; aplicar `tintAt` aos mapas `outdoor` e nada a `indoor` e `cave` (pelo `areaType` já enviado) em `packages/client/src/render/game-renderer.ts`, com transição gradual contínua ao cruzar a faixa
- [X] T023 [US1] Registrar em `docs/balance-log.md` o desvio de fidelidade da tonalidade (R2): original troca a paleta do modelo 3D, aqui multiplica a cor da cena; valor original, valor novo e motivo
- [X] T024 [US1] Camada 4: capturas `01-morning.png`, `02-day.png`, `03-night.png` (mesmo ponto de New Bark, relógio fixado por `debugSetClock`) e `04-indoor-night.png` (interior à noite, sem tonalidade) em `.evidence/026/` pelo driver da skill `run-soulsilver` (save do slot 3); ajustar `content/time/tint.json` se a leitura visual pedir

**Checkpoint**: MVP: o dia e a noite aparecem e o mundo muda com eles.

## Phase 4: User Story 2 - Eventos por dia da semana e horário (P1)

**Objetivo**: NPCs e scripts que só valem em certos dias e horários, como nos dados originais.

**Teste independente**: fixar o dia certo e um errado e conferir que o NPC aparece só no certo.

- [X] T025 [P] [US2] Teste vermelho em `packages/shared/test/script/weekday.test.ts`: um script sintético com `GetWeekday` e ramo por dia define a flag de visibilidade só no dia esperado, para os 7 dias (0 a 6); com `host.weekday()` injetado; e o mesmo para a leitura de horário (se T002/T003 mostrarem que falta `GetTimeOfDay`, o handler entra nesta fase)
- [X] T026 [US2] Trocar o atalho `ScrCmd_379` (o `GetTimeOfDay` do original) em `packages/shared/src/script/handlers/center.ts`, que hoje devolve sempre 2, pela faixa RTC da hora da sessão via `host.hour()`: 0 `MORN` 4–9, 1 `DAY` 10–16, 2 `EVE` 17–19, 3 `NITE` 20–23, 4 `LATE` 0–3 (`gf_rtc.c`, research R7.6), em `packages/shared/src/script/host.ts` e `packages/server/src/scripts.ts`; conferir a ordem dos valores do enum em `include/gf_rtc.h` da decomp
- [X] T027 [P] [US2] Teste vermelho em `packages/server/test/field-weekday.test.ts` (harness, 2 jogadores): no dia certo o NPC do mapa sintético aparece e roda o script; em qualquer dos outros 6 dias não aparece; a entrada no mapa reavalia a condição; o dia do jogador A não afeta a visibilidade do jogador B além do relógio da sessão ser o mesmo
- [X] T028 [US2] Garantir no servidor que os scripts de carga do mapa leem o relógio da sessão e rodam na entrada (e, se T003 decidiu, após `debugSetClock`) em `packages/server/src/session.ts` e `packages/server/src/scripts.ts`
- [X] T029 [US2] Camada 3: estender `packages/app/golden/field.golden.ts` (ou arquivo vizinho em `packages/app/golden/`) com a sonda de eventos por dia: varrer o `script.json` extraído por `GetWeekday`/horário nos mapas até Violet City, listar cada evento encontrado e, para cada um, fixar o dia certo e um errado por `debugSetClock`, entrar no mapa e conferir que o NPC aparece só no dia certo; incluir o relatório com a lista no `tasks.md`

**Checkpoint**: os eventos por dia do trecho até Violet City estão provados.

## Phase 5: User Story 4 - Receber ligações e aceitar revanches (P2)

**Objetivo**: telefone com contatos, ligações com os textos originais, fila que espera o jogador ficar livre e revanche por jogador. Só começa depois de T001 e T002.

**Teste independente**: registrar o Joey, avançar o relógio, receber a ligação de revanche e vencer o time de revanche.

- [X] T030 [P] [US4] Extrator: teste vermelho em `packages/extractor/test/phone/stage.test.ts` (ROM sintética): lê `contacts[]`, `calls[]` e `rematchTrainerId` no formato de T001; recusa registro truncado e referência a trainer id inexistente; `radio.json` conforme T002
- [X] T031 [US4] Extrator: implementar o estágio `phone` em `packages/extractor/src/phone/` (leitor, offsets, `phone.json`, `radio.json`) registrado em `packages/extractor/src/stages.ts` (ou onde os estágios são listados); `loadScripts`/loader em `packages/app/src/server-host/scripts-loader.ts` expõe `phone` e `radio`; arquivo inválido é registrado e deixado de fora
- [X] T032 [P] [US4] Teste vermelho em `packages/shared/test/phone/calls.test.ts` (regra do original, research R7.3): `callDue(state, steps, mapId, rng)` não liga antes de 10 passos; a partir daí rola 50% por passo; a camada é 0/1/2 com 50/30/20%; só contatos registrados da camada e de `type` 0, 10, 11, 12 ou 14; exclui contato do mesmo mapa e os que já ligaram na rodada (a rodada zera quando todos ligaram); gatilho de história tem prioridade; com `rng` semeado é determinística
- [X] T033 [US4] Implementar `callDue` e as regras de contato em `packages/shared/src/phone/calls.ts` e `packages/shared/src/phone/contacts.ts`
- [X] T034 [P] [US4] Teste vermelho em `packages/server/test/phone-queue.test.ts` (harness, relógio injetado): uma ligação que chega com o jogador em combate só é entregue depois do fim do combate; o mesmo com cutscene (script em curso) e com o menu aberto; duas pendentes saem uma de cada vez, em ordem; uma chamada em curso trava a seguinte; ligação de história sobrevive a reconexão (save) e a sorteada se perde
- [X] T035 [US4] Implementar `packages/server/src/phone.ts`: fila por jogador, avaliação a cada passo de tile do jogador (research R7.3, corrige R4) e a cada fim de estado ocupado, só em mapa que aceita ligações (cabeçalho), entrega só com `field.busy(id)` falso e sem chamada em curso, `phone-call` ao cliente, `phoneDial` e `phoneAnswer` validados (contato registrado, chamada do jogador, `choice` válida; recusa com "ação recusada")
- [X] T036 [P] [US4] Teste vermelho em `packages/server/test/phone-handlers.test.ts`: `RegisterGearNumber` registra o contato no save do jogador; `CheckRegisteredPhoneNumber` responde 1 e 0 conforme o registro; `GetPhoneBookRematch` devolve 0 sem `seeking` e, com `seeking`, o id do primeiro `_N` não vencido pelo jogador dentro do grupo liberado (flag `FLAG_UNK_97B + N`), e para o contato 16 (Kenji) só de dia (research R7.4); `ScrCmd_379` devolve a faixa RTC de 5 valores da hora da sessão; `SetPhoneCall` e `RunPhoneCall` entregam a ligação pelo telefone (bloco `call`) em vez de caixa de texto; chamada desconhecida continua `unsupported`
- [X] T037 [US4] Trocar os atalhos de `packages/shared/src/script/handlers/story.ts` (linhas 48 a 62, incluindo `SCRIPTED_CALLS` do Elm) por chamadas ao host (`registerContact`, `isRegistered`, `rematchState`, `enqueueCall`) implementadas em `packages/server/src/scripts.ts` sobre `phone.ts`; remover os comentários `shortcut:` correspondentes
- [X] T038 [P] [US4] Teste vermelho em `packages/server/test/phone-rematch.test.ts` (harness, 2 jogadores A e B): a ligação de revanche (`scriptType` REMATCH) aceita por A liga `seeking` só para A; o script do NPC, via `GetPhoneBookRematch`, inicia a batalha de A com o treinador `_2` extraído; B continua recebendo 0 e o time original; vencer `_2` faz a próxima revanche de A ser `_3` só se o grupo 3 estiver liberado; vencer desliga `seeking`; contato não registrado é recusado
- [X] T039 [US4] Implementar a revanche (research R7.4, corrige R5): `seeking` por contato no save do jogador e a tabela de revanche (lida do overlay 26 ou escrita à mão com ids e origem citada) em `packages/server/src/phone.ts`; sem mudança em `packages/server/src/trainer-battle.ts`, que já recebe o id do script; ajustar `contacts[id].rematch` de [data-model.md](data-model.md) e [contracts/save-v10.md](contracts/save-v10.md) para `seeking: boolean`
- [X] T040 [US4] Cliente: tela de chamada (`CallScreen.svelte`) com as linhas do texto original, a escolha de aceitar a revanche e a resposta `phoneAnswer`, em `packages/client/src/gear/CallScreen.svelte`; integrar ao diálogo do `GameSession.svelte`; chaves em `packages/client/src/i18n/pt-BR.ts`
- [X] T041 [US4] Camada 3: estender `packages/app/golden/campaign.golden.ts` (extensão do caminho dourado) com: depois do marco do Joey na Route 30 (página 4 do detonado), registrar o número dele, avançar o relógio por `debugSetClock`, receber a ligação de revanche com o texto extraído e vencer a revanche com o time de revanche extraído; e conferir que a ligação do Prof. Elm depois do Mr. Pokémon chega pelo telefone novo (`phone-call`), não por caixa de texto. Seguir o detonado em `walkthrough-reference` da memória
- [X] T042 [US4] Camada 4: captura `09-incoming-call.png` em `.evidence/026/` pelo driver da skill `run-soulsilver`

**Checkpoint**: telefone e revanche funcionam; a extensão do caminho dourado cobre Joey e Elm.

## Phase 6: User Story 3 - Usar o Pokégear (P2)

**Objetivo**: quatro abas (mapa, telefone, rádio, relógio) e o efeito dos canais na densidade de spawns.

**Teste independente**: abrir cada aba e conferir o conteúdo contra os dados extraídos e o estado do jogador.

- [X] T043 [P] [US3] Teste vermelho em `packages/shared/test/radio/channels.test.ts` (research R7.5, corrige R6): o Pokémon Music toca March ou Lullaby conforme o dia da semana (segunda, sexta, domingo sem o GB Sounds e quarta sem a National Dex dão March; terça, sábado e quinta sem a National Dex dão Lullaby); `capFor(base, players)` usa o fator `(40 + Δ) / 40` da música (March +25 dá 1.625, Lullaby −25 dá 0.375); outros programas não mudam; vários jogadores na área tiram a média (quem não ouve conta 1); arredondamento por `round`
- [X] T044 [US3] Escrever `content/radio/channels.json` (efeito por música, `march: 25`, `lullaby: -25`, origem `src/field/encounter_check.c`; programas e bancos 409 a 420) e implementar a escolha da música e `capFor` em `packages/shared/src/radio/channels.ts`
- [X] T045 [P] [US3] Teste vermelho em `packages/server/test/radio.test.ts` (harness, 2 jogadores): `radioTune` com canal de efeito aumenta (ou reduz) o teto de spawns da área só enquanto o jogador está nela; desligar ou sair da área volta ao normal; o canal de A não altera a área de B em outro mapa; canal inexistente é recusado; o canal não vai ao save e zera ao desconectar
- [X] T046 [US3] Implementar `packages/server/src/radio.ts` (canal por jogador, `radio-state`) e o multiplicador de teto em `packages/server/src/wild.ts` (usa os jogadores da área em `step`); registrar o desvio de fidelidade do rádio (R6) em `docs/balance-log.md`
- [X] T047 [P] [US3] Teste vermelho em `packages/server/test/gear.test.ts` (harness, 2 jogadores): `gear-map` devolve a posição do jogador, os lugares visitados dele e a posição dos outros jogadores da sessão (sem os de outra sessão), e nunca o estado privado de outro jogador; o jogador com o Pokégear aberto conta como menu (`busy`) para as ligações
- [X] T048 [US3] Implementar `gearOpen`/`gearClose`, `gear-map` e `phone-state` em `packages/server/src/session.ts` (reaproveita o estado público de `OnlinePanel` e `flyPoints` como "visitados")
- [X] T049 [US3] Cliente: `Gear.svelte` com as quatro abas em `packages/client/src/gear/` (`MapTab.svelte` a partir de `packages/client/src/FlyMap.svelte`, `PhoneTab.svelte`, `RadioTab.svelte`, `ClockTab.svelte` com hora e dia da semana), `"gear"` em `packages/client/src/game/menu-page.ts`, entrada no `PauseMenu.svelte`, chaves em `packages/client/src/i18n/pt-BR.ts`
- [X] T050 [US3] Camada 4: capturas `05-gear-map.png`, `06-gear-phone.png`, `07-gear-radio.png`, `08-gear-clock.png` em `.evidence/026/` pelo driver da skill `run-soulsilver`
- [X] T051 [US3] Camada 5 (manual): ler um canal do rádio no app e confirmar que os textos estão legíveis e na ordem original; registrar o resultado em "Notas e relatórios" abaixo

**Checkpoint**: as quatro abas funcionam e o rádio muda os spawns.

## Phase 7: Polish e fechamento

- [X] T052 [P] `npm run typecheck`, `npm run lint` e `npx vitest run` limpos (a execução completa e as duas falhas instáveis conhecidas de `extractor/test/maps/stage.test.ts` e `extractor/test/cli.test.ts`: conferir sozinhas se falharem)
- [X] T053 [P] Rodar `npm run golden` e anexar o relatório em "Notas e relatórios"; o Joey, o Elm e todos os eventos por dia até Violet City passam
- [X] T054 [P] Conferir que as 9 capturas existem em `.evidence/026/` (01 a 09) e que a pasta está no `.gitignore`
- [X] T055 Passar o quickstart de [quickstart.md](quickstart.md) do início ao fim e corrigir o que divergir
- [X] T056 Rodar `graphify update .` para manter o grafo atual

## Dependências e ordem

- Phase 1 (T001 a T004) antes de tudo que depende de formato de ROM: T009, T030 em diante, T036, T044 e T041.
- Phase 2 bloqueia as histórias. Dentro dela, T005 → T006, T007 → T008, T009 → T010, T011 → T012, T013 → T014 e T015 → T016 (cada par: teste vermelho e implementação).
- US1 e US2 dependem só da Phase 2 e podem ir em paralelo. US4 depende de T001, T002, T010, T012, T014 e T006. US3 depende de US4 (`phone-state`, o `PhoneTab`) e de T002.
- Dentro de cada história: teste vermelho → implementação → cliente → camadas 3, 4 e 5.
- Camada 3 (T029, T041, T053) exige a ROM e `SOULSILVER_ROM`; nunca na CI.

## Execução paralela (exemplos)

- Phase 2: T005, T007, T009, T011, T013 e T015 são testes em arquivos diferentes e rodam em paralelo.
- US1: T017 e T018 em paralelo; depois T019; depois T020.
- US4: T030, T032, T034, T036 e T038 são testes em arquivos diferentes.

## Estratégia

MVP = Phases 1 a 3 (relógio, tonalidade e faixa para todos). Depois eventos por dia (US2), telefone e revanche (US4) e as abas e o rádio (US3). O spec só fecha com as camadas 1 e 2 na CI, a extensão do caminho dourado passando local, as 9 capturas e o roteiro manual do rádio.

**Se T001 ou T002 não acharem os dados** (research R7): reduzir US4 ao Joey e ao Elm, que a extensão do caminho dourado exige, com os outros contatos como ligação genérica; reduzir o rádio aos canais cujos textos foram achados. Registrar o corte no spec e em "Notas e relatórios".

## Notas e relatórios

### Phase 1 (2026-11-07)

Resultado completo em [research.md](research.md) (R7 e R9). A decomp pret/pokeheartgold foi lida num clone raso no scratchpad da sessão, fora do repositório.

- **T001.**
  - Contatos em `tel/pmtel_book.dat`: arquivo próprio, com registros de 20 bytes e revanche por dia e faixa. O Joey é o contato 10 e faz revanche na segunda-feira de dia.
  - Textos e roteiros de ligação: tabelas `const` no overlay 101.
  - Revanche: `sTrainerRematchSets` no overlay 26, que aponta para os treinadores `_2` a `_4` da tabela de treinadores.
  - A revanche é por script (`GetPhoneBookRematch` devolve o id).
  - Ligação aleatória: conta passos (10, depois 50% por passo), não minutos.
- **T002.** Rádio:
  - Bancos 409 a 420, um por programa; a escolha das falas é código.
  - Efeito no jogo: March +25 e Lullaby −25 na taxa de encontro, tocados no Pokémon Music conforme o dia.
  - Unown e Hoenn/Sinnoh mudam espécies (os sons de Hoenn e Sinnoh ficam fora do escopo).
  - `ScrCmd_379` é o `GetTimeOfDay`, hoje um atalho que devolve 2. O original tem 5 faixas RTC.
- **T003.** `enterMap` em `scripts.ts` já roda `onTransition`, `onLoad` e `onResume`. Uma mudança de relógio vale na próxima entrada do mapa.
- **T004.** `trainer-battle.ts` já recebe o id do treinador pelo script; não precisa mudar para a revanche.

**Tarefas corrigidas pelos achados:** T032, T035, T036, T038, T039, T043 e T044. T026 passa a ser obrigatória (`ScrCmd_379`).

**Ainda em aberto:**
- Os offsets das tabelas do overlay 101 (roteiros) e do overlay 26 (revanche) não foram procurados. Se a busca falhar em T031, ficam as tabelas de ids escritas à mão, com a origem citada.
- `plan.md`, `data-model.md` e os contratos ainda dizem "minuto de relógio" e `rematch: none|ready|won`. Corrigir junto com T035 e T039.

### Phase 2 (2026-11-07)

**Relógio único (T005, T006).**
- `createSessionClock` em `packages/server/src/clock.ts`. A sessão recebe `now?: () => Date` no lugar de `hour` e `weekday`; `game-server.ts` passa `() => new Date()`.
- Sem `now`, vale `SUNDAY_NOON`: os testes continuam sem depender da hora. A guarda de determinismo proíbe `new Date(` em `session.ts`.
- Spawns, captura, companheiro e o host de scripts leem o mesmo relógio.
- Bug achado pelo teste: `setTime` alterava o `Date` da fonte; `now()` agora devolve sempre uma cópia.

**Schemas e dados (T007 a T010).**
- `shared/src/time` (paleta) e `content/time/tint.json`.
- `shared/src/phone` (`phone.json` extraído: contatos, roteiros e conjuntos de revanche).
- `shared/src/radio` e `content/radio/channels.json` (12 programas com seus bancos, `baseRate` 40, March +25, Lullaby −25).
- Exportados como `@soulsilver/shared/time`, `/phone` e `/radio`, no padrão de subcaminhos do pacote (o `index.ts` raiz não reexporta `field` nem os demais).
- **Mudança de forma em relação ao plano**: não existe `radio.json` extraído. Os textos do rádio já estão no catálogo, e o que muda o jogo é a música (research R7.5). T030 e T031 só extraem `phone.json`.

**Save v10 (T011, T012).**
- Campo `phone` (`contacts`, `seeking`, `called`, `pending`, `log`), ver [contracts/save-v10.md](contracts/save-v10.md).
- `newProgress()` inclui `newPhone()`.
- Os testes de migração v5 a v9, `schema`, `coherence`, `migrate` e os saves dos harnesses (server e app) foram atualizados para a v10.

**Protocolo 20 (T013, T014).**
- Mensagens de [contracts/protocol-v20.md](contracts/protocol-v20.md). `debugSetClock` leva `clock: { mode, … }` aninhado, porque a união discriminada por `type` não aceita dois membros com o mesmo `type`.
- `phoneDial`, `phoneAnswer`, `radioTune`, `gearOpen` e `gearClose` respondem `action-refused` até as histórias.

**`debugSetClock` (T015, T016).**
- Mesmo portão dos comandos do spec 025 (`scripts.allowDev`: `devTools` e o depurador ligado), e todos os jogadores recebem `clock`.
- Sem scripts carregados, o comando é recusado e registrado no log.

**Verificação.**
- `npm run typecheck`: 0 erros.
- `npx vitest run`: 3.390 de 3.390 testes (328 arquivos). Numa segunda execução completa, `trainer-perf.test.ts` (orçamento de 0,5 ms por tick) falhou uma vez; sozinho, passa nas duas tentativas. É sensível à carga da máquina e não toca o código desta fase.
- `eslint` nos arquivos tocados: 1 erro (`@typescript-eslint/unbound-method` em `session.ts:275`, `log: options.log` do `createNpcs`). Ele já existe no `HEAD` e não vem desta fase.

### Phase 3, US1 (2026-11-07)

**Fonte única das faixas (FR-002).**
- O companheiro tinha a própria `timeOfDay(hour)` com 4/10/20 fixos em `shared/companion/reactions.ts`. Ela foi removida.
- O companheiro agora recebe `time: () => TimeOfDay`, que a sessão calcula de `spawn.json` (`BUNDLED_TIME_BANDS` em `wild-loader.ts` quando não há dados de selvagens).
- O áudio do cliente escolhia a música noturna pelo relógio do PC de cada jogador (`new Date()`). Agora usa o relógio da sessão.

**Tonalidade (T017 a T019).**
- `tintAt(minuteOfDay, bands, palette)` e `runClock(sample, elapsedMs)` em `shared/src/time/tint.ts`.
- Testes: as 24 horas, o meio de cada faixa, metade do caminho em cada limite, a janela centrada, continuidade nos 1.440 minutos com a meia-noite incluída, transição 0 e o relógio rodando no cliente.

**Servidor (T020, T021).**
- `clock` sai na entrada (logo após o `welcome`) e a cada 100 ticks (5 s).
- `field-time.test.ts`: 2 e 4 jogadores; de dia nascem Sentret e Rattata, depois da troca para a noite só Hoothoot, e todos recebem o mesmo `clock`.

**Cliente (T022).**
- `game-connection.ts` guarda o último `clock`; `clockAt(now)` o faz andar.
- `game-renderer.ts` ganhou uma camada `mix-blend-mode: multiply` abaixo do fade e da escuridão de caverna (`setTint`).
- `GameSession.svelte` aplica a tonalidade só quando o cabeçalho diz `areaType: "outdoor"`.
- A multiplicação de cor não clareia; por isso a paleta usa canais até 1.

**T023.** Desvio registrado em `docs/balance-log.md`.

**Camada 4 (T024).** Capturas em `.evidence/026/`:
- `01-morning.png`, `02-day.png` e `03-night.png`: mapa 60, (200, 168), segunda-feira às 7h, 13h e 22h, fixadas por `debugSetClock`.
- `04-indoor-night.png`: mapa 61, à noite, sem tonalidade.
- Conferidas a olho: a manhã fica quente, o dia neutro, a noite azulada e escura, e o interior com as cores normais.
- O slot 3 estava vazio. Gravei nele uma cópia do slot 1 com o nome `Teste026`, parada em New Bark. O slot 1 só foi lido.
- O driver precisa de uma espera de cerca de 1,2 s antes de clicar no slot. Numa primeira tentativa, o clique chegou cedo e o app abriu o slot 1.

**Verificação.**
- `npx vitest run`: 3.430 de 3.430 testes (332 arquivos).
- typecheck: 0 erros.
- eslint nos arquivos tocados: limpo, menos o `_name` sem uso em `client/src/audio/reactions.ts:45`, que já existe no `HEAD`.

(Relatório do `npm run golden` e roteiro manual do rádio: a preencher.)

### Phase 4, US2 (2026-11-07)

- **T025/T026.** `ScrCmd_379` agora lê a hora da sessão por `host.hour()` e devolve a faixa RTC. A ordem conferida em `include/gf_rtc.h` é MORN 0, DAY 1, EVE 2, NITE 3 e LATE 4. Bate com o texto da tarefa e com `sTimeOfDayByHour`. O handler continua em `center.ts`, onde já estava.
- **T027/T028.** Não precisou de código novo no servidor: os scripts de carga já rodam na entrada (R9), e o host passou a receber `hour` da sessão. O teste passou de primeira. Para provar que ele pega o erro, travei o `weekday` do host em 2: 7 dos 8 casos falharam. Uma mudança de relógio vale na próxima entrada no mapa, como no original.
- **T029.** A sonda fica em `packages/app/golden/time.golden.ts`. Ela segue o código de cada script de carga a partir da entrada (os arquivos inteiros têm `GetWeekday` também em scripts de conversa). Depois roda os 7 dias por `debugSetClock`, sem insígnias e com todas. Cada script confere uma insígnia antes do dia. Relatório (`npm run golden`, extração local):

```
ok  mapa 60, pessoa 6 (flag 638, script 842:6), sem insígnias: aparece nunca
ok  mapa 60, pessoa 6 (flag 638, script 842:6), com todas: aparece terça
ok  mapa 33, pessoa 10 (flag 519, script 225:0), sem insígnias: aparece nunca
ok  mapa 33, pessoa 10 (flag 519, script 225:0), com todas: aparece terça
ok  mapa 67, pessoa 5 (flag 638, script 850:10), sem insígnias: aparece nunca
ok  mapa 67, pessoa 5 (flag 638, script 850:10), com todas: aparece segunda, quarta, sexta
ok  mapa 135, pessoa 0 (flag 745, script 859:0), sem insígnias: aparece todo dia
ok  mapa 135, pessoa 0 (flag 745, script 859:0), com todas: aparece domingo, terça, quarta, quinta, sexta, sábado
8 de 8 eventos por dia até Violet City
```

  - **Os eventos:** Tuscany na Route 29 (Insígnia Zephyr, terça), `FLAG_HIDE_CAMERON` em New Bark (Insígnia Plain, terça) e em Cherrygrove (Insígnia Plain, segunda, quarta e sexta), e o Falkner no ginásio (com a Insígnia Soul e sem o número dele, fora às segundas). Os dias esperados estão na sonda, com o script da decomp citado. Um evento novo nos dados sem dia esperado reprova a sonda.
  - **Pendente para a Phase 5:** com o número do Falkner registrado, o original o tira às quartas (`CheckRegisteredPhoneNumber`). `GetPhoneBookRematch` também entra no mesmo script. Os dois ainda são atalhos em `story.ts` (T037), por isso a sonda não cobre esse ramo. Acrescentar o caso "registrado" depois do T037.

### Phase 5, US4 (2026-11-07)

- **T030/T031.** O telefone é lido no estágio `events` (versão 8), e não num estágio `phone` novo. Esse estágio já tem o ARM9 e os overlays como entrada, e o servidor já carrega as saídas dele. Não há `radio.json` (R7).
  - **O que é lido, com offsets achados por assinatura na ROM US:** `tel/pmtel_book.dat` (75 contatos), `sPhoneMessageGmm` (ARM9 1082492), `gPhoneCallScriptDef` (overlay 101, 70716, 455 roteiros), `sGenericPhoneCallHeaders` (overlay 101, 73548) e `sTrainerRematchSets` (overlay 26, 524, 63 linhas).
  - **Conferido contra o Joey:** contato 10 (treinador 8, Route 30, revanche segunda de dia, camada 1, banco 675), roteiro 33 (10/10, tipo REMATCH) e a linha de revanche `[8, 8, 279, 280, 510, 0]`.
  - **Mudanças no schema:** as falas dos roteiros são índices no banco do contato que liga (`GetPhoneMessageGmm(callerID)`), e não ids de texto completos; a linha de revanche guarda as 5 colunas.
  - **Cabeçalho de mapa:** ganhou `incomingCalls` (bit 6 do byte 23; estágio `maps` versão 9). Na reextração local, 469 de 540 mapas aceitam ligação.
  - **Carregador:** um `phone.json` inválido é registrado no log e fica de fora.
- **T032/T033.** `callDue` e `pickCallScript` em `shared/phone/calls.ts` seguem `overlay_2_gear_phone.c` e `phone_scripts_generic.c`. `rematchTrainer` em `rematch.ts` é o porte de `TryGetRematchTrainerIdByBaseTrainerId`. As regras de contato ficaram em `calls.ts`; não há `contacts.ts` separado.
  - **Ficaram de fora (`shortcut` no código):** a Buena de madrugada, o Bug-Catching Contest, os presentes, a tomada da Rocket e a exceção do Day-Care. Nenhum deles acontece antes de Violet.
- **T034/T035.** `server/src/phone.ts` cuida do telefone no servidor:
  - **Passos:** conta os passos de tile de cada jogador e rola a ligação em cada um.
  - **Ligação retida:** segura a ligação enquanto o jogador está `busy` (menu, script, combate, batalha de treinador ou decisão, o mesmo predicado do `field`) e toca quando ele fica livre.
  - **Ligação de história e sorteada:** a de história (`pending`) fica no save até ser atendida; a sorteada se perde com a sessão.
  - **Duas ligações de história:** tocam uma de cada vez, cada uma depois do atendimento da anterior. A ordem entre elas é sorteada, como no original (`ov02_02252218` sorteia entre os gatilhos); a tarefa dizia "em ordem".
  - **Gerador próprio:** o telefone tem um gerador separado, então não desloca as rolagens da simulação nem os replays.
- **T036/T037.** Cada comando agora passa pelo host:
  - `RegisterGearNumber`, `CheckRegisteredPhoneNumber` e `GetPhoneBookRematch` (com a regra do Kenji, só de dia).
  - `ScrCmd_462`, que desliga o `seeking`.
  - `SetPhoneCall` e `RunPhoneCall`, que tocam no telefone (bloco `call`) e retomam o script quando a ligação é atendida.

  `SCRIPTED_CALLS` e o `shortcut` dele saíram; Elm e Oak estão em `content/phone/scripted-calls.json`. A ligação de script da mãe (`scriptType` 4, a pergunta da poupança) continua comando faltando, como antes.
- **T038/T039.** A revanche segue o fluxo do original (research R7.4): a ligação REMATCH liga o `seeking` de quem atende. Correções ao plano:
  - **`trainer-battle.ts`:** o plano dizia que não mudaria, mas precisou mudar, porque o nosso servidor não roda o script 953. Falar com o treinador vencido e em `seeking` luta contra o primeiro passo não vencido da linha dele, desde que o grupo (`FLAG_UNK_97B + N`) esteja liberado; a vitória desliga o `seeking` (`ScrCmd_462`).
  - **A oferta do número (953 `_0DCF`, `_0DE4`, `_0DF9`):** também entrou, senão nenhum treinador seria registrado. O treinador oferece depois da primeira vitória e de novo quando o jogador fala com ele sem tê-lo registrado. Ela roda como um script curto montado com os mesmos comandos. "Sim" toca a fanfarra, registra o número e mostra a mensagem 2; "não" mostra a mensagem 3.
  - **Porteira da Radio Tower (fidelidade):** o original só pede revanche depois da Radio Tower (`FLAG_BEAT_RADIO_TOWER_ROCKETS`). Antes disso a ligação do Joey é só conversa (roteiros 30 a 32). A regra foi mantida.
- **T040.** `gear/CallScreen.svelte` mostra a faixa "Ligação de {nome}". O nome é a mensagem 0 do banco do contato, num campo `name` novo em `phone-call`. As falas passam pela caixa de diálogo que já existe, e o `phoneAnswer` vai quando elas terminam. No original a ligação de revanche não faz pergunta (o efeito REMATCH é automático), por isso a ligação não tem escolha de "aceitar".
- **T041 (camada 3), `npm run golden`: 10 de 10 marcos e 14 de 14 checks.**
  - **Elm:** a ligação dele depois do Mr. Pokémon (227:1, que pede a saída para a Route 30, acrescentada ao passo 6) chega como `phone-call` com `0716:33`, nunca como caixa de texto.
  - **Número do Joey:** o Joey oferece o número depois da luta, e o piloto aceita.
  - **Revanche:** roda numa segunda sessão montada a partir do save depois do número, com três substitutos da história posterior: `FLAG_BEAT_RADIO_TOWER_ROCKETS`, a flag do grupo 2 e a equipe no nível 50 (o `JOEY_2` é um Raticate nível 34). O Joey liga pedindo revanche com `0675:10`, o piloto vence o treinador 279 e o `seeking` desliga. O caminho principal não é alterado.
  - **Sonda de dias:** ganhou o caso "com todos os números". O Falkner registrado some às quartas (`CheckRegisteredPhoneNumber`), e passam 12 de 12.
- **T042.** `09-incoming-call.png`: slot 3 em New Bark com o Elm registrado e a ligação 002 dele pendente. Depois de 12 passos aparecem a faixa "Ligação de Prof. Elm" e "H-hello? Teste026?". O app reextraiu a ROM sozinho por causa das versões novas dos estágios, e o `phone.json` saiu do pipeline real.

### Phase 6, US3 (2026-11-07)

- **T043/T044.** Em `shared/radio/channels.ts`:
  - **`musicOf`:** segue `pokemon_music.c`. Domingo sem o GB Sounds, segunda, quarta sem a National Dex e sexta tocam a March; terça, quinta sem a National Dex e sábado tocam a Lullaby.
  - **`listenerFactor`:** vale `(40 + Δ) / 40` só enquanto o Pokémon Music toca. `capFor` tira a média dos jogadores da área (quem não ouve conta 1) e arredonda.
  - **`content/radio/channels.json`:** ganhou as 4 estações de Johto de `RadioShow_TranslateStationID`:
    - Pokémon Music.
    - Pokémon Talk.
    - Trainer Profiles ou That Town, conforme `hora % 2`.
    - Search Party, Radionovela ou Buena's Password, conforme `hora % 3`.

    Os mostradores de Kanto, Ruins of Alph, Rocket e Mahogany vêm depois de Violet e não estão listados.
- **T045/T046.** `server/src/radio.ts` guarda a estação de cada jogador só em memória e manda o `radio-state`.
  - **Teto de spawns:** o `wild.ts` ganhou a opção `cap(area, base)`, e a sessão passa a média dos jogadores da área. No harness, o teto 6 vira 10 com a March numa segunda e 2 com a Lullaby numa terça. O rádio do A não mexe na área do B, desligar volta ao 6, e estação inexistente é recusada.
  - **`balance-log`:** registrei o desvio de fidelidade.
  - **Atalho:** sem National Dex, o Pokémon Music nunca toca Hoenn nem Sinnoh.
- **T047/T048.** O Pokégear no servidor:
  - **`gearOpen`:** conta como menu para as ligações e manda `gear-map`, `phone-state` e `radio-state`.
  - **`gear-map`:** vai a cada 1 s enquanto o Pokégear está aberto. "Visitados" são os `flyPoints` do jogador; dos outros jogadores vão só nome, área e posição.
  - **`gearClose`:** devolve o estado ocupado ao do menu.
  - **`phone-state`:** ganhou `name` por contato.
  - **`phoneDial`:** pode ser feito com o Pokégear aberto; a sessão só recusa durante script ou combate.
- **T049.** O cliente:
  - **Componentes:** `gear/Gear.svelte` com `MapTab`, `PhoneTab`, `RadioTab` e `ClockTab`, a página `"gear"` no menu, o botão "Pokégear" no painel e as chaves em `pt-BR.ts`.
  - **Textos:** os nomes de lugares saem do banco 279 (como no `FlyMap`) e os nomes de contatos do texto 0 do banco de cada um.
  - **Ligar:** "Ligar" faz a ligação de saída, que aparece na `CallScreen`.
  - **Atalho no mapa:** o mapa é uma lista de nomes; o mapa desenhado da região fica para quando os gráficos forem extraídos.
- **T050.** As capturas 05 a 08 estão em `.evidence/026/`: slot 3, New Bark, relógio fixado em segunda às 10h. Conferi as quatro.
- **T051 (camada 5).** Li o Pokémon Music no app. As falas originais do banco 416 aparecem legíveis e na ordem do banco: DJ Ben, a fala de cada dia da semana e as de Hoenn e Sinnoh.
  - **Atalho no rádio:** o original escolhe por código o trecho que vai ao ar, como a fala do dia ou um sorteio por programa. Aqui a aba lista o banco inteiro em ordem.
  - **Fonte:** a fonte pixelada mostra "ê" como "8". Isso já acontecia no banner do menu antes desta fase.

### Phase 7, fechamento (2026-11-07)

- **T052.** `npm run typecheck` não tem erros.
  - **Testes:** `npx vitest run` passou 3542 de 3543. O que falhou é o `server/test/perf.test.ts`, o teste de tempo de tick instável com a suíte inteira, e ele passou 3 de 3 vezes rodando sozinho.
  - **Lint:** `npm run lint` dá 27 erros, todos já presentes no `HEAD`. Comparei arquivo por arquivo contra a versão do `HEAD` e nenhum vem deste spec; ficaram como estavam.
  - **Limpeza:** tirei o `enqueue` e o `ringing` de `server/src/phone.ts`, que eu tinha criado e ninguém usava. Os gatilhos de ligação (`CALL_TRIGGER_*`) não existem antes de Violet.
- **T053.** `npm run golden`: 3 arquivos e 6 testes passando.
  - **Caminho dourado:** 10 de 10 marcos e 14 de 14 checks, entre eles a ligação do Elm pelo telefone, a oferta do número do Joey e a revanche dele.
  - **Sonda de dias:** 12 de 12 eventos por dia até Violet City.
  - **Obstáculos de campo (spec 025):** todos passando.
- **T054.** As 9 capturas (01 a 09) estão em `.evidence/026/`, e `.gitignore` cobre `.evidence/`.
- **T055.** No quickstart corrigi:
  - **Caminhos de teste:** havia `server/test/phone.test.ts` e `extractor/test/phone`, que não existem; agora apontam para os testes reais.
  - **Pré-requisito:** troquei `SOULSILVER_ROM` por `SOULSILVER_DATA` e pela reextração automática.
  - **Camada 3:** descrevi a revanche como ela é, numa segunda sessão com as flags.

  Os quatro comandos das camadas 1 e 2 passam como estão escritos.
- **T056.** `graphify update .` rodado.

## Phase 8: Convergence

- [X] T057 Preencher os buffers de texto das ligações como `phone_scripts_generic.c` (scriptType 1/UNK1 e FLAG): um Pokémon do time do treinador que liga (`getRandomTrainerMon`, slot 10), uma espécie selvagem do mapa do contato pela faixa do dia (`getRandomEncounterSlot`, slot 11) e o nome do lugar do contato (`var0104`), em `packages/server/src/phone.ts`, com teste no harness mostrando as falas 7 a 10 do Joey sem buffer vazio, incluindo os avisos de enxame, conforme FR-010, FR-009 (partial)
- [X] T058 Entregar as ligações de história pendentes por ordem de chegada (FIFO), em vez de sortear entre elas, em `packages/shared/src/phone/calls.ts` (`callDue`), atualizando o teste "story call waiting" e o "one at a time" de `packages/server/test/phone-queue.test.ts`, conforme FR-011 (contradicts)
- [X] T059 Recusar `debugSetClock` de um jogador que não é o host da sessão, mesmo com o depurador ligado em build de desenvolvimento, em `packages/server/src/session.ts`, com um caso em `packages/server/test/dev-clock.test.ts`, conforme FR-016 (contradicts)
- [X] T060 Portar a escolha de roteiro dos chamadores especiais do trecho (Prof. Elm, `phone_scripts_prof_elm.c`; mãe, `phone_scripts_mother.c`) para ligações feitas e recebidas, e cair no texto genérico original do contato quando nenhum cabeçalho vale, em vez do substituto `localScript` em `dial()` de `packages/server/src/phone.ts`, conforme FR-009 (partial)
- [X] T061 Desligar o rádio quando o jogador troca de área (a música do mapa volta, como no original) e mantê-lo ligado ao fechar o Pokégear, em `packages/server/src/radio.ts` e `session.ts`, com um caso em `packages/server/test/radio.test.ts`, conforme o edge case "Rádio ligado ao trocar de mapa ou fechar o Pokégear" (partial)
- [X] T062 Extrair `sGreetingMsgIDs` (overlay 101, os 96 bytes antes de `sGenericPhoneCallHeaders`) e tocar o cumprimento por direção e faixa no começo de cada ligação, em `packages/extractor/src/events/phone.ts` e `packages/server/src/phone.ts`, conforme FR-010, FR-009 (partial)
- [X] T063 Escolher o trecho do Pokémon Music pelo dia da semana (`pokemon_music.c`: mensagem 3 + dia, e as alternativas 10, 11 e 12) em vez de listar o banco inteiro, em `packages/client/src/gear/RadioTab.svelte` e `GameSession.svelte`, mantendo as falas dos outros programas em ordem, conforme FR-014, US3/AC3 (partial)
- [X] T064 Desenhar o mapa da região na aba de mapa do Pokégear, com a posição do jogador e a dos outros (`x`/`y` de `gear-map`), quando os gráficos do mapa da região forem extraídos, em `packages/client/src/gear/MapTab.svelte`, conforme FR-008 (partial)

### Phase 8, Convergence (2026-11-07)

- **T057.** A ligação preenche os buffers de texto como `PhoneCall_InitMsgDataAndBufferNames` e `GearPhoneCall_Generic`:
  - **Slots:** 0 é o jogador; 1 é o nome do contato (buffer `text`); 2 e 3 são os lugares do jogador e do contato (buffer `place`, pelo `mapsec`).
  - **Treinadores:** 10 é um Pokémon do time e 11 uma espécie selvagem do mapa do contato pela faixa do dia (com Good Rod para o Fisherman, e o peixe da noite no quarto slot).
  - **Fallback:** sem time ou sem tabela, o original usa Rattata, e aqui também.
  - **Cliente:** resolve `place` pelo banco 279.
- **T058.** As ligações de história pendentes saem por ordem de chegada (FR-011), e não sorteadas como os gatilhos do original.
- **T059.** `debugSetClock` de quem não é o host é recusado e vai para o log, mesmo com o depurador ligado.
- **T060.** O `content/phone/callers.json` traz as regras do Elm (`PhoneCall_GetScriptId_ProfElm`) e da mãe, por flag, até Violet City. O Elm segue 001, 008, 009, 010, 011, 012, 013 ou 014/015; a mãe 023, 025 ou 026.
  - **Atalho:** a pergunta da poupança da mãe (`scriptType` 4) não foi portada, e a ligação é recusada.
  - **Treinador sem roteiro:** um treinador sem cabeçalho aplicável recusa a ligação, como o `PHONE_SCRIPT_NONE` do original.
- **T061.** O rádio desliga quando o jogador sai da área onde sintonizou (a música do mapa volta) e continua tocando com o Pokégear fechado. A área é conferida a cada tick.
- **T062.** `sGreetingMsgIDs` é extraído do overlay 101 (73452) e o `unkC` de cada contato também, com o estágio `events` na versão 9.
  - **Na ligação:** ela abre com o cumprimento `[linha][faixa × 2 + recebida × 6 + feminino]` do banco 640, menos para a linha 255 (Elm e mãe).
  - **Sonda:** a da revanche passou a ler a última linha da ligação, porque a primeira agora é o cumprimento.
- **T063.** O Pokémon Music diz a mensagem 2 e a fala do dia (`pokemon_music.c`: 3 + dia, 12, 10 e 11). Os outros programas continuam listando o banco em ordem.
- **T064.** A aba do mapa desenha, em SVG, os lugares visitados e o atual a partir das células da matriz de cada mapa (`map-areas`), com o ponto de cada jogador na posição real (`gear/region.ts`, testado).
  - **Atalho:** são retângulos, não a arte do mapa do Pokégear, que ainda não foi extraída. Um jogador dentro de um interior aparece na lista, mas não no desenho.
- **Verificação:** `npx vitest run` passou 3567 de 3567, typecheck e lint dos arquivos da fase limpos, e `npm run golden` passa os 6 testes. As capturas 05, 07 e 09 foram refeitas, e o app reextraiu a ROM por causa do `events` v9.

## Phase 9: Convergence

- [X] T065 Portar o fluxo da mãe (`GearPhoneCall_Mother` em `phone_scripts_mother.c`, `scriptType` 4: a pergunta de guardar dinheiro, com `choices` em `phone-call` e `phoneAnswer.choice`). Ele deve cobrir a ligação de script da Route 30 (227:4, `PhoneCall PHONE_CONTACT_MOTHER, 2, 0`, armada por `VAR_SCENE_ROUTE_30_PHONE_CALL` no laboratório do Elm), hoje um comando faltando que não liga `FLAG_TALKED_TO_MOM_AFTER_NAMING_RIVAL`, e a ligação feita para a mãe depois do nome do rival, hoje recusada. Mexe em `content/phone/scripted-calls.json`, `content/phone/callers.json`, `packages/server/src/phone.ts` e `packages/client/src/GameSession.svelte`. Acrescentar ao caminho dourado (`packages/app/golden/campaign.golden.ts`) a passagem pelo tile do gatilho na Route 30, com a ligação chegando pelo telefone, conforme FR-010, FR-009 (missing)
- [X] T066 Aplicar ao atender os efeitos de `PhoneCall_ApplyGenericNPCcallSideEffect` além da revanche: `UNK1` e `FLAG` ligam ou desligam a flag `param1` do jogador conforme `param0`; `WORD` põe no buffer 4 a mensagem `param1 + LCRandom() % param0` do banco do contato. Em `packages/server/src/phone.ts`, com teste no harness. Os presentes (`ITEM`) continuam de fora, como registrado. Conforme FR-010 (partial)

### Phase 9, Convergence (2026-11-07)

- **T065.** O fluxo da mãe foi portado (`GearPhoneCall_Mother`). Ele é o "roteiro 0" (`PHONE_SCRIPT_NONE`, como no original) em `scripted-calls.json` e na última regra de `callers.json`.
  - **Pergunta:** a ligação de script usa a mensagem 22. A ligação feita para ela abre com a introdução 7 e pergunta com 27 (poupança ligada) ou 28 (desligada), com as escolhas `msg_0271` 8 e 9.
  - **Escolha:** `phoneAnswer.choice` 0 liga e 1 desliga `FLAG_SYS_MOMS_SAVINGS` (0x986). A resposta dela (25 ou 26) chega como uma segunda ligação, e só depois a cena do script segue.
  - **Cliente:** mostra as escolhas sob a última fala.
  - **Caminho dourado:** pisa o gatilho da Route 30 (553, 292; 227:4). A ligação chega com `0664:22`, a escolha "guardar" liga a flag e a cena liga `FLAG_TALKED_TO_MOM_AFTER_NAMING_RIVAL`: 15 de 15 checks, sem comando faltando.
  - **Atalhos:** o `momCallIntroParam` não está nos cabeçalhos extraídos, então todo lugar usa a introdução 7. A poupança não guarda dinheiro (saldo 0) e a fila de presentes da mãe nunca enche.
- **T066.** Ao atender, `UNK1` e `FLAG` ligam ou desligam a flag `param1` do jogador conforme `param0`. `WORD` põe no buffer 4, ao tocar, a mensagem `param1 + rnd % param0` do banco do contato. Os presentes (`ITEM`) continuam de fora.
- **Verificação:** `npx vitest run` passou 3573 de 3574. O que falhou foi o `trainer-perf` instável, que passou 3 de 3 sozinho. Typecheck e lint dos arquivos da fase limpos, e `npm run golden` passa o caminho dourado.
