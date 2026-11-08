# Tasks: Golpes de campo e locomoção

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: obrigatórios pela constituição (princípio V, test-first): cada teste de lógica é escrito e falha antes da implementação. Render e UI ficam isentos de test-first, mas cada mudança visível tem captura na camada 4 ou roteiro na camada 5. A camada 3 (sonda de campo local) e as 8 capturas da camada 4 fecham o spec.

**Format**: `- [ ] [ID] [P?] [Story?] Descrição com caminho`

## Phase 1: Setup

- [X] T001 Descoberta feita na decomp pret/pokeheartgold (fora do repositório) e registrada em `specs/025-field-moves-locomotion/research.md` (R1): as insígnias estão no código, não numa tabela (vão para `content/field/moves.json` com a origem citada); Flash, Headbutt, Dig e Teleport não exigem insígnia; a escuridão é `weather` 11 do cabeçalho, já extraído; só a tabela de pontos de voo (overlay 101) precisa de offset novo, a descobrir em T011–T012
- [X] T002 [P] Rodar `graphify query "script object interact collision visibility per player"` e anotar em `research.md` onde o servidor decide colisão/visibilidade por jogador (`packages/server/src/session.ts`, `world.ts`, `relevance.ts`) e como o recolhimento do companheiro do spec 014 é chamado (`companion.ts`)

## Phase 2: Foundational (bloqueia todas as histórias)

- [X] T003 [P] Teste vermelho de schema em `packages/shared/test/field/schemas.test.ts` (inclui o `fly-points.json`, que mora no codec dos eventos): `moves.json` recusa `obstacle` fora de `tree|rock|boulder|whirlpool|waterfall|climbWall|darkCave|water|headbuttTree|none`; `fishing.json` recusa `waitS` com min > max, `baseBite`/`friendshipBite` fora de 0..1 e vara faltando (`old`, `good`, `super`); `moves.json` recusa `badge` fora de 0..15 (ausente = sem insígnia) e `fly-points.json` recusa `flypoint` fora de 0..37; todos com arquivo, campo e problema
- [X] T004 Implementar os schemas zod `fieldMovesRules`, `fishingRules` e `flyPointsFile` em `packages/shared/src/field/schemas.ts`, exportados de `packages/shared/src/index.ts` ([data-model.md](data-model.md))
- [X] T005 [P] Teste vermelho da classe de locomoção em `packages/shared/test/field/locomotion.test.ts`: `content/species/locomotion.json` tem exatamente as chaves 1..493 (nenhuma faltando ou extra), cada valor é `"terrestrial"|"aquatic"|"flying"|"levitating"`; e `launchAllowed(class, mode)` aceita aquático, voador e levitante e recusa terrestre quando `mode = "surf"`, e aceita todos nos demais modos
- [X] T006 Escrever `content/species/locomotion.json` (493 espécies; Flying e Levitate viram voador/levitante, Water vira aquático, resto terrestre; exceções revisadas à mão) e `launchAllowed` em `packages/shared/src/field/locomotion.ts`
- [X] T007 [P] Teste vermelho da migração em `packages/shared/test/save/migrate-v9.test.ts`: save v8 com `badges: 3` migra para `badgeSet: 0b111` e `flyPoints: []`; `badges: 0` dá `0`; `badges: 16` dá `0xFFFF`; `badgeSet` fora de 0..0xFFFF e `flyPoints` com repetição são recusados; o resto do save fica intacto
- [X] T008 Subir `SAVE_SCHEMA_VERSION` para 9 em `packages/shared/src/save/schema.ts`: remover `badges`, adicionar `badgeSet` (int 0..0xFFFF) e `flyPoints` (`string[]` sem repetição); migração 8→9 em `packages/shared/src/save/migrate.ts`; `badgeCount(set)` (popcount) em `packages/shared/src/save/badges.ts`; atualizar fixtures de save, `coherence.ts`, `newProgress` e os usos da contagem em `packages/server/src/companion.ts`, `packages/server/src/shop.ts`, `packages/server/src/session.ts` ([contracts/save-v9.md](contracts/save-v9.md))
- [X] T009 [P] Teste vermelho do scripts host em `packages/server/test/scripts-badges.test.ts`: `hasBadge(b)` testa o bit `b` (não `b < contagem`); `giveBadge(b)` liga só o bit `b`; `CheckBadge` em `packages/shared/src/script/handlers/pokemon.ts` responde por bit
- [X] T010 Trocar o atalho `hasBadge: (b) => b < badges` e `giveBadge` por operações sobre `badgeSet` em `packages/server/src/scripts.ts` (remove o comentário `shortcut:` da linha 352)
- [X] T011 [P] Teste vermelho do extrator em `packages/extractor/test/events/fly-points.test.ts` (ROM sintética): lê `flyPoints[]` (`flypoint`, `map`, `tx`, `ty`); recusa offset fora, `flypoint` > 37 e registro truncado
- [X] T012 Descobrir os offsets da tabela de pontos de voo (overlay 101) e dos warps de pouso, e implementar o leitor em `packages/extractor/src/events/fly-points.ts` com os offsets em `layout.ts`, gravar `fly-points.json` no estágio `events` (`packages/extractor/src/events/stage.ts`) e subir `eventsStage.version`; `loadScripts` em `packages/app/src/server-host/scripts-loader.ts` expõe os dados como `ScriptData.flyPoints`, e arquivo inválido é registrado e deixado de fora
- [X] T013 [P] Teste vermelho do protocolo v19 em `packages/shared/test/game/protocol-v19.test.ts`: aceita e recusa cada mensagem de [contracts/protocol-v19.md](contracts/protocol-v19.md) (`field-interact`, `field-use`, `field-mount`, `field-dismount`, `field-fish`, `field-reel`, `field-fly`, `debugGiveBadge`, `debugTeachMove`, `debugGiveItem` e as respostas `field-prompt`, `field-result`, `field-removed`, `player-mode`, `field-fishing`, `field-fly-map`, `field-launchable`, `field-lit`)
- [X] T014 Adicionar as mensagens em `packages/shared/src/game/protocol.ts`, `mode` no estado do jogador e `PROTOCOL_VERSION` 19 em `packages/shared/src/protocol-version.ts`; o servidor responde `field-result { ok: false }` a tudo até as histórias implementarem
- [X] T015 [P] Teste vermelho dos comandos de desenvolvimento em `packages/server/test/dev-commands.test.ts` (harness): em build de desenvolvimento com o depurador ligado, `debugGiveBadge` liga o bit, `debugTeachMove` coloca o golpe no slot do membro (no último quando já tem quatro) e `debugGiveItem` soma `count` à bolsa; fora disso nada muda e o log registra. O teleporte é o `debugWarp` do protocolo 17, que já tem teste
- [X] T016 Implementar `giveBadge`, `teachMove` e `giveItem` em `packages/server/src/scripts.ts` com o `devState` compartilhado com os comandos de spec 024 e a opção `devTools` que já existe (`game-server.ts`); build de produção nunca a liga

**Checkpoint**: contratos, dados, migração e comandos de dev prontos.

## Phase 3: User Story 1 - Superar obstáculos com golpes de campo (P1) 🎯 MVP

**Objetivo**: interagir com árvore, rocha, Strength, redemoinho, cachoeira e parede, e superá-los com insígnia e golpe.

**Teste independente**: dar insígnia e golpe por `debug*`, interagir com uma árvore de Cut e ver o tile livre só para quem cortou.

- [X] T017 [P] [US1] Teste vermelho da tabela de regras em `packages/shared/test/field/moves.test.ts`: para cada um dos golpes Cut, Rock Smash, Strength, Surf, Whirlpool, Waterfall, Rock Climb, Flash, Fly e Headbutt, o resultado de `canUseFieldMove(rules, badgeSet, party, obstacle)` nas 4 combinações (com/sem insígnia × com/sem golpe na equipe) é `ok` só quando ambos existem, e a razão (`badge` ou `move`) é a esperada; obstáculo de outro tipo é recusado; o usuário do golpe é o companheiro quando ele sabe e o primeiro membro que sabe, caso contrário
- [X] T018 [US1] Escrever `content/field/moves.json` com a insígnia de cada golpe (Rock Smash 0, Cut 1, Strength 2, Surf 3, Fly 4, Whirlpool 6, Waterfall 7, Rock Climb 15; Flash, Headbutt, Dig e Teleport sem insígnia), citando `field_move.c` da decomp (R1), e implementar `canUseFieldMove` e `pickUser` em `packages/shared/src/field/moves.ts` (FR-002)
- [X] T019 [P] [US1] Teste vermelho de cenário em `packages/server/test/field-obstacles.test.ts` (harness, 2 jogadores A e B no mesmo mapa): A com insígnia e Cut corta a árvore; o tile fica livre para A e continua bloqueado para B; B não recebe `field-removed`; A sai e volta ao mapa e a árvore voltou; sem insígnia ou sem golpe só o diálogo aparece e nada muda; `field-use` forjado sem `field-interact` é recusado
- [X] T020 [US1] Implementar `packages/server/src/field.ts`: `removedObstacles` por sessão (zera na troca de mapa, não vai ao save), `field-interact` → diálogo original via interpretador de scripts + `field-prompt`, `field-use` validando insígnia/golpe/posição/alcance, `field-removed` só ao jogador; colisão e visibilidade enviadas a cada cliente descontam o conjunto daquele jogador (`packages/server/src/session.ts`, `relevance.ts`)
- [X] T021 [P] [US1] Teste vermelho de Strength, Whirlpool, Waterfall e Rock Climb em `packages/server/test/field-obstacles-movers.test.ts`: Strength empurra a rocha um tile e recusa empurrar contra parede; Whirlpool e Waterfall exigem estar em `surf`; Rock Climb leva o jogador pela parede; cada um respeita insígnia e golpe
- [X] T022 [US1] Implementar os quatro movimentos em `packages/server/src/field.ts`, reusando a colisão de `packages/shared/src/maps/collision.ts`
- [X] T023 [P] [US1] Teste vermelho de Rock Smash e Headbutt em `packages/server/test/field-encounters.test.ts`: Rock Smash e Headbutt sorteiam, com `Rng` semeado, entre nada, selvagem e item conforme `rockSmash` e `headbutt` do mapa (`common|rare|secret` pelo grupo de árvores); a espécie sempre pertence à tabela; árvore fora de `regularTrees`/`secretTrees` recusa Headbutt
- [X] T024 [US1] Implementar Rock Smash e Headbutt em `packages/server/src/field.ts`, com o selvagem criado por `packages/server/src/wild.ts` (mesma API do spawn do spec 015)
- [X] T025 [US1] Cliente: pergunta de uso do golpe e diálogo original em `packages/client/src/GameSession.svelte` (reusa a caixa de mensagem e a pergunta sim/não do interpretador); chaves de texto em `packages/client/src/i18n/pt-BR.ts`; o objeto removido some só no cliente de quem removeu
- [X] T026 [US1] Camada 3, sonda de campo em `packages/app/golden/field.golden.ts` (ROM real, `SOULSILVER_ROM`, fora da CI): achar nos dados extraídos um exemplo real de cada obstáculo (árvore de Cut, rocha de Rock Smash, rocha de Strength, redemoinho, cachoeira, parede de Rock Climb); por `debugGiveBadge`, `debugTeachMove` e `debugWarp`, conferir passagem bloqueada antes e livre depois; relatório em `packages/app/golden/report.ts`
- [X] T027 [US1] Camada 4: capturas `01-cut-before.png` e `02-cut-after.png` em `.evidence/025/` pelo driver da skill `run-soulsilver` (save do slot 3, estado por `debug*`)

**Checkpoint**: MVP: a história pode passar por obstáculos de terra.

## Phase 4: User Story 2 - Surfar e encontrar Pokémon aquáticos (P1)

**Objetivo**: surf com companheiro na bola, encontros da tabela de surf e lançamento restrito.

**Teste independente**: entrar na água de um mapa real e conferir companheiro na bola, espécie da tabela e terrestre recusado.

- [X] T028 [P] [US2] Teste vermelho em `packages/server/test/field-surf.test.ts` (harness): `field.mount { mode: "surf" }` na borda da água com insígnia e Surf muda `mode` para `surf` e recolhe o companheiro; recusado sem insígnia, sem golpe ou fora da borda; `field.dismount` na borda de terra volta a `walk` e o companheiro sai; lançar um terrestre em `surf` é recusado e um aquático é aceito; `field-launchable` marca os lançáveis da equipe
- [X] T029 [US2] Implementar o modo `surf` em `packages/server/src/field.ts` (transições de [data-model.md](data-model.md)), reusar o recolhimento do spec 014 em `packages/server/src/companion.ts`, e aplicar `launchAllowed` no lançamento (`packages/server/src/session.ts` ou `combat.ts`, onde o jogador lança); enviar `field-launchable`
- [X] T030 [P] [US2] Teste vermelho de encontros de água em `packages/server/test/wild-water.test.ts`: com o jogador em `surf`, os selvagens da água nascem de `surf` do mapa (taxa `rates.surfing`, `swarm.surf` quando houver) e nunca de `grass`; fora do surf não nascem
- [X] T031 [US2] Implementar o spawn de água em `packages/server/src/wild.ts` reusando o sorteio semeado e o limite de selvagens do spec 015 (`content/wild/spawn.json`)
- [X] T032 [US2] Cliente: render do jogador montado, seletor com os lançáveis indicados e o texto de recusa em `packages/client/src/GameSession.svelte`, `packages/client/src/render/game-renderer.ts` e `packages/client/src/i18n/pt-BR.ts`
- [X] T033 [US2] Camada 3: estender `packages/app/golden/field.golden.ts` com surf em água real: as espécies que aparecem em N encontros pertencem à tabela `surf` daquele mapa
- [X] T034 [US2] Camada 4: captura `03-surfing.png`

## Phase 5: User Story 3 - Pescar com cada vara (P2)

**Objetivo**: pesca com as três varas, momento de reação e chance de fisgar crescente com a amizade.

**Teste independente**: 1.000 pescas por vara com semente fixa batem com a tabela.

- [X] T035 [P] [US3] Teste vermelho em `packages/shared/test/field/fishing.test.ts`: 1.000 pescas simuladas com semente fixa por vara (`old`, `good`, `super`): a frequência de cada espécie fica dentro de 3σ da `chance` da tabela da vara; a taxa de fisgar com amizade 255 é maior que com 0 e cresce monotonicamente; reagir fora da janela de reação dá `escaped`; `nightFish` substitui o slot à noite
- [X] T036 [US3] Escrever `content/field/fishing.json` (`rods.{old,good,super}.waitS` como `[min, max]`, `windowS`, `baseBite` em 0..1, `friendshipBite` em 0..1) e implementar `rollBite`, `pickCatch` e a máquina `idle → casting → waiting → bite → hooked|escaped` em `packages/shared/src/field/fishing.ts`
- [X] T037 [P] [US3] Teste vermelho de cenário em `packages/server/test/field-fishing.test.ts` (harness): `field-fish` com vara e água adjacente entra em `fish` e envia `field-fishing`; `field-reel` dentro da janela cria o selvagem na água próxima, pronto para combate; fora da janela escapa; recusado sem água adjacente ou sem vara; a amizade vem do companheiro e, sem companheiro, usa 0
- [X] T038 [US3] Implementar a pesca em `packages/server/src/fishing.ts` (usa o relógio do tick e o `Rng` da sessão) e o selvagem fisgado em `packages/server/src/wild.ts`
- [X] T039 [US3] Cliente: animação de pesca, indicador do momento de fisgar e botão de reação (teclado e gamepad) em `packages/client/src/render/game-renderer.ts` e `packages/client/src/GameSession.svelte`
- [X] T040 [US3] Camada 3: estender `field.golden.ts` com pesca em água real: as espécies das varas pertencem às tabelas do mapa
- [ ] T041 [US3] Camada 4: captura `04-fishing-bite.png`; camada 5: roteiro manual no `quickstart.md` e resultado anotado abaixo (tempo de reação justo com teclado e com gamepad)

## Phase 6: User Story 4 - Bicicleta, Fly, Flash e fuga de cavernas (P2)

**Objetivo**: bicicleta, mapa do Fly, caverna escura com Flash e saída por Dig, Teleport e Escape Rope.

**Teste independente**: Fly lista só os visitados; bicicleta recusada em interior; caverna escura visível com Flash.

- [X] T042 [P] [US4] Teste vermelho em `packages/server/test/field-bike-fly.test.ts` (harness): `field.mount { mode: "bike" }` em exterior muda `mode`, aumenta a velocidade acima da corrida e recolhe o companheiro; em interior é recusado com `reason: "indoors"`; `field-fly-map` lista só os `flyPoints` do jogador (e nenhum de outro jogador); `field-fly` para área não visitada é recusado com `notVisited`; Fly válido leva ao ponto e atualiza o mapa; a área é adicionada a `flyPoints` ao entrar
- [X] T043 [US4] Implementar bicicleta, Fly e registro de `flyPoints` em `packages/server/src/field.ts` e `packages/server/src/session.ts`; a velocidade da bicicleta em `content/field/moves.json`; a música de bicicleta como pedido de áudio existente (`packages/shared/src/audio/`, `desiredMusic`)
- [X] T044 [P] [US4] Teste vermelho de Flash e fuga em `packages/server/test/field-flash-escape.test.ts`: em mapa com `weather` 11 (`map-headers.json`), `lit` começa `false`, vira `true` com Flash (insígnia e golpe) e volta a `false` na troca de mapa; em mapa claro, Flash é recusado; Dig, Teleport e Escape Rope só valem em caverna e levam ao ponto de saída/respawn conforme o original; Escape Rope é consumido
- [X] T045 [US4] Implementar Flash, Dig, Teleport e Escape Rope em `packages/server/src/field.ts` e o uso do item em `packages/server/src/items.ts`; enviar `field-lit`
- [X] T046 [US4] Cliente: tela do mapa do Fly (`packages/client/src/FlyMap.svelte`), visão reduzida em caverna escura sem Flash (`packages/client/src/render/game-renderer.ts`), render da bicicleta e menu de uso dos golpes de campo (`packages/client/src/GameSession.svelte`, `i18n/pt-BR.ts`)
- [X] T047 [US4] Camada 3: estender `field.golden.ts` com caverna escura real (o mapa tem `weather` 11 em `map-headers.json`, Flash ilumina) e com a lista do Fly (só visitados, pontos existentes em `fly-points.json`)
- [X] T048 [US4] Camada 4: capturas `05-fly-map.png`, `06-dark-cave-no-flash.png`, `07-dark-cave-flash.png` e `08-bike.png`

## Phase 7: Polish e fechamento

- [X] T049 [P] Registrar em `docs/balance-log.md` os desvios: pesca em tempo real (janela de reação, chance de fisgar = `baseBite + friendshipBite·amizade/255`), Headbutt e Rock Smash sorteados no uso, Strength/Whirlpool e demais com a regra do original; spec `specs/025-field-moves-locomotion`
- [X] T050 [P] Fora do escopo documentado: confirmar que nenhum script de Marcos 4 e 5 nem o Gyarados vermelho foi tocado; registrar no `tasks.md` (notas) se algum golpe do caminho dourado do spec 024 passar a exigir insígnia por bit
- [X] T051 Rodar typecheck, lint e `npx vitest run` em todos os pacotes; as camadas 1 e 2 passam; anexar abaixo o relatório da camada 3 (`npm run golden -w @soulsilver/app`) e conferir as 8 capturas em `.evidence/025/` (pasta fora do git)
- [X] T052 Rodar `graphify update .` para manter o grafo atual (regra do projeto)

## Dependências e ordem

- Setup (T001–T002) → Foundational (T003–T016) → histórias.
- US1 e US2 (P1) dependem só de Foundational; US2 depende do modo/estado de T020 e do recolhimento do companheiro. Ordem sugerida: US1 → US2 → US3 → US4.
- US3 depende de US2 (água e spawn); US4 é independente de US2 e US3, exceto Flash/Fly que reusam `field.ts` de US1.
- Dentro de cada história: teste vermelho → implementação → cliente → camada 3 → camada 4.
- Paralelizáveis: T003/T005/T007/T009/T011/T013/T015 (testes de arquivos diferentes); T017/T019/T021/T023 (testes de US1); T049/T050 (docs).

## Estratégia

MVP = Phases 1–3 (obstáculos de terra com Cut e Rock Smash, por jogador). Depois surf (US2), pesca (US3) e bicicleta/Fly/Flash (US4), cada um jogável sozinho. O spec só fecha com camadas 1 e 2 na CI, a sonda de campo local passando e as 8 capturas.

## Notas e relatórios

(a preencher durante a implementação: relatório da camada 3, resultado do roteiro manual da pesca)

### US1 (2026-11-04)

**Decisão de implementação.** Os obstáculos rodam os scripts comuns originais do arquivo 146 (10000 Cut, 10001 Rock Smash, 10002 Strength, 10003 Rock Climb, 10005 Waterfall, 10014 Headbutt, 10016 Whirlpool). O próprio script mostra o diálogo, a pergunta sim/não, confere golpe e insígnia e esconde o objeto com `HidePerson`. O interpretador ganhou os comandos que faltavam (`packages/shared/src/script/handlers/field.ts`, semântica de `scrcmd_c.c` e `scrcmd_party.c`). Por isso:
- `field-prompt` não é enviado: a pergunta é o sim/não do script (FR-003, mais fiel). `field-interact` e `field-use` continuam respondendo `field-result { ok: false }`; o uso pelo menu (entradas 10007 em diante) entra com o menu de golpes de campo (T046).
- `removedObstacles` é o `shown` por jogador do interpretador, que zera na troca de mapa (R2). Nada novo vai para o save.
- O servidor agora preenche `VAR_LAST_TALKED` (0x800D) ao iniciar um script a partir de um objeto. Antes nunca era preenchido.
- A parede de Rock Climb (comportamento 0x4B/0x4C) não tem o bit de bloqueio na ROM. O movimento passa a tratá-la como parede (`isRockClimb`).
- Waterfall e Whirlpool só são oferecidos com o jogador sobre água. Ficam alcançáveis quando o surf entrar (US2).
- T025: nenhuma mudança no cliente. A caixa de mensagem e o sim/não existentes mostram o diálogo, e a visibilidade por jogador some com o objeto.

**Atalhos registrados no código.** Rock Smash não dá itens, porque as chances por mapa (NARC a/2/5/3) não estão extraídas. O trainer id do Headbutt é 0, porque o save não tem trainer id.

**Camada 3** (`npm run golden -w @soulsilver/app`, `golden/field.golden.ts`, ROM real):

```
ok  árvore de Cut (mapa 10, 1041, 219 olhando north)
ok  rocha de Rock Smash (mapa 7, 5, 23 olhando north)
ok  rocha de Strength (mapa 124, 43, 53 olhando north)
ok  parede de Rock Climb (mapa 13, 1302, 176 olhando south)
ok  redemoinho e cachoeira: dependem do surf (US2)
5 de 5 obstáculos
```

Cada obstáculo também é conferido sem a insígnia: continua bloqueado.

**Camada 4.** `01-cut-before.png` e `02-cut-after.png` em `.evidence/025/`, com o slot 3 no mapa 10 (1041, 219). O driver confirma o sim/não por clique (`[role=dialog] button`). Os toques de tecla do driver nem sempre chegam à caixa de diálogo.

## Phase 8: Convergence

- [X] T053 Extrair as chances de item do Rock Smash por mapa (NARC a/2/5/3) no extrator, com teste vermelho em ROM sintética, e fazer `packages/shared/src/script/handlers/field.ts` sortear o item com o `Rng` da sessão, removendo o `shortcut:` da linha 44 per FR-013 / US1/AC6 (partial)
- [X] T054 Estender `packages/app/golden/field.golden.ts` com redemoinho e cachoeira reais (bloqueado antes, livre depois, a partir do modo `surf` de T029), fechando os 7 tipos de obstáculo da sonda per SC-006 (partial)
- [X] T055 Guardar um trainer id por jogador (ou derivá-lo de forma estável do save) e usá-lo na escolha das árvores de Headbutt em `packages/server/src/scripts.ts`, removendo o `shortcut:` da linha 68, para que jogadores diferentes não tenham sempre o mesmo grupo de árvores raras per FR-013 / Constitution I (partial)
- [X] T056 Validar em `packages/shared/src/save/coherence.ts` que cada `flyPoints` é uma área de voo conhecida (`fly-points.json`), com teste vermelho per contracts/save-v9.md (partial)
- [X] T057 Alinhar a migração 8→9 ao data-model (`flyPoints` recebe a área atual quando ela é ponto de voo) ou registrar em `data-model.md`/notas que a lista começa vazia e é preenchida ao entrar (T042) per data-model: migração 8→9 (contradicts)

### US2 (2026-11-05)

**Decisão de implementação.** O modo fica em `data.mode` da entidade do jogador (`packages/server/src/field.ts`), então a predição do cliente e os outros jogadores o veem sem mensagem nova. Surfando, a água é chão e o resto é parede (`stepMovement`); redemoinho e cachoeira continuam bloqueando. O companheiro fica na bola enquanto o jogador surfa, e o botão de combate manda o primeiro membro lançável, não o líder. Se só sobram terrestres, o combate termina sem desmaio geral. Em combate, espécies não terrestres atravessam água (FR-007). O cliente pede `field-mount` ao interagir de frente para a água, e `field-dismount` ao interagir de frente para a terra.
- Os selvagens da água têm limite próprio, separado do da grama. Sem isso, num mapa com grama o limite enchia antes de a água ter vez.

**Atalhos registrados no código.** `swarm.surf` não entra, porque não há surtos. Os spawns da água ficam fora da tela como os da grama, então um lago menor que a tela não tem encontros. O jogador surfando é desenhado no quadro parado, balançando, porque a pose e a montaria de surf da ROM não estão extraídas. `field-launchable` só é enviado ao montar.

**Camada 3** (`golden/field.golden.ts`, extração real):

```
ok  surf (mapa 20, 1422, 261 olhando west; 12 encontros na água)
1 de 1 obstáculos
```

**Camada 4.** `03-surfing.png` em `.evidence/025/`, com o slot 3 no mapa 20, montado a partir da margem (estado preparado por `debugGiveBadge` e `debugTeachMove`).

### US3 (2026-11-05)

**Decisões.**
- A pesca começa por uma ação própria, **Vara de pesca** (`C` no teclado, R3 no gamepad), que lança a melhor vara da mochila na água à frente. Isso imita o botão de item registrado do original e evita disputar o "interagir" na margem com o Surf. Puxar é a mesma ação ou interagir. Com as configurações salvas, uma ação nova pega a tecla padrão sem apagar as teclas que o jogador já trocou (`settings.ts`).
- O item de cada vara está em `content/field/fishing.json` (`rods.*.item`: 445, 446, 447, conferidos no catálogo de textos extraído).
- A máquina de estados ficou `waiting → bite → hooked|escaped`; os estados `idle` e `casting` não existem à parte (sem linha = parado; o lançamento já começa a espera). Puxar antes da mordida recolhe a linha vazia (`escaped`), o que serve de cancelar.
- Enquanto pesca, o jogador fica parado: `stepMovement` ignora a entrada com `mode: "fish"` (servidor e predição do cliente iguais).
- Um mapa sem tabela para a vara (ou com taxa 0) ainda deixa lançar, mas nada morde, como o "nem uma beliscada" do original.
- O fisgado nasce no tile de água à frente, com IA e contado no limite da água.
- A amizade vem do membro que está fora da bola como companheiro; sem companheiro fora (desmaiado, em combate), usa 0.

**Atalhos (`shortcut:` no código).**
- `nightFish` substitui o slot 3 das tabelas à noite; o índice é de memória, não conferido na decomp.
- `swarm.fish` não é usado (não há surtos).
- Sem pesca a partir do surf: o modo guarda só um de `surf` ou `fish`.
- O pescador fica no quadro parado da caminhada; não há pose nem linha de pesca da ROM.

**Camada 3.**
```
ok  pesca old (mapa 12, 1276, 115 olhando north; 10 fisgados em 22 lances)
ok  pesca good (mapa 12, 1276, 115 olhando north; 10 fisgados em 24 lances)
ok  pesca super (mapa 12, 1276, 115 olhando north; 10 fisgados em 20 lances)
```

**Camada 4.** `04-fishing-bite.png` em `.evidence/025/`: slot 3 no mapa 12, Old Rod por `debugGiveItem`, a caixa "Fisgou! Puxe agora!" na mordida.
- As marcas sobre as entidades ("…" e "!" da pesca, e também ⚔, "ocupado", o "!" dos selvagens e as emoções) estão no DOM, mas ficam atrás do canvas no layout atual da tela (`elementFromPoint` devolve o `CANVAS`). Isso não vem desta fase. Por isso a captura mostra a caixa de texto e não o "!".

**Camada 5.** Pendente: roteiro em `quickstart.md`; o resultado (teclado e gamepad) vem do teste manual.

## Phase 9: Convergence

- [X] T058 CRITICAL: registrar em `docs/balance-log.md` o limite próprio dos selvagens da água (`packages/server/src/wild.ts`, `countIn(area, water)`: um mapa com grama e água chega a 12 selvagens, não 6) per Constitution I (contradicts)
- [X] T059 Pôr a camada de marcas de `packages/client/src/GameSession.svelte` acima do canvas, para o "…"/"!" da pesca (e ⚔, ocupado, alerta, emoções) aparecerem, e refazer a captura `04-fishing-bite.png` com o "!" visível per T039/SC-008 (partial)
- [X] T060 Reenviar `field-launchable` em `packages/server/src/field.ts` sempre que a equipe muda durante o surf (captura, desmaio, troca, comando de dev), com teste em `packages/server/test/field-surf.test.ts` per FR-008 (partial)
- [X] T061 Dar encontros de água a lagos menores que a tela (spawn em vista, por exemplo com respingo), removendo o `shortcut:` de `packages/server/src/wild.ts`, com teste em `packages/server/test/wild-water.test.ts` per FR-009 (partial)
- [X] T062 Conferir na decomp pokeheartgold qual slot `nightFish` substitui (e para quais varas) e corrigir `NIGHT_SLOT` em `packages/shared/src/field/fishing.ts`, removendo o `shortcut:` per FR-010 (partial)
- [X] T063 Fazer `teachMove` em `packages/server/src/scripts.ts` ignorar um golpe que o Pokémon já sabe (hoje duplica e quebra a lista de golpes do cliente com `each_key_duplicate`), com teste em `packages/server/test/dev-commands.test.ts` per FR-018 (partial)
- [X] T064 Registrar em `research.md` a ação de entrada "Vara de pesca" (`C`/R3) e a tecla padrão por ação nas configurações salvas (`packages/shared/src/settings.ts`), que o plano e os contratos não previam per plan: decisões de US3 (unrequested)

### US4 (2026-11-05)

**Decisões.**
- **Escuridão.** As cavernas escuras não usam o clima 11 que o R1 registrou. Na extração, o clima é 22 em Dark Cave e Whirl Islands, e 23 em Rock Tunnel e Cerulean Cave; nenhum mapa tem 11 ou 12. A lista virou dado: `darkWeather: [22, 23]` em `content/field/moves.json`. O `weather` do cabeçalho agora vai no `WorldMap` (`world-loader.ts`), e o cliente lê o mesmo cabeçalho.
- **Bicicleta.** Exige o item Bicycle (450, em `moves.json` como `bicycle`) e mapa `outdoor`. A velocidade (`bikeSpeedPx`) vai nos dados da entidade (`data.speed`), então a predição do cliente usa o mesmo valor do servidor. Entrar num mapa que não é exterior desmonta. A música é `SEQ_GS_BICYCLE` (`content/audio/cues.json`, `MusicState.bike`), abaixo de combate e script e acima da música do mapa.
- **Companheiro.** Vai para a bola tanto no surf quanto na bicicleta (`field.riding`).
- **Fly.** `field-use { move: "fly" }` responde com `field-fly-map` (só os pontos visitados). `field-fly` valida o ponto, a insígnia e o golpe, e pousa no tile de `fly-points.json`. O ponto entra em `flyPoints` quando o jogador pisa no mapa; vai para o save junto com o progresso.
- **Flash.** Usar Flash liga `lit` só para quem usou; trocar de mapa apaga e envia `field-lit false`. No cliente, a caverna escura sem Flash fica preta, com um círculo de 36 px de raio em volta do jogador (`game-renderer.ts`).
- **Fuga da caverna.** Dig, Teleport e Escape Rope só valem em mapa `cave`.
  - Dig e Escape Rope voltam ao último ponto em que o jogador esteve num mapa exterior, virado para o lado oposto, como a "saída" do original.
  - Teleport vai ao `respawn` (último Centro Pokémon).
  - Sem ponto de saída na sessão (o save abriu dentro da caverna), Dig e Escape Rope também vão ao `respawn`.
  - A Escape Rope sai pelo `use-item` e é consumida só quando funciona.
- **Menu.** Uma página nova do menu, **Campo** (`FieldMenu.svelte`), lista Fly, Flash, Dig e Teleport se alguém da equipe sabe o golpe, e a bicicleta e a Escape Rope se estão na mochila. O menu fecha antes de enviar, porque o servidor recusa com o menu aberto.
- **Esc no mapa do Fly.** A tecla Esc é "cancelar" no mapa do Fly e "menu" no campo, emitidas em sequência. O mapa só fecha depois das duas (`queueMicrotask`), para não abrir o menu de pausa por baixo.

**Atalhos (`shortcut:` no código).**
- O Fly mostra uma lista de nomes, não o mapa do Pokégear.
- O ciclista usa os quadros de corrida, porque o conjunto extraído não tem a bicicleta.
- O ponto de saída da caverna fica só na sessão; não vai para o save.
- Os bits `flyAllowed` e `escapeRopeAllowed` do cabeçalho não são extraídos; valem `areaType` `outdoor` e `cave`.

**Camada 3.**
```
ok  caverna escura (mapa 108, 32, 32, clima 23)
ok  Fly (visitados 60, 73 de 25 pontos; pousou em 73)
```

**Camada 4.** Capturas em `.evidence/025/` com o slot 3 e estado preparado por `debugTeachMove`, `debugGiveBadge`, `debugGiveItem` e `debugWarp`:
- `05-fly-map.png`: New Bark Town e Cherrygrove City.
- `06-dark-cave-no-flash.png` e `07-dark-cave-flash.png`: Rock Tunnel, mapa 108.
- `08-bike.png`: New Bark, companheiro na bola.

A música da bicicleta não foi conferida de ouvido.

### Fechamento (2026-11-05)

**T049.** Os desvios do spec 025 estão em `docs/balance-log.md` (11 linhas de 2026-11-05):
- pesca: espera, janela de reação, chance de fisgar e o Pokémon fisgado no mapa;
- selvagens da água com limite próprio (o achado T058 já fica coberto);
- lançamento restrito no surf;
- Rock Smash e Headbutt sorteados no uso;
- velocidade da bicicleta;
- raio da caverna escura;
- Teleport só em caverna;
- saída de Dig e Escape Rope;
- golpes que seguem a regra do original.

**T050.**
- Nenhum script nem evento da ROM foi alterado. O spec só acrescentou handlers genéricos de comando (`script/handlers/field.ts`), conteúdo escrito à mão em `content/field` e `content/species`, e o leitor de `fly-points` no extrator.
- Nada de Marcos 4 e 5 nem do Gyarados vermelho foi tocado.
- O caminho dourado do spec 024 não usa golpe de campo e lê as insígnias por `badgeCount(badgeSet)`: os 10 marcos passam (camada 3 abaixo).

**T051.**
- Typecheck limpo.
- `npx vitest run`: 321 arquivos e 3.304 testes passam.
- Lint: os arquivos deste spec estão limpos, salvo um caso. `GameSession.svelte:832` (`onBack` do `FlyMap`) dá `no-unsafe-assignment` porque o ESLint não tipa as props de um componente `.svelte` importado. É o mesmo erro que a linha do `PauseMenu` (`onPage`) já tinha antes deste spec.
- Os outros 28 erros de lint do repositório já existiam: `world-loader.ts` com `node:fs`, `SvelteMap` em `GameSession`, `migrate-v7.test.ts`, entre outros.
- As 8 capturas estão em `.evidence/025/` (pasta ignorada pelo git).

Camada 3 (`npm run golden`):
```
ok  árvore de Cut (mapa 10, 1041, 219 olhando north)
ok  rocha de Rock Smash (mapa 7, 5, 23 olhando north)
ok  rocha de Strength (mapa 124, 43, 53 olhando north)
ok  parede de Rock Climb (mapa 13, 1302, 176 olhando south)
ok  redemoinho e cachoeira: dependem do surf (US2)
ok  surf (mapa 20, 1422, 261 olhando west; 12 encontros na água)
ok  pesca old (mapa 12, 1276, 115 olhando north; 10 fisgados em 22 lances)
ok  pesca good (mapa 12, 1276, 115 olhando north; 10 fisgados em 24 lances)
ok  pesca super (mapa 12, 1276, 115 olhando north; 10 fisgados em 20 lances)
ok  caverna escura (mapa 108, 32, 32, clima 23)
ok  Fly (visitados 60, 73 de 25 pontos; pousou em 73)
10 de 10 marcos (spec 024), lojas, Centro, PC e as 7 lutas do caminho: ok
```

**T052.** `graphify update .` rodado.

**Ainda aberto.**
- T041: o teste manual de reação da pesca (camada 5) é teu.
- Phase 8: T053 a T057.
- Phase 9: T058 a T064. O texto de T058 já está no balance-log; falta marcá-la quando rodares a Phase 9.

## Phase 10: Convergence

- [X] T065 CRITICAL: verificar na camada 4, pelo driver, as mudanças visíveis que ainda não têm captura e anotar nas notas: a página **Campo** do menu (`packages/client/src/game/FieldMenu.svelte`) aberta, e Fly usado a partir dela até o mapa do Fly; a marca "não luta na água" do seletor durante o surf (`SwapPicker.svelte`); a linha "Vara de pesca" em Controles. Per Constitution V (contradicts)
- [X] T066 Guardar no save o ponto de saída da caverna (hoje só na sessão, `shortcut:` em `packages/server/src/field.ts`), com migração e teste vermelho, para que Dig e Escape Rope saiam pela entrada também depois de recarregar dentro da caverna. Per FR-017 (partial)
- [X] T067 Extrair do cabeçalho de mapa os bits `flyAllowed` e `escapeRopeAllowed` (research R1), com teste vermelho em ROM sintética. Usá-los em `packages/server/src/field.ts` no lugar de `areaType` `outdoor`/`cave`, removendo o `shortcut:`. Per FR-015/FR-017 (partial)
- [X] T068 Corrigir `research.md` (R1, R7) e `data-model.md` (Escuridão): a escuridão vem de `weather` 22/23 na extração (`darkWeather` em `content/field/moves.json`), não de 11. Per plan: research R1 (contradicts)
- [X] T069 Tirar o erro de lint `no-unsafe-assignment` de `packages/client/src/GameSession.svelte` no `onBack` do `FlyMap`, para que o spec não acrescente erro ao `npm run lint`. Per T051 (partial)

### Convergência, fases 8 a 10 (2026-11-05)

**Correção de uma nota de US4.** A escuridão é mesmo `weather` 11, como o R1 dizia.
- O extrator gravava o byte inteiro do cabeçalho, que guarda a região no bit 0. Por isso as cavernas de Kanto apareciam com 23 e as de Johto com 22.
- O leitor agora separa os campos (estágio `maps` versão 8), e `darkWeather` voltou a `[11, 12]`.
- Em US4, quando escrevi "22/23", eu tinha lido o dado errado.

**O que mudou.**
- **T053.** O extrator lê a NARC a/2/5/3, com a chance e a lista de itens de cada mapa, e grava `rock-smash.json` (estágio `events` versão 7; 17 mapas na extração).
  - As listas de itens da SoulSilver e o peso de cada posição (25, 20, 10, 10, 10, 10, 10, 5) estão em `content/field/moves.json` → `rockSmashItems`.
  - O sorteio só acontece quando não sai Pokémon da rocha. O companheiro que usa o golpe soma 5.
  - Ficou de fora, como atalho: as habilidades Suction Cups, Magnet Pull, Keen Eye, Serene Grace e Super Luck, porque o save não guarda habilidade.
- **T054.** A sonda ganhou redemoinho (mapa 31) e cachoeira (mapa 151): o jogador entra no surf pela margem, fica bloqueado, usa o golpe e passa; sem a insígnia, é recusado.
- **T055.** O número do treinador vem do nome do jogador (FNV-1a de 16 bits). "A" e "B" caem em tabelas diferentes da mesma árvore. Atalho: dois jogadores com o mesmo nome têm o mesmo número.
- **T056.** `flyPointsRule` recusa um save com uma área em `flyPoints` que não é ponto de voo. O servidor usa a regra quando há `fly-points.json`.
- **T057.** Documentado em `data-model.md` e no contrato: a lista começa vazia e a área atual entra no primeiro tick da sessão.
- **T058.** A linha já estava no balance-log desde T049.
- **T059.** As marcas não estavam atrás do canvas: o diagnóstico de antes estava errado, porque `elementFromPoint` ignora elementos com `pointer-events: none`.
  - O problema era o lugar: `project()` não descontava a altura do chão, então a marca descia até os pés em terreno alto.
  - Agora `project(x, y, lift)` usa o chão do ponto, como a câmera faz.
  - Uma marca de um só caractere ("!", "…", "⚔", emoção) é desenhada em 2rem.
  - A captura `04-fishing-bite.png` foi refeita com o "!" sobre a cabeça.
- **T060.** Durante o surf, `field.step` reenvia `field-launchable` quando a lista muda (captura, desmaio, troca ou nova ordem).
- **T061.** Num lago menor que a tela, os selvagens da água nascem à vista, a pelo menos 3 tiles de todo jogador (`content/wild/spawn.json` → `waterInViewTiles`).
- **T062.** Conferido na decomp (`encounter_check.c`): à noite, a Good Rod troca o slot 3 e a Super Rod o slot 1; a Old Rod não troca nada. As chances do fixture de teste passaram às do original (40, 30, 15, 10, 5).
- **T063.** `debugTeachMove` ignora um golpe que o Pokémon já sabe.
- **T064.** Decisão registrada no R10 de `research.md`.
- **T065.** Capturas novas em `.evidence/025/`:
  - `09-field-menu.png`: a página Campo.
  - `10-fly-from-menu.png`: o Fly aberto pela página Campo.
  - `11-controls-rod.png`: a linha "Vara de pesca: C / RS".
  - `12-swap-land-tag.png`: o seletor durante o surf. O texto lido do DOM foi "CYNDAQUIL · nv 5 · HP 19/19 · não luta na água [desativado]".
  - Para a 12, um Pidgey foi posto no save `slot-1.json`; depois o save foi restaurado byte a byte.
- **T066.** O save v9 ganhou `escape` (opcional): o ponto de saída da caverna, que agora sobrevive a recarregar o jogo.
- **T067.** O extrator lê `bikeAllowed`, `escapeRopeAllowed` e `flyAllowed` (bits 25, 27 e 28). O servidor os usa, e um mapa sem cabeçalho volta ao `areaType`. Na extração: Fly em 92 mapas, Escape Rope em 74, bicicleta em 170. O Teleport segue o bit da Escape Rope, porque no spec ele é saída de caverna.
- **T068.** `research.md` e `data-model.md` corrigidos, com a causa (ver o início desta nota).
- **T069.** Os parâmetros de `onFly` e `onPage` agora têm tipo. O lint não acusa nada nos arquivos deste spec; o total do repositório caiu de 31 para 27.

**Extração.** Os estágios `maps` (v8) e `events` (v7) foram reextraídos com `npm run extract` em `%APPDATA%\SoulSilver Desktop\extraction` e em `assets/`. Quem tiver uma extração antiga recebe esses dois estágios de novo, porque a versão mudou.

**Camada 3** (`npm run golden`):
```
ok  árvore de Cut (mapa 10, 1041, 219 olhando north)
ok  rocha de Rock Smash (mapa 7, 5, 23 olhando north)
ok  rocha de Strength (mapa 124, 43, 53 olhando north)
ok  parede de Rock Climb (mapa 13, 1302, 176 olhando south)
ok  redemoinho (mapa 31, 835, 399 olhando north)
ok  cachoeira (mapa 151, 96, 384 olhando east)
ok  surf (mapa 20, 1422, 261 olhando west; 12 encontros na água)
ok  pesca old/good/super (mapa 12; 10 fisgados por vara)
ok  caverna escura (mapa 108, 32, 32, clima 11)
ok  Fly (visitados 60, 73 de 25 pontos; pousou em 73)
10 de 10 marcos do spec 024 e as lutas do caminho: ok
```

## Phase 11: Convergence

- [X] T070 CRITICAL: corrigir a linha "Rock Smash e Headbutt" de `docs/balance-log.md`: hoje diz "sem itens", mas a rocha dá itens (T053). Registrar também que as habilidades Suction Cups, Magnet Pull, Keen Eye, Serene Grace e Super Luck não entram, porque o save não guarda habilidade. Per Constitution I (contradicts)
- [X] T071 Permitir Fly e Flash durante o surf, como o original (o Fly encerra o surf), em vez de recusar com `busy` (`ready()` em `packages/server/src/field.ts`), com teste em `packages/server/test/field-bike-fly.test.ts`. Pesca a partir da água: implementar, ou manter o `shortcut:` de `packages/server/src/fishing.ts` e registrar o motivo nas notas. Per FR-015/FR-016 (partial)
- [X] T072 Atualizar a lista de capturas da camada 4 em `quickstart.md` (01–08 → 01–12, com 09 a 12 de T065). Per T065 (partial)

### Convergência, fase 11 (2026-11-05)

- **T070.** A linha "Rock Smash e Headbutt" de `docs/balance-log.md` agora descreve os itens da rocha (chance do mapa, +5 com o companheiro, pesos 25/20/10/10/10/10/10/5) e os bônus de habilidade que ficam de fora.
- **T071.**
  - Fly, Flash, Dig e Teleport valem também durante o surf, como no original. O pouso do Fly em terra encerra o surf pela regra que já existia em `field.step`.
  - Testes em `field-bike-fly.test.ts`: voar a partir da água e pousar andando; Flash numa caverna escura com água, mantendo o surf.
  - Isso explica a recusa "Não dá para fazer isso agora" vista no app depois da pesca: o interagir na margem tinha montado o surf.
  - **A pesca a partir da água continua um atalho** (`shortcut:` em `fishing.ts`). O jogador tem um único `mode`, e "surf" e "fish" se excluem. Pescar surfando exigiria guardar a linha à parte do modo, mudança que não cabe nesta fase.
- **T072.** A lista de capturas em `quickstart.md` agora vai de 01 a 12.

Testes:
- typecheck limpo;
- 3.318 de 3.320 testes em `npx vitest run`;
- as duas falhas (`extractor/test/maps/stage.test.ts` e `extractor/test/cli.test.ts`) só aparecem na execução completa e passam sozinhas (30 de 30). `stage.test.ts` já está na lista de testes instáveis da skill.
