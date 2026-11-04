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

- [ ] T028 [P] [US2] Teste vermelho em `packages/server/test/field-surf.test.ts` (harness): `field.mount { mode: "surf" }` na borda da água com insígnia e Surf muda `mode` para `surf` e recolhe o companheiro; recusado sem insígnia, sem golpe ou fora da borda; `field.dismount` na borda de terra volta a `walk` e o companheiro sai; lançar um terrestre em `surf` é recusado e um aquático é aceito; `field-launchable` marca os lançáveis da equipe
- [ ] T029 [US2] Implementar o modo `surf` em `packages/server/src/field.ts` (transições de [data-model.md](data-model.md)), reusar o recolhimento do spec 014 em `packages/server/src/companion.ts`, e aplicar `launchAllowed` no lançamento (`packages/server/src/session.ts` ou `combat.ts`, onde o jogador lança); enviar `field-launchable`
- [ ] T030 [P] [US2] Teste vermelho de encontros de água em `packages/server/test/wild-water.test.ts`: com o jogador em `surf`, os selvagens da água nascem de `surf` do mapa (taxa `rates.surfing`, `swarm.surf` quando houver) e nunca de `grass`; fora do surf não nascem
- [ ] T031 [US2] Implementar o spawn de água em `packages/server/src/wild.ts` reusando o sorteio semeado e o limite de selvagens do spec 015 (`content/wild/spawn.json`)
- [ ] T032 [US2] Cliente: render do jogador montado, seletor com os lançáveis indicados e o texto de recusa em `packages/client/src/GameSession.svelte`, `packages/client/src/render/game-renderer.ts` e `packages/client/src/i18n/pt-BR.ts`
- [ ] T033 [US2] Camada 3: estender `packages/app/golden/field.golden.ts` com surf em água real: as espécies que aparecem em N encontros pertencem à tabela `surf` daquele mapa
- [ ] T034 [US2] Camada 4: captura `03-surfing.png`

## Phase 5: User Story 3 - Pescar com cada vara (P2)

**Objetivo**: pesca com as três varas, momento de reação e chance de fisgar crescente com a amizade.

**Teste independente**: 1.000 pescas por vara com semente fixa batem com a tabela.

- [ ] T035 [P] [US3] Teste vermelho em `packages/shared/test/field/fishing.test.ts`: 1.000 pescas simuladas com semente fixa por vara (`old`, `good`, `super`): a frequência de cada espécie fica dentro de 3σ da `chance` da tabela da vara; a taxa de fisgar com amizade 255 é maior que com 0 e cresce monotonicamente; reagir fora da janela de reação dá `escaped`; `nightFish` substitui o slot à noite
- [ ] T036 [US3] Escrever `content/field/fishing.json` (`rods.{old,good,super}.waitS` como `[min, max]`, `windowS`, `baseBite` em 0..1, `friendshipBite` em 0..1) e implementar `rollBite`, `pickCatch` e a máquina `idle → casting → waiting → bite → hooked|escaped` em `packages/shared/src/field/fishing.ts`
- [ ] T037 [P] [US3] Teste vermelho de cenário em `packages/server/test/field-fishing.test.ts` (harness): `field-fish` com vara e água adjacente entra em `fish` e envia `field-fishing`; `field-reel` dentro da janela cria o selvagem na água próxima, pronto para combate; fora da janela escapa; recusado sem água adjacente ou sem vara; a amizade vem do companheiro e, sem companheiro, usa 0
- [ ] T038 [US3] Implementar a pesca em `packages/server/src/fishing.ts` (usa o relógio do tick e o `Rng` da sessão) e o selvagem fisgado em `packages/server/src/wild.ts`
- [ ] T039 [US3] Cliente: animação de pesca, indicador do momento de fisgar e botão de reação (teclado e gamepad) em `packages/client/src/render/game-renderer.ts` e `packages/client/src/GameSession.svelte`
- [ ] T040 [US3] Camada 3: estender `field.golden.ts` com pesca em água real: as espécies das varas pertencem às tabelas do mapa
- [ ] T041 [US3] Camada 4: captura `04-fishing-bite.png`; camada 5: roteiro manual no `quickstart.md` e resultado anotado abaixo (tempo de reação justo com teclado e com gamepad)

## Phase 6: User Story 4 - Bicicleta, Fly, Flash e fuga de cavernas (P2)

**Objetivo**: bicicleta, mapa do Fly, caverna escura com Flash e saída por Dig, Teleport e Escape Rope.

**Teste independente**: Fly lista só os visitados; bicicleta recusada em interior; caverna escura visível com Flash.

- [ ] T042 [P] [US4] Teste vermelho em `packages/server/test/field-bike-fly.test.ts` (harness): `field.mount { mode: "bike" }` em exterior muda `mode`, aumenta a velocidade acima da corrida e recolhe o companheiro; em interior é recusado com `reason: "indoors"`; `field-fly-map` lista só os `flyPoints` do jogador (e nenhum de outro jogador); `field-fly` para área não visitada é recusado com `notVisited`; Fly válido leva ao ponto e atualiza o mapa; a área é adicionada a `flyPoints` ao entrar
- [ ] T043 [US4] Implementar bicicleta, Fly e registro de `flyPoints` em `packages/server/src/field.ts` e `packages/server/src/session.ts`; a velocidade da bicicleta em `content/field/moves.json`; a música de bicicleta como pedido de áudio existente (`packages/shared/src/audio/`, `desiredMusic`)
- [ ] T044 [P] [US4] Teste vermelho de Flash e fuga em `packages/server/test/field-flash-escape.test.ts`: em mapa com `weather` 11 (`map-headers.json`), `lit` começa `false`, vira `true` com Flash (insígnia e golpe) e volta a `false` na troca de mapa; em mapa claro, Flash é recusado; Dig, Teleport e Escape Rope só valem em caverna e levam ao ponto de saída/respawn conforme o original; Escape Rope é consumido
- [ ] T045 [US4] Implementar Flash, Dig, Teleport e Escape Rope em `packages/server/src/field.ts` e o uso do item em `packages/server/src/items.ts`; enviar `field-lit`
- [ ] T046 [US4] Cliente: tela do mapa do Fly (`packages/client/src/FlyMap.svelte`), visão reduzida em caverna escura sem Flash (`packages/client/src/render/game-renderer.ts`), render da bicicleta e menu de uso dos golpes de campo (`packages/client/src/GameSession.svelte`, `i18n/pt-BR.ts`)
- [ ] T047 [US4] Camada 3: estender `field.golden.ts` com caverna escura real (o mapa tem `weather` 11 em `map-headers.json`, Flash ilumina) e com a lista do Fly (só visitados, pontos existentes em `fly-points.json`)
- [ ] T048 [US4] Camada 4: capturas `05-fly-map.png`, `06-dark-cave-no-flash.png`, `07-dark-cave-flash.png` e `08-bike.png`

## Phase 7: Polish e fechamento

- [ ] T049 [P] Registrar em `docs/balance-log.md` os desvios: pesca em tempo real (janela de reação, chance de fisgar = `baseBite + friendshipBite·amizade/255`), Headbutt e Rock Smash sorteados no uso, Strength/Whirlpool e demais com a regra do original; spec `specs/025-field-moves-locomotion`
- [ ] T050 [P] Fora do escopo documentado: confirmar que nenhum script de Marcos 4 e 5 nem o Gyarados vermelho foi tocado; registrar no `tasks.md` (notas) se algum golpe do caminho dourado do spec 024 passar a exigir insígnia por bit
- [ ] T051 Rodar typecheck, lint e `npx vitest run` em todos os pacotes; as camadas 1 e 2 passam; anexar abaixo o relatório da camada 3 (`npm run golden -w @soulsilver/app`) e conferir as 8 capturas em `.evidence/025/` (pasta fora do git)
- [ ] T052 Rodar `graphify update .` para manter o grafo atual (regra do projeto)

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
