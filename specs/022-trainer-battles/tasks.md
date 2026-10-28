# Tasks: Batalhas contra treinadores

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: obrigatórios pela constituição (princípio V, test-first): cada teste é escrito e falha antes da implementação. Render e UI ficam isentos, com verificação manual.

**Format**: `- [ ] [ID] [P?] [Story?] Descrição com caminho`

## Phase 1: Setup

- [X] T001 Criar o módulo `packages/shared/src/trainer/index.ts` e exportá-lo em `packages/shared/package.json` (`exports["./trainer"]`), seguindo o padrão de `packages/shared/src/ai/index.ts`
- [X] T002 [P] Criar `content/trainer/tuning.json`, `content/trainer/ai-flags.json` e `content/trainer/class-profiles.json` com os exemplos de [contracts/content-trainer.md](contracts/content-trainer.md)
- [X] T003 [P] Registrar perfis de troca e item, limiares e `arenaRadiusTiles` como desvios em `docs/balance-log.md` (valor original, novo, motivo)

## Phase 2: Foundational (bloqueia todas as histórias)

- [X] T004 [P] Teste vermelho dos schemas em `packages/shared/test/trainer/schemas.test.ts`: limiares fora de [0,1] e `typeThreshold` fora de {1, 2, 4} são recusados com arquivo, caminho e problema
- [X] T005 Implementar os schemas zod `trainerTuning`, `aiFlagsFile` e `classProfilesFile` em `packages/shared/src/trainer/schemas.ts` (TrainerProfile: `combat`, `switch{enabled,typeThreshold,hpThreshold,cooldownS}`, `item{enabled,hpThreshold}`)
- [X] T006 [P] Teste vermelho do extrator em `packages/extractor/test/events/trainer-classes.test.ts`: uma tabela de classes sintética gera `{ id, prizeBase, music: "trainer" | "rival" | "leader" }`
- [X] T007 Estender o extrator para gravar a tabela de classes (prêmio base e música por classe) e adicionar o schema `trainerClass` em `packages/shared/src/events/schemas.ts`; ponto de entrada em `packages/extractor/src/events/`
- [X] T008 Carregar `content/trainer/*.json`, os treinadores e as classes no servidor em `packages/server/src/trainer-loader.ts`, seguindo `packages/server/src/ai-loader.ts`
- [X] T009 [P] Teste vermelho do protocolo v15 em `packages/shared/test/game/protocol-v15.test.ts`: as mensagens `trainerSpotted`, `trainerBattleStart`, `trainerSendOut`, `trainerItem` e `trainerBattleEnd` são validadas, e um cliente com versão 14 é recusado
- [X] T010 Adicionar essas mensagens em `packages/shared/src/game/protocol.ts` e subir `PROTOCOL_VERSION` para 15 em `packages/shared/src/protocol-version.ts`
- [X] T011 [P] Teste vermelho do isolamento em `packages/server/test/combat-battle-id.test.ts`: um acerto entre combatentes com `battleId` diferentes não aplica dano; com o mesmo `battleId`, ou ambos `null`, aplica
- [X] T012 Adicionar `battleId: number | null` ao combatente e o filtro de acerto em `packages/server/src/combat.ts`

**Checkpoint**: dados, contratos e isolamento prontos.

## Phase 3: User Story 1 - Treinador avista e desafia (P1) 🎯 MVP

**Goal**: o treinador avista o jogador, mostra o "!", trava o jogador, caminha até ele, desafia e abre a arena; o comando de script `TrainerBattle` usa o mesmo fluxo.

**Independent Test**: um treinador sintético avista o jogador em campo aberto e não o avista atrás de um obstáculo; o bridge `TrainerBattle` inicia a mesma batalha.

- [X] T013 [P] [US1] Teste vermelho em `packages/server/test/trainer-sight.test.ts`: dentro do alcance `param[0]`, na direção `facing` e com linha livre → avista; com obstáculo → não avista; treinador com a flag de derrota daquele jogador → não avista; dois treinadores no mesmo tick → só um desafio
- [X] T014 [P] [US1] Teste vermelho em `packages/server/test/trainer-battle-start.test.ts`: as transições `spotted → approaching → challenge → fighting` acontecem, a arena tem `radiusPx = arenaRadiusTiles × MAP_TILE_PX` centrada no ponto médio, o jogador fica travado, e o bridge `TrainerBattle` cai em `startTrainerBattle`
- [X] T015 [US1] Implementar em `packages/server/src/trainer-battle.ts` a varredura de visão a `sightHz`, só para treinadores num raio de `activationTiles` do jogador, usando `packages/shared/src/ai/sight.ts`
- [X] T016 [US1] Implementar `startTrainerBattle(player, trainerId, npcId)` em `packages/server/src/trainer-battle.ts`: envia `trainerSpotted` com o "!", roda o script de desafio, cria a arena, envia `trainerBattleStart`; regra "um jogador tem no máximo uma batalha"
- [X] T017 [US1] Ligar o bridge `TrainerBattle` a `startTrainerBattle` em `packages/server/src/scripts.ts`
- [X] T018 [US1] Ligar `trainer-battle` ao tick do servidor em `packages/server/src/game-server.ts`
- [X] T019 [US1] Cliente: "!", cena de aproximação local de quem foi avistado e desenho da arena a partir de `trainerSpotted` / `trainerBattleStart`, em `packages/client/src/net/game-connection.ts` e `packages/client/src/render/game-renderer.ts` (verificação manual)

**Checkpoint**: o desafio funciona de ponta a ponta.

## Phase 4: User Story 2 - Lutar contra o time inteiro (P1)

**Goal**: o time sai na ordem original, a IA troca e usa itens, a captura e a fuga são bloqueadas, e as batalhas duplas funcionam.

**Independent Test**: os testes de `decide` e da batalha passam; um treinador sintético com poção usa a poção abaixo do limiar.

- [X] T020 [P] [US2] Teste vermelho em `packages/shared/test/trainer/profile.test.ts`: as flags mapeadas viram perfil, e no conflito vence o bit mais alto; `aiFlags == 0` usa o perfil da classe e depois o `default`; um bit sem mapeamento cai no padrão
- [X] T021 [P] [US2] Teste vermelho em `packages/shared/test/trainer/decide.test.ts`: troca quando a efetividade ≥ `typeThreshold` e existe reserva melhor; não troca durante `cooldownS` nem com time de um só Pokémon; usa poção quando HP < `item.hpThreshold`; não tenta usar item já gasto
- [X] T022 [US2] Implementar `profileFor(trainer, flags, classes)` em `packages/shared/src/trainer/profile.ts`
- [X] T023 [US2] Implementar `chooseSwitch` e `chooseItem` puros em `packages/shared/src/trainer/decide.ts`, usando `effectiveness` de `packages/shared/src/combat/`
- [X] T024 [P] [US2] Teste vermelho em `packages/server/test/trainer-battle-fight.test.ts`: o time sai na ordem; o próximo entra quando um desmaia; o último desmaio termina a batalha; o NPC não pode ser atingido; os Pokémon e o companheiro ficam presos ao raio da arena
- [X] T025 [US2] Implementar o lançamento em ordem, `trainerSendOut`, a contenção na arena e o NPC intocável em `packages/server/src/trainer-battle.ts`, e o raio do companheiro vindo da arena em `packages/server/src/companion.ts`
- [X] T026 [US2] Injetar `AiHooks` de treinador no controlador e executar troca e item com o mesmo tempo de uso do jogador, em `packages/server/src/ai.ts` e `packages/server/src/items.ts`; enviar `trainerItem`
- [X] T027 [P] [US2] Teste vermelho em `packages/server/test/trainer-battle-rules.test.ts`: a Poké Ball contra um alvo de treinador é recusada com o id do texto original; o jogador não consegue fugir nem sair da arena
- [X] T028 [US2] Bloquear a bola em `packages/server/src/capture.ts` e a fuga em `packages/server/src/trainer-battle.ts`
- [X] T029 [P] [US2] Teste vermelho em `packages/server/test/trainer-battle-double.test.ts`: com `doubleBattle`, os dois adversários entram juntos e o segundo Pokémon vivo do jogador entra com a IA como aliado; quando o aliado desmaia, a luta continua
- [X] T030 [US2] Implementar a batalha dupla e o aliado controlado pela IA em `packages/server/src/trainer-battle.ts`

**Checkpoint**: a luta completa contra o time.

## Phase 5: User Story 3 - Recompensas e fim da batalha (P2)

**Goal**: vitória com fala de derrota, prêmio, XP e flag; derrota com blackout; música por classe.

**Independent Test**: o teste de prêmio passa; a vitória grava a flag e o treinador não desafia de novo.

- [X] T031 [P] [US3] Teste vermelho em `packages/shared/test/trainer/prize.test.ts`: `prizeBase × nível do último Pokémon × 4`, ×2 em batalha dupla
- [X] T032 [US3] Implementar `prize()` em `packages/shared/src/trainer/prize.ts` (confirmar a fórmula com o pokeheartgold antes, ver [research.md R4](research.md))
- [X] T033 [P] [US3] Teste vermelho em `packages/server/test/trainer-battle-end.test.ts`: `won` → fala de derrota, dinheiro, XP e flag `trainerFlagBase + trainerId`; `lost` → `blackout` sem flag; `aborted` (desconexão) → sem flag; depois de `won`, passar pela visão não gera desafio
- [X] T034 [US3] Implementar o fim da batalha em `packages/server/src/trainer-battle.ts`, reusando o XP de `packages/server/src/progression.ts` e o `blackout` de `packages/server/src/companion.ts`; enviar `trainerBattleEnd`
- [X] T035 [P] [US3] Teste vermelho em `packages/shared/test/audio/director.test.ts`: `desiredMusic` escolhe trainer, rival ou leader pela classe e toca a fanfarra ao fim
- [X] T036 [US3] Adicionar `trainerBattle`, `rivalBattle` e `leaderBattle` em `content/audio/cues.json` e em `packages/shared/src/audio/cues.ts`, e o tipo de batalha em `packages/shared/src/audio/director.ts`
- [X] T037 [US3] Cliente: fala de derrota, prêmio e música a partir de `trainerBattleEnd` em `packages/client/src/net/game-connection.ts` (verificação manual)

## Phase 6: User Story 4 - Multiplayer sem interferência (P2)

**Goal**: a batalha é de um jogador só, e o mesmo treinador pode lutar com dois jogadores ao mesmo tempo.

**Independent Test**: o teste com dois jogadores no harness passa.

- [X] T038 [P] [US4] Teste vermelho em `packages/server/test/trainer-battle-mp.test.ts`, usando `packages/server/test/harness.ts`: o jogador B não acerta os Pokémon da batalha de A nem entra na arena; A e B desafiam o mesmo `trainerId` e recebem batalhas e arenas independentes; `trainerSpotted` só vai para o jogador avistado
- [X] T039 [US4] Garantir o estado por jogador e a replicação certa (`trainerBattleStart`/`End` para toda a área, `trainerSpotted` só para o jogador avistado) em `packages/server/src/trainer-battle.ts` e `packages/server/src/replication.ts`; marcar o jogador como "ocupado" durante a aproximação

## Phase 7: Polish & Cross-Cutting

- [X] T040 [P] Teste de desempenho em `packages/server/test/trainer-perf.test.ts`: com 4 jogadores e 4 batalhas, a visão e a batalha custam ≤ 0,5 ms por tick
- [X] T041 Confirmar `param[0]` e `trainerFlagBase` com dados reais da Route 29 e ajustar `content/trainer/tuning.json`
- [ ] T042 Rodar [quickstart.md](quickstart.md) completo, incluindo o rival em Cherrygrove, Falkner e o teste LAN com dois clientes
  - Verificado no app (save de teste no slot 3): avistamento, "!", caminhada, fala de desafio, música de treinador, arena, vitória (Joey: ¥64, flag 1368, XP), derrota (blackout, −¥40), fala de derrota, sem novo desafio, fala "depois" ao conversar, Falkner pelo script original (¥1.560, insígnia, flags de Falkner, Abe e Rod). Falta: rival de Cherrygrove (o script usa `ScrCmd_609`, `FadeOutBGM` e `ApplyMovement`, ainda não implementados — spec 021) e o teste LAN com dois clientes.
- [X] T043 Rodar `graphify update .`

## Dependencies

- Setup → Foundational → US1 → US2 → (US3 ∥ US4) → Polish.
- US2 depende de US1 (só há batalha depois do início). US3 e US4 dependem de US2 e são independentes entre si.
- Em cada história, o teste vem antes da implementação.

## Parallel Examples

- Foundational: T004, T006, T009 e T011 juntos.
- US1: T013 e T014 juntos.
- US2: T020, T021, T024, T027 e T029 juntos.
- US3: T031, T033 e T035 juntos. US4 pode correr em paralelo com US3.

## Implementation Strategy

MVP = Phases 1 a 3 mais T024 e T025: um treinador de um Pokémon avista e luta. Depois vêm troca e itens (US2), recompensas (US3) e multiplayer (US4). A cada checkpoint, verificar no app com `run-soulsilver`.

## Phase 8: Convergence

- [X] T044 Implementar os comandos de script `ScrCmd_609`, `FadeOutBGM` e `ApplyMovement` em `packages/server/src/scripts.ts` (teste vermelho antes em `packages/server/test/`) para que a luta contra o rival em Cherrygrove City rode pelo script original e termine com dinheiro e flags corretos per SC-002 (partial)
- [X] T045 Trocar o texto fixo `notice.trainer-ball` de `packages/client/src/i18n/pt-BR.ts` pela mensagem original extraída da ROM (id de texto enviado pelo servidor em `packages/server/src/session.ts`), e cobrir o id no teste da bola em `packages/server/test/trainer-battle-fight.test.ts` per FR-008 (contradicts)
