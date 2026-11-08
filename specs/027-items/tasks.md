---

description: "Tarefas do spec 027: Itens"
---

# Tasks: Itens

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: obrigatórios pela constituição (princípio V). Teste de lógica é escrito e falha antes da implementação. UI e render (seletor rápido, mochila, Dowsing) ficam isentos de test-first, mas cada mudança visível tem captura na camada 4 ou roteiro na camada 5. A camada 3 (golden e `items:coverage`, local) e as 6 capturas da camada 4 fecham o spec.

**Format**: `- [ ] [ID] [P?] [Story?] Descrição com caminho`

**Ordem das fases**: US8 → US1 → US3 → US2 → US4 → US6 → US5 → US7 (plano, princípio XI). A mochila (US8) vem primeiro porque tudo passa por ela; o chão (US6) antes das árvores (US5) porque o caminho até Violet City precisa dele. Os rótulos seguem o spec.

**Risco**: T001 a T004 sondam a ROM e podem mudar o escopo de US5 e US6 (research R6 a R8). Não comece US5 nem US6 antes de eles terminarem.

## Phase 1: Setup (sondagem)

- [X] T001 Descobrir (decomp pret/pokeheartgold, fora do repositório, e a extração local) e registrar em `specs/027-items/research.md` (R6): se `packages/extractor/src/events/` já extrai itens do chão (objeto com script de pegar item) e escondidos (evento de fundo), com item e flag; listar os escondidos das rotas 29 a 31 como alvo da camada 3. Se faltar, abrir tarefa em Phase 2
- [X] T002 [P] Descobrir e registrar em `research.md` (R7): onde estão os dados de crescimento de berry (tempos por estágio, produção min e max) e de rebrota de apricorn; se o extrator já lê; se não, decidir `content/items/berries.json` à mão com a origem citada
- [X] T003 [P] Descobrir e registrar em `research.md` (R8): como o script do Kurt usa apricorns e quais comandos faltam em `packages/extractor/src/events/command-table.ts` e `packages/shared/src/script/handlers/`; o prazo original e a tabela apricorn → bola; a tabela de achados do companheiro por lugar (está na ROM?)
- [X] T004 [P] Rodar `graphify query "combat trainer action cooldown party member held item pp"` e registrar em `research.md` (R3, R5) os pontos exatos de `packages/server/src/combat.ts` onde entram a ação do treinador e os ganchos de segurados (cálculo de dano, pós-dano, status, tick), e confirmar que o membro do grupo não tem `held` nem `ppUps` (`packages/shared/src/save/schema.ts`)
- [X] T005 [P] Conferir contra os dados extraídos (`items.json`) os limites originais por bolso e pilha de R1 e a duração em passos de Repel, Super Repel e Max Repel; anotar divergências em `research.md`

## Phase 2: Foundational (bloqueia todas as histórias)

- [X] T006 [P] Teste vermelho de schema em `packages/shared/test/items/schemas.test.ts`: `effects.json`, `tuning.json`, `held.json`, `pockets.json`, `kurt.json` recusam arquétipo ou gatilho desconhecido, tempo ou recarga negativos, `ppUp.perLevel` fora de 0..1 e bolso fora de `POCKET_KEYS`; erro com arquivo, campo e problema
- [X] T007 Schemas zod em `packages/shared/src/items/schemas.ts`, exportados de `packages/shared/src/index.ts`, e os arquivos iniciais em `content/items/` (`effects.json`, `tuning.json`, `held.json`, `pockets.json`, `kurt.json`); `content/companion/finds.json` conforme T003
- [X] T008 [P] Teste vermelho da migração em `packages/shared/test/save/migrate-v11.test.ts`: save v10 sintético migra para v11 com `held: null` e `ppUps: [0,0,0,0]` em cada membro do grupo e do PC, `trees: []`, `kurt: null`, `repel: null`, `lastFind: {}` e o resto intacto; ida e volta com uma árvore, uma encomenda do Kurt e um segurado; recusa `ppUps` fora de 0..3, `held` de item-chave, `repel.level` fora de 1..3 e `tree` repetida ([contracts/save-v11.md](contracts/save-v11.md))
- [X] T009 Subir `SAVE_SCHEMA_VERSION` para 11 em `packages/shared/src/save/schema.ts` com os campos de [data-model.md](data-model.md), migração `10:` em `packages/shared/src/save/migrate.ts` e atualizar fixtures de save, `newProgress` e `coherence.ts`
- [X] T010 [P] Teste vermelho do protocolo v21 em `packages/shared/test/game/protocol-v21.test.ts`: aceita e recusa cada mensagem de [contracts/protocol-v21.md](contracts/protocol-v21.md) (`use-item-combat`, `use-item` com `moveIndex` 0..3, `set-held`, `plant-tree`) e recusa mensagem v20 e campo desconhecido
- [X] T011 Adicionar as mensagens em `packages/shared/src/game/protocol.ts` e `PROTOCOL_VERSION` 21 em `packages/shared/src/protocol-version.ts`; o servidor responde "ação recusada" a tudo novo até as histórias implementarem; adicionar os `NoticeCode` novos
- [X] T012 [P] Carregador dos arquivos de `content/items/` em `packages/server/src/items-loader.ts`, no molde de `combat-loader.ts`, com erro claro de schema; teste em `packages/server/test/items-loader.test.ts`

**Checkpoint**: contratos, migração e dados carregáveis prontos.

## Phase 3: User Story 8 - Mochila completa e cobertura (P2)

**Objetivo**: porta única da mochila com os limites originais; relatório de cobertura.

**Teste independente**: `npm run items:coverage` e os testes de limite por bolso.

- [X] T013 [P] [US8] Teste vermelho em `packages/shared/test/items/bag.test.ts`: `canAdd`/`addItem`/`removeItem` respeitam espécies por bolso e pilha por bolso (TM/HM 99, demais 999), derivam o bolso do item, recusam item desconhecido e remoção maior que a posse, e não mudam a mochila em caso de recusa
- [X] T014 [US8] Implementar `packages/shared/src/items/bag.ts` (puro) e `packages/server/src/bag.ts`; religar `GiveItem`, `TakeItem`, `HasItem`, `HasSpaceForItem` (`packages/shared/src/script/handlers/items.ts` e o host em `packages/server/src/scripts.ts`), `packages/server/src/shop.ts` e `packages/server/src/pc.ts` a ela, removendo a checagem de limite duplicada (`BAG_ITEM_MAX` em `packages/shared/src/economy`)
- [X] T015 [P] [US8] Teste vermelho em `packages/server/test/bag-server.test.ts` (harness): pedido de cada caminho (script, loja, PC) com bolso cheio é recusado e a mochila fica idêntica; correio e acessório são guardados no bolso certo e sem efeito de uso
- [X] T016 [P] [US8] Teste vermelho em `packages/shared/test/items/coverage.test.ts` com fixture sintética: lista item sem arquétipo, segurado sem gatilho, e falha se algum item do conjunto obtível estiver na lista
- [X] T017 [US8] Implementar `scripts/items-coverage.ts` e o script `items:coverage` em `package.json` (molde de `content/combat/coverage.json` e `packages/server/test/combat-coverage.test.ts`); conjunto obtível calculado de eventos, lojas e presentes extraídos até Violet City (R10)
- [X] T018 [US8] Cliente: tela da mochila com os 8 bolsos em `packages/client/src/game/Bag.svelte`, ligada a `PauseMenu.svelte` e `menu-page.ts`; textos em `packages/client/src/i18n/pt-BR.ts`

## Phase 4: User Story 1 - Usar itens durante o combate (P1) 🎯 MVP

**Objetivo**: usar Potion, item de status e item de batalha em combate, como ação do treinador.

**Teste independente**: Potion em luta no harness: tempo de uso, dano recebido, cura e recarga.

- [X] T019 [P] [US1] Teste vermelho em `packages/server/test/items-combat.test.ts` (harness): Potion cura só ao fim do tempo de uso e o item é decrementado só então; o Pokémon leva dano durante o uso; segundo uso antes do fim da recarga é recusado; item sem posse é recusado e a mochila não muda; desmaio durante o uso cancela sem gastar; dois pedidos simultâneos do último item aceitam só um
- [X] T020 [P] [US1] Teste vermelho em `packages/shared/test/items/effects.test.ts`: arquétipos `heal`, `revive`, `status-cure` e `battle-stat` leem `partyUse.params` e devolvem o efeito; status ausente recusa sem gastar; cura acima do máximo para no máximo
- [X] T021 [US1] Implementar `packages/shared/src/items/effects.ts` e despachar `useItem` em `packages/server/src/items.ts` por arquétipo (fora de combate); recusar arquétipo só de combate no mapa
- [X] T022 [US1] Implementar `TrainerAction` e a recarga do treinador em `packages/server/src/combat.ts`, a mensagem `use-item-combat` em `packages/server/src/session.ts` e o estado `itemUse`/`itemCooldownUntilTick` no snapshot (`packages/server/src/replication.ts`); tempos de `content/items/tuning.json`
- [X] T023 [US1] Cliente: seletor rápido em `packages/client/src/game/ItemWheel.svelte`, aberto por tecla e por botão do gamepad, sem tirar o controle de movimento e ataque (`packages/client/src/input/`), ligado a `GameSession.svelte` e `game-connection.ts`
- [X] T024 [US1] Registrar em `docs/balance-log.md` o tempo de uso e a recarga de cada arquétipo (não existem no original) e o padrão `lockMovement`; valor original (turno), novo e motivo
- [X] T025 [US1] Camada 4: captura `01-item-wheel.png` (seletor rápido em combate) em `.evidence/027/` pelo driver da skill `run-soulsilver` (save do slot 3)

**Checkpoint**: MVP: o jogador usa itens em combate.

## Phase 5: User Story 3 - Itens segurados funcionam sozinhos (P1)

**Objetivo**: berries e itens segurados agem sem comando.

**Teste independente**: Oran Berry consumida ao cruzar o limiar de HP numa luta do harness.

- [X] T026 [P] [US3] Teste vermelho em `packages/shared/test/items/held.test.ts`: um teste por gatilho de `held.json` (`hp-threshold`, `status`, `regen`, `damage-mod`, `survive`, `speed-mod`, `once-per-fight`) com o efeito esperado; consumível some, não consumível permanece; HP zero não dispara berry
- [X] T027 [P] [US3] Teste vermelho em `packages/server/test/held.test.ts` (harness): berry segurada consumida sozinha ao cruzar o limiar durante a luta, com `held-consumed` e o número de cura; berry de status removida ao receber o status; Leftovers cura a cada 1 s de luta; Focus Sash sobrevive uma vez
- [X] T028 [US3] Implementar `packages/shared/src/items/held.ts` (gatilhos puros) e `packages/server/src/held.ts`; ligar os ganchos em `packages/server/src/combat.ts` (dano, pós-dano, status, tick) e em `trainer-battle.ts` para o time do treinador
- [X] T029 [P] [US3] Teste vermelho em `packages/server/test/set-held.test.ts` (harness): `set-held` move mochila ↔ membro, recusa sem o item, item-chave e membro inexistente; o item some da mochila ao ser dado e volta ao ser tirado
- [X] T030 [US3] Implementar `set-held` em `packages/server/src/session.ts` e a interface de dar/tirar em `Bag.svelte` e `PauseMenu.svelte`; mostrar o segurado no resumo do Pokémon
- [X] T031 [US3] Cliente: número de cura na tela ao consumir (`held-consumed`) em `packages/client/src/render/game-renderer.ts` e `packages/client/src/audio/reactions.ts`
- [X] T032 [US3] Preencher `content/items/held.json` com os `holdEffect.id` obtíveis até Violet City (guiado pelo relatório de T017) e registrar em `docs/balance-log.md` cada efeito adaptado do turno ao tempo real
- [X] T033 [US3] Camada 4: captura `02-berry-consumed.png` (berry consumida, número de cura na tela) em `.evidence/027/`

## Phase 6: User Story 2 - Ether, Elixir, PP Up e PP Max (P1)

**Objetivo**: itens de PP agem sobre cooldowns. (No spec são a US2; aqui vêm depois de US3 por depender do mesmo despacho.)

**Teste independente**: usar cada um dos quatro itens e conferir cooldown e registro.

- [X] T034 [P] [US2] Teste vermelho em `packages/shared/test/items/pp.test.ts`: Ether reduz a recarga restante de um golpe em `ether.seconds`; Elixir faz o mesmo em todos; PP Up sobe `ppUps` até 3 e a recarga base vira `base ÷ (1 + 0,2·n)`; PP Max vai direto a 3; PP Up com 3 recusa sem gastar
- [X] T035 [US2] Implementar o arquétipo `pp-ether` e `pp-up` em `packages/shared/src/items/effects.ts`; aplicar `ppUps` na recarga base em `packages/shared/src/combat/` (`baseCooldownS`) e em `packages/server/src/combat.ts`; `use-item` com `moveIndex` em `session.ts`
- [X] T036 [P] [US2] Teste vermelho em `packages/server/test/pp-items.test.ts` (harness): os quatro itens em combate e fora dele mudam o cooldown conforme o dado; sem `moveIndex` os itens de golpe único são recusados
- [X] T037 [US2] Registrar em `docs/balance-log.md` Ether, Elixir, PP Up e PP Max: regra original, reinterpretação, razão `0,2` e motivo (research R4)

## Phase 7: User Story 4 - TMs, HMs e pedras de evolução (P2)

**Objetivo**: ensinar golpes e evoluir com pedras.

**Teste independente**: compatibilidade contra learnset e evoluções extraídos (sintéticos na CI).

- [X] T038 [P] [US4] Teste vermelho em `packages/shared/test/items/teach.test.ts`: TM compatível com o learnset ensina e é consumida; HM ensina e não é consumida; incompatível e golpe já sabido recusam sem gastar; com 4 golpes exige escolha de qual esquecer
- [X] T039 [P] [US4] Teste vermelho em `packages/shared/test/items/evolve.test.ts`: pedra evolui só quem tem `use-item` (e `-male`/`-female` conforme o sexo) para ela e é consumida; pedra em quem não evolui recusa sem gastar
- [X] T040 [US4] Implementar os arquétipos `teach` e `evolve` em `packages/shared/src/items/effects.ts` lendo `learnsets` e `evolutions` extraídos; ligar ao fluxo existente `learn-answer` e `evolve-answer` em `packages/server/src/progression.ts`
- [X] T041 [P] [US4] Teste vermelho em `packages/server/test/teach-evolve.test.ts` (harness): TM com 4 golpes pede a escolha por `learn-answer`; pedra dispara a evolução pelo mesmo caminho da evolução por nível; mochila e golpes só mudam após a resposta
- [X] T042 [US4] Cliente: escolha do golpe a esquecer e confirmação da evolução reaproveitando as telas existentes (`SwapPicker.svelte`, tela de evolução) a partir da mochila em `Bag.svelte`
- [X] T043 [US4] Camada 4: capturas `03-tm-teaching.png` e `04-stone-evolution.png` em `.evidence/027/`

## Phase 8: User Story 6 - Itens no chão, escondidos e achados (P2)

**Objetivo**: pegar itens do chão, achar escondidos com o Dowsing e receber achados do companheiro.

**Teste independente**: dois jogadores; A pega, B ainda encontra; a sonda acha os escondidos das rotas 29 a 31.

- [X] T044 [P] [US6] Se T001 achou lacuna: teste vermelho em `packages/extractor/test/events/stage.test.ts` com fixture sintética de objeto de item e evento escondido (item, flag, posição) e estender `packages/extractor/src/events/stage.ts` e `layout.ts`; recusar posição fora do mapa
- [X] T045 [P] [US6] Teste vermelho em `packages/server/test/world-items.test.ts` (harness, 2 a 4 jogadores): A pega item do chão e a flag de A marca; B ainda o vê e pega; mochila cheia deixa o item no mundo com aviso `bag-full`; escondido sem Dowsing é pego só no ponto exato
- [X] T046 [US6] Garantir em `packages/server/src/scripts.ts` e `relevance.ts` que o item do chão e o escondido usam a porta da mochila (T014) e a flag por jogador, e que a visibilidade do item acompanha a flag do jogador
- [X] T047 [P] [US6] Teste vermelho em `packages/server/test/dowsing.test.ts`: `dowse` devolve a direção (0..359) e a proximidade (0..1) do escondido não coletado mais próximo dentro de `dowsing.radius`; nada fora do raio ou sem o Dowsing MCHN; escondido já coletado pelo jogador não conta, o de outro jogador conta
- [X] T048 [US6] Implementar `packages/server/src/dowsing.ts` (no máximo a cada 200 ms por jogador), enviar `dowse` no snapshot e desenhar a indicação em `packages/client/src/render/game-renderer.ts`
- [X] T049 [P] [US6] Teste vermelho em `packages/server/test/finds.test.ts` (relógio injetado): o companheiro traz um item da tabela do lugar a cada `everySeconds`, pela porta da mochila; mochila cheia adia; lugar sem tabela não traz; `lastFind` persiste
- [X] T050 [US6] Implementar `packages/server/src/finds.ts` ligado a `companion.ts` e ler `content/companion/finds.json`; registrar em `docs/balance-log.md` a origem da tabela se for à mão
- [X] T051 [US6] Camada 4: captura `05-dowsing.png` (Dowsing apontando um item) em `.evidence/027/`

## Phase 9: User Story 5 - Berries, apricorns e Kurt (P2)

**Objetivo**: ciclo das árvores e encomendas do Kurt.

**Teste independente**: relógio injetado avança uma árvore por todos os estágios e o prazo do Kurt.

- [X] T052 [P] [US5] Teste vermelho em `packages/server/test/trees.test.ts` (relógio injetado): ciclo `plantado → brotando → crescendo → florescendo → frutos` pelos tempos de `berries.json`; colheita dá a quantidade dentro de `yield{min,max}` e volta ao ciclo; relógio do host voltando não regride nem duplica frutos; estado por jogador (A colhe, B não muda); apricorn rebrota e não se planta
- [X] T053 [US5] Implementar `packages/server/src/trees.ts` e a mensagem `plant-tree` em `session.ts`; colher pela interação existente com a árvore (`scripts.ts`) via porta da mochila; estado em `trees` do save
- [X] T054 [P] [US5] Teste vermelho em `packages/server/test/kurt.test.ts` (relógio injetado): apricorn entregue gera encomenda da bola correta com `ready` no prazo; antes do prazo recusa com `kurt-not-ready`; depois entrega a bola pela porta da mochila; encomenda em andamento segue o comportamento original (T003)
- [X] T055 [US5] Implementar `packages/server/src/kurt.ts` e os comandos de script faltantes (T003) em `packages/shared/src/script/handlers/` e no host de `scripts.ts`
- [X] T056 [P] [US5] Teste vermelho em `packages/server/test/ball-modifiers.test.ts`: cada bola especial de `content/wild/balls.json` (Fast, Level, Lure, Heavy, Love, Friend, Moon) aplica o modificador original na captura (`packages/server/src/capture.ts`), com os casos de condição (`fast`, `level`, `moon`)
- [X] T057 [US5] Corrigir `content/wild/balls.json` ou `capture.ts` onde T056 falhar (Level, Lure, Heavy, Love e Friend aparecem com `mult: 1` sem condição, a conferir contra o original)
- [X] T058 [US5] Camada 4: captura `06-kurt-apricorns.png` (Kurt recebendo apricorns) em `.evidence/027/`

## Phase 10: User Story 7 - Repel e itens de campo (P3)

**Objetivo**: Repel por jogador e itens de campo no mapa.

**Teste independente**: com Repel, selvagem de nível menor não se aproxima; o efeito acaba no prazo.

- [X] T059 [P] [US7] Teste vermelho em `packages/server/test/repel.test.ts` (harness, relógio injetado): selvagem de nível menor que o do companheiro do jogador não se aproxima nem ataca; nível igual ou maior age normalmente; o teto de spawns perto do jogador cai por `repel.density`; outro jogador sem Repel não é afetado; expira no prazo (também ao carregar o save); selvagem já em combate não muda
- [X] T060 [US7] Implementar o arquétipo `repel` em `packages/shared/src/items/effects.ts`, o estado `repel` em `session.ts`, o teto em `packages/server/src/wild.ts` e a passividade em `packages/server/src/ai.ts`; durações em `tuning.json` convertidas de passos (T005)
- [X] T061 [P] [US7] Teste vermelho em `packages/server/test/field-items.test.ts` (harness): item de campo permitido (Escape Rope, cura fora de combate) funciona no mapa; item só de combate é recusado no mapa; item de campo é recusado em combate
- [X] T062 [US7] Implementar o arquétipo `field` em `packages/server/src/items.ts` ligado a `packages/server/src/field.ts`; aviso de fim do Repel no cliente (`Play.svelte`)
- [X] T063 [US7] Registrar em `docs/balance-log.md` a duração do Repel (passos → tempo) e o efeito (sem encontro aleatório)

## Phase 11: Polish e fechamento

- [X] T064 [P] Camada 3: estender `packages/app/golden/` com o cenário de uso de cada item da mochila ao fim do caminho dourado (`campaign.golden.ts`, `field.golden.ts`) e a sonda do Dowsing nas rotas 29 a 31 conforme os eventos extraídos; rodar `npm run golden`
- [X] T065 Camada 3: rodar `npm run items:coverage` e confirmar que nenhum item obtível até Violet City está sem efeito; completar `effects.json` e `held.json` até limpar
- [ ] T066 [P] Camada 5: roteiro manual escrito em `specs/027-items/quickstart.md` e executado: seletor rápido com gamepad sem perder o controle do Pokémon; anotar o resultado
- [X] T067 [P] Conferir que `.evidence/027/` tem as 6 capturas (01 a 06) e está no `.gitignore`
- [X] T068 [P] Rodar `npm run typecheck`, `npm run lint`, `npm test` e `npm run check:assets`; corrigir
- [X] T069 Rodar `graphify update .` e atualizar `docs/balance-log.md` com a revisão final dos desvios listados no plano (Constitution Check, princípio I)

## Dependências e ordem

- Phase 1 → Phase 2 → US8 → US1 → US3 → US2 → US4 → US6 → US5 → US7 → Polish.
- US1 depende de Phase 2 e de T014 (porta da mochila). US3 e US2 dependem do despacho de US1 (T021, T022). US4 depende do despacho de US1 e do fluxo de progressão. US5 depende de T014, T053 depende de T002 e T055 de T003. US6 depende de T001 e T014. US7 depende de T005.
- Testes vermelhos (`[P]`) vêm antes da implementação da mesma história.

## Execução paralela (exemplos)

- Phase 1: T002, T003, T004, T005 juntas após T001.
- US1: T019 e T020 juntas; depois T021 e T022.
- US6: T044, T045, T047, T049 juntas.
- Polish: T064, T066, T067, T068 juntas.

## Estratégia

MVP = Phases 1, 2, US8 e US1 (itens em combate sobre a mochila validada). Depois US3 e US2 (estratégia de combate), US4, US6, US5 e US7. Cada história fecha com seus testes vermelhos verdes e a captura da camada 4 correspondente.

## Notas e relatórios

(relatórios das camadas 3 e das sondagens são anexados aqui conforme as fases terminam)

## Phase 12: Convergence

- [ ] T070 Descobrir a que mapa pertence o item escondido 8001 no tile (572,390) da matriz (listado nos eventos dos mapas 33 e 34, mas fora da grade de ambos), pela decomp ou pela matriz de mapas; corrigir limites ou dono em `packages/server/src/scripts.ts` ou na extração, e fazer a sonda do Dowsing em `packages/app/golden/items.golden.ts` passar, conforme SC-007, US6/AC3 (partial)
- [X] T071 Levar itens segurados e PP Ups aos spawns de `packages/server/src/trainer-battle.ts` (o `item` extraído do time do treinador, linha 172; `held`/`cooldownMul` do Pokémon do jogador, linha 266), com teste no harness, conforme FR-007, US3/AC3 (partial)
- [X] T072 Atualizar `specs/027-items/contracts/save-v11.md`, `contracts/protocol-v21.md` e `data-model.md` ao implementado (`held`/`ppUps` opcionais, `apricorns`, `apricornTrees`, `berryPots`, `kurt`, `repel`; `berry-plant`/`berry-harvest`, `items-state`, `dowse`, `berry-pots`, `apricorn-box`, `item-found`, `debugSetStatus`, evento `held`; `effects.json` + `tuning.json` + `finds.json`, limites dos bolsos no código), conforme plan: Contratos (partial)
- [X] T073 Rodar os cenários de `packages/app/golden/items.golden.ts` sobre a mochila do fim de `campaign.golden.ts`, não sobre um save novo, conforme Como testar camada 3 ("ao fim do caminho dourado") (partial)
- [ ] T074 Executar o roteiro da camada 5 (seletor rápido com gamepad) de `specs/027-items/quickstart.md` e anotar o resultado; se o D-pad esquerdo empurrar o Pokémon, impedir que ele se mova enquanto o seletor estiver em uso em `packages/client/src/GameSession.svelte`, conforme T066, Manual (missing)
- [X] T075 Aplicar o Repel em `fights()` de `packages/server/src/ai.ts` só a selvagens ainda não engajados, com teste, conforme o Edge Case "Repel termina no meio de uma luta" (partial)
- [ ] T076 Capturar o seletor de apricorns do Kurt (`06b-kurt-choice.png`, cores e quantidades) em `.evidence/027/`, conforme US5/AC3 (partial)
- [X] T077 Justificar em `specs/027-items/research.md` os acréscimos fora do plano (`debugSetStatus`, checagem de limites do `debugWarp`, buffer de texto `move`, bolas de item marcando a hide flag) (unrequested)
