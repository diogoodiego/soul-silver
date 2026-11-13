# Tasks: Campanha jogável até a Insígnia Zephyr

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: obrigatórios pela constituição (princípio V, test-first): cada teste é escrito e falha antes da implementação. Render e UI ficam isentos, com verificação manual. O caminho dourado local (US6) é a verificação com dados reais exigida pelo princípio V; o spec só fecha com ele passando.

**Format**: `- [ ] [ID] [P?] [Story?] Descrição com caminho`

## Phase 1: Setup

- [X] T001 Clonar pret/pokeheartgold fora deste repositório e registrar em `specs/024-playable-campaign-zephyr/research.md` (R1) arquivo, função e símbolo da rotina que inicializa o jogo novo (mapa/posição, flags, vars), mais o NARC e os argumentos de `MsgBoxExtern`/`GetStdMsgNaix` (R3) e o comportamento de `TempBGM`/`ScrCmd_729`. Resultado: flags vêm do script já extraído 9600 (`_std_init`, arquivo 149); posição de `sLocation_PlayerRoom` no ARM9; comandos em R3
- [X] T002 [P] Rodar `graphify query "extractor stage events script-commands"` e anotar em `research.md` o padrão de estágio a seguir (`packages/extractor/src/events/stage.ts`, `packages/extractor/src/pipeline/registry.ts`). Resultado em R10

## Phase 2: Foundational (bloqueia todas as histórias)

- [X] T003 [P] Teste vermelho do schema em `packages/shared/test/events/new-game.test.ts` (schemas no codec dos eventos, que é quem grava os arquivos): `facing` fora de north/south/east/west, `map`/`tx` negativos, `ty` não inteiro e `initScript` ausente são recusados com arquivo e caminho; `std-messages` com `banks` vazio é recusado
- [X] T004 Implementar os schemas zod `newGameFile` (`map`, `tx`, `ty`, `facing`, `initScript`) e `stdMessagesFile` (`banks: u16[]`, não vazio) em `packages/shared/src/events/schemas.ts`, registrados no codec de `parseEventsFile` ([contracts/new-game-data.md](contracts/new-game-data.md))
- [X] T005 [P] Teste vermelho de `applyNewGame` em `packages/shared/test/save/new-game.test.ts`: o save resultante tem `area`, posição no centro do tile em pixels (`MAP_TILE_PX`), `facing`, `flags: [960]` (`NEW_GAME_FLAGS`, de `NewGame_InitSaveData`, research R1), party e dex vazios, `vars: {}` e `storyRev: 1`
- [X] T006 Implementar `applyNewGame(save, start)` e `NEW_GAME_FLAGS` em `packages/shared/src/save/new-game.ts`, exportados por `@soulsilver/shared/save`
- [X] T007 [P] Teste vermelho da migração em `packages/shared/test/save/migrate-v8.test.ts`: save v7 migra para v8 com `rivalName: ""` e `storyRev: 0`, sem tocar nos demais campos; save v8 válido passa; `rivalName` acima de `PLAYER_NAME_MAX` e `storyRev` negativo são recusados
- [X] T008 Subir `SAVE_SCHEMA_VERSION` para 8, adicionar `STORY_REV = 1`, `rivalName` (string, 0..`PLAYER_NAME_MAX`) e `storyRev` (int ≥ 0) em `packages/shared/src/save/schema.ts` e a migração 7→8 em `packages/shared/src/save/migrate.ts`; fixtures de save atualizadas (`test/save/v7.ts` agora aplica 6→7→8, coherence, protocol, harness do servidor, testes do app) ([contracts/save-v8.md](contracts/save-v8.md))
- [X] T009 [P] Teste vermelho do extrator em `packages/extractor/test/events/new-game.test.ts`: `readNewGameStart(arm9, offset)` lê `{ map, tx, ty, facing }` (direção 0 norte, 1 sul, 2 oeste, 3 leste) e recusa warpId ≠ 0xFFFFFFFF, direção > 3 e offset fora; `readStdMessageBanks(ov1, { offset, count })` lê a tabela e recusa offset fora. Offsets fixos, conferidos na ROM dos EUA (convenção do repositório, como `SHOPS`): ARM9 `0xfa17c`, overlay 1 `0x20ec8`, ambos únicos
- [X] T010 Implementar os dois leitores em `packages/extractor/src/events/new-game.ts`, os offsets `NEW_GAME_LOCATION`, `INIT_SCRIPT` e `STD_MESSAGES` em `packages/extractor/src/events/layout.ts`, a gravação de `new-game.json` e `std-messages.json` em `packages/extractor/src/events/stage.ts`, e `eventsStage.version` 4 → 5; `packages/extractor/test/events/stage.test.ts` cobre os dois arquivos
- [X] T011 `loadScripts` em `packages/app/src/server-host/scripts-loader.ts` lê `new-game.json` e `std-messages.json` e os expõe como `ScriptData.newGame` e `ScriptData.stdMessageBanks` (`packages/server/src/scripts.ts`); arquivo inválido é registrado com arquivo, campo e problema e fica de fora (teste `packages/app/test/scripts-loader-new-game.test.ts`)
- [X] T012 [P] Teste vermelho do protocolo v17 em `packages/shared/test/game/protocol-v17.test.ts`: pedido `name` (`purpose: "rival"`), buffer `rival`, `script-answer` com `text` (até `PLAYER_NAME_MAX`), `debugWarp`, e `script-debug` com `objects`, `triggers` e `changes` (até 64). `staleStory` no resumo de slot fica em T041 (IPC, não protocolo)
- [X] T013 Adicionar esses campos em `packages/shared/src/game/protocol.ts` (estendendo `script-debug` e `script-answer` em vez de criar mensagens novas), `PROTOCOL_VERSION` 17 em `packages/shared/src/protocol-version.ts`; o servidor envia os painéis vazios até US5; o cliente mostra o buffer `rival` em `packages/client/src/GameSession.svelte` ([contracts/protocol-v17.md](contracts/protocol-v17.md))

**Checkpoint**: contratos, extração de estado inicial e migração prontos.

## Phase 3: User Story 1 - Jogo novo começa como o original (P1) 🎯 MVP

**Objetivo**: jogo novo no quarto, cena da mãe e eventos de New Bark disparando.

**Teste independente**: criar save, conferir mapa/posição, concluir a cena da mãe e ver `0x4106 = 1`.

- [X] T014 [P] [US1] Teste vermelho em `packages/app/test/save-store.test.ts`: `create(slot, name, character, overwrite)` (sem `starter`) grava `storyRev: 1`, área 64 no centro do tile (6, 6), `facing: "south"`, `flags: [960]`, party e dex vazios; sem `new-game.json` a criação falha com motivo claro e o slot fica vazio. O teste antigo "starts a new game with the chosen starter" saiu (comportamento removido pelo spec)
- [X] T015 [US1] `create` sem `starter` aplica `applyNewGame` em `packages/app/src/main/save-store.ts`; `packages/app/src/main/starter.ts` apagado; IPC sem `starter` em `packages/shared/src/ipc.ts`, `packages/app/src/preload/index.ts` e `packages/app/src/main/index.ts`; o processo principal lê `new-game.json` por `readNewGameStart` (`packages/app/src/server-host/extracted.ts`) e converte o tile da matriz para o canto do mapa pela origem do mundo
- [X] T016 [P] [US1] Teste vermelho em `packages/server/test/new-game-start.test.ts` (fixture sintética): num save recém-criado, o `initScript` roda até o fim antes do primeiro mapa (a pessoa escondida pela flag nunca aparece), liga a flag e grava a var da loteria; não roda num save já jogado nem sem `newGame` na extração. A cena com `var 0x4106 = 0` já era coberta pela tabela de frames (`scripts-contexts.test.ts`) e foi conferida com a ROM real em `packages/app/test/new-game-local.test.ts`
- [X] T016a [US1] `join` em `packages/server/src/scripts.ts` roda o script de inicialização quando o save é recém-criado (`intro`: `rev === 0 && playTimeMs === 0`, o mesmo critério da fala do Oak), antes de `enterMap`, como `RunInitScript` antes do campo; se o script parar antes do fim, é encerrado e registrado em log. `LotoIDSet` em `packages/shared/src/script/handlers/flags.ts` grava `random16()` em `VAR_LOTO_NUMBER_LO` (0x403C), como a versão de varejo (o bug sobrescreve a mesma var); `random16` novo no `ScriptHost`, servido pelo RNG semeado do servidor
- [X] T017 [US1] O jogo novo não usa mais `startPosition`: a posição vem de `new-game.json`. `packages/server/src/start.ts` **fica**, porque `session.ts` o usa como "casa" do blackout sem Centro Pokémon (fora do escopo deste spec)
- [X] T018 [US1] `packages/client/src/NewGame.svelte` pede só nome e personagem; chaves `newGame.starter` e `newGame.starterRequired` removidas de `packages/client/src/i18n/pt-BR.ts` (`game-data.ts` continua em uso em outros lugares)
- [X] T019 [US1] Verificação manual (skill `run-soulsilver`): jogo novo → quarto → térreo → cena da mãe → New Bark reage. **Concluída (slot 3, 2026-10-29)**: New Bark roda a cena do Marill no app (842:3, amiga entra em cena). Histórico: criação pede só nome e personagem; save v8 no mapa 64 (104,104) virado para o sul; fala do Oak; flags do `_std_init` e `0x403c` no depurador; a escada leva ao mapa 63. Com `TempBGM`/`ResetBGM` (adiantados de T032) a cena da mãe roda até o fim no app (0x4106 = 1) e, na sonda, a do Marill em New Bark (0x4106 = 2). O time e a mochila de desenvolvimento deixaram de valer para saves da história nova. Passos seguintes e comandos faltantes do caminho principal em [walkthrough.md](walkthrough.md). Achado de passagem: o depurador descartava o quadro da fala do Oak (`file: -1`); o protocolo aceita -1 agora

**Checkpoint**: MVP: a história sai do quarto.

## Phase 4: User Story 2 - Inicial no laboratório (P1)

**Objetivo**: inicial dado pelo script do Elm, com marco registrado.

**Teste independente**: com a história no ponto certo, concluir a cena e ver o Pokémon no time.

- [X] T020 [P] [US2] Teste vermelho em `packages/shared/test/script/give-starter.test.ts` (script sintético): o comando de dar Pokémon adiciona ao time e marca visto/capturado na dex; time vazio antes. Feito: `ChooseStarter` + `SetFlag 0x6A` dá o inicial ao time vazio e liga FLAG_GOT_STARTER; o atalho da spec 017 (pular a cena com inicial no time) saiu
- [X] T021 [US2] Ajustar o handler de Pokémon em `packages/shared/src/script/handlers/pokemon.ts` apenas se T020 mostrar que a dex não é atualizada (R2). Sem mudança: o host do servidor já marca visto e capturado ao dar o Pokémon (scripts.ts, `giveMon`)
- [X] T022 [US2] Verificação manual: laboratório do Elm → escolha pela cena → time com 1 Pokémon e flag de marco ligada. Feito no app (slot 3, 2026-10-29): bolas 3D na máquina, tela de escolha com prévia, Cyndaquil Nv. 5 no time, flag 106 ligada

## Phase 5: User Story 3 - Cada personagem em um único lugar (P1)

**Objetivo**: nenhum duplicado em nenhum marco.

**Teste independente**: listar objetos visíveis em New Bark e casa no jogo novo.

- [X] T023 [P] [US3] Teste vermelho em `packages/shared/test/game/duplicates.test.ts`: `findDuplicates(objects, visibleFilter)` detecta mesmo sprite+mesmo script e pares de versões (R8), e ignora sprites iguais legítimos
- [X] T024 [US3] Implementar `findDuplicates` em `packages/shared/src/game/duplicates.ts` (reusa o filtro de visibilidade existente, sem duplicar a lógica). O filtro chega como função; os pares de versões entram por um terceiro argumento opcional, com as flags de esconder
- [X] T025 [P] [US3] Teste em `packages/server/test/new-game-visibility.test.ts` (fixture com amigo 418/744, Marill 417/744, mãe 678): após `applyNewGame` nenhum duplicado em New Bark e na casa; com 2 jogadores no mesmo mapa, cada um segue as próprias flags. Escrito depois de T024 e já verde, porque US1 corrigiu o estado inicial: o caso de 2 jogadores prova que o teste detecta duplicados. Com a ROM real, `packages/app/test/new-game-local.test.ts` confere os mapas 60, 63 e 64
- [X] T026 [US3] Corrigir o que o teste T025 revelar em `packages/shared/src/maps/collision.ts`/filtro de visibilidade em `packages/server/src/session.ts`, somente se houver defeito além do estado inicial. Sem mudança: não houve defeito

## Phase 6: User Story 4 - Nome do rival e comandos restantes (P2)

**Objetivo**: `NameRival`, `BufferRivalsName`, `MsgBoxExtern`, `GetStdMsgNaix`, `TempBGM`, `ScrCmd_729`; log de faltantes vazio.

**Teste independente**: nomear o rival, ver o nome nas mensagens e após salvar/carregar.

- [X] T027 [P] [US4] Teste vermelho em `packages/shared/test/script/rival.test.ts`: `NameRival` (id 143, arg var) pede texto (`purpose: "rival"`), grava `rivalName` (validação de `PLAYER_NAME_MAX`) e o resultado na var; `BufferRivalsName` (id 191, arg u8 slot) escreve `rivalName` no buffer `slot`. Com 2 jogadores e salvar/carregar em `packages/server/test/story-commands.test.ts`
- [X] T028 [US4] Implementar `NameRival` e `BufferRivalsName` em `packages/shared/src/script/handlers/story.ts`, o prompt de rival em `packages/server/src/scripts.ts` e `packages/shared/src/script/host.ts`, e a UI em `packages/client/src/GameSession.svelte` e `packages/client/src/game/NameInput.svelte`; textos em `pt-BR.ts`. Já existiam; faltavam gravar a var (sempre 0, R3) e o nome padrão da ROM (R4), que estava fixo como "Silver"
- [X] T029 [P] [US4] Teste em `packages/shared/test/script/external-msg.test.ts`: `GetStdMsgNaix` (id 438, args var índice, var destino) grava `banks[índice]` no destino e 0 fora da tabela; `MsgBoxExtern` (id 440, args var banco, var mensagem) mostra `banco:mensagem` do catálogo e espera o jogador como uma caixa de diálogo. Escrito sobre o código já existente, passou de primeira
- [X] T030 [US4] Implementar `GetStdMsgNaix` e `MsgBoxExtern` em `packages/shared/src/script/handlers/story.ts`, com o host lendo os bancos de `std-messages.json` (T011) em `packages/shared/src/script/host.ts` e `packages/server/src/scripts.ts`. Já existiam, sem mudança
- [X] T031 [P] [US4] Teste vermelho em `packages/shared/test/script/music-follow.test.ts`: `TempBGM` (id 87, arg u16 seq) emite música temporária sem mudar a música do mapa, que volta ao trocar de mapa; `ScrCmd_729` (id 729, arg var) grava 1 se o companion está fora da Poké Ball, senão 0. Volta ao trocar de mapa fica no cliente (`reactions.ts`), sem teste automático
- [X] T032 [US4] Implementar `TempBGM` e `ScrCmd_729` em `packages/shared/src/script/handlers/` (música por `desiredMusic`, com `scriptMusic`; companion exposto no host por `companionOut`). `ResetBGM` agora devolve a música do mapa (`bgm-reset`), e o cliente passou a obedecer aos eventos `bgm`, antes ignorados. `script-commands.json` não tem campo de suporte: nada a marcar; o suporte é ter handler
- [X] T033 [US4] Rodar o relatório de comandos faltantes sobre o trecho (extração local) e zerar o que sobrar; registrar o resultado em `research.md` (R3). Caminho principal zerado (`VioletGymElevator` era o último); opcionais listados em `walkthrough.md`

## Phase 7: User Story 5 - Diagnóstico (P2)

**Objetivo**: três painéis no depurador.

**Teste independente**: depurador ligado num mapa com gatilhos mostra as três listas corretas.

- [X] T034 [P] [US5] Teste vermelho em `packages/server/test/debug-panels.test.ts`: com `debugScript` ligado, a entrada no mapa envia `objects` (id, sprite, hideFlag, visible) e `triggers` (condição legível, `met`) em `script-debug`; desligado, nada é enviado; com 2 jogadores, cada um vê os próprios
- [X] T035 [P] [US5] Teste vermelho em `packages/server/test/flag-history.test.ts`: o anel guarda no máximo 64 mudanças `{ tick, kind, id, value, script }` com o script autor (`arquivo:entrada` ou `dev` para `debugSetFlag`); escritas sem mudança ficam de fora; o histórico corre com o depurador desligado
- [X] T036 [US5] Implementar painéis e histórico em `packages/server/src/scripts.ts`, reusando a mesma função de visibilidade/condição do jogo (uma só), e o envio em `packages/server/src/session.ts`. `visibleTo`, `frameMet` e `triggerMet` servem ao jogo e ao painel; o envio já estava em `sendDebug`. Fora do histórico: a flag de treinador gravada por `trainer-battle.ts` e as limpezas temporárias ao trocar de mapa (`shortcut` em `scripts.ts`)
- [X] T037 [US5] Exibir os três painéis em `packages/client/src/game/ScriptDebug.svelte` (`game-connection.ts` já repassava `script-debug`); textos em `pt-BR.ts`
- [X] T038 [US5] Verificação: provocar um gatilho não satisfeito e achar o motivo só pelo depurador. Servidor: `debug-panels.test.ts`. App (slot 3 no laboratório, 2026-11-03, `.evidence/024/us5-debugger-panels.png`): `✗ gatilho 0843:3 · var 0x4108 = 1 @ (3, 11) 4×1`, com 0x4108 = 3 nas variáveis; a policial aparece como `#1 · sprite 34 · escondido pela flag 413 · visível`

## Phase 8: User Story 7 - Saves antigos (P3)

**Objetivo**: aviso e escolha ao carregar save desatualizado.

**Teste independente**: carregar um save v7 e ver o aviso com as duas opções.

- [X] T039 [P] [US7] Teste vermelho em `packages/shared/test/save/restart-story.test.ts`: `restartStory` mantém nome, personagem, `playTimeMs` e `rev`; refaz party, bolsa, dex, flags, vars e posição; `storyRev = 1`. Também `storyUnstarted` (ver T042)
- [X] T040 [US7] Implementar `restartStory` em `packages/shared/src/save/restart.ts` (mesmo caminho do save novo: `migrate` + `applyNewGame`)
- [X] T041 [P] [US7] Teste vermelho em `packages/app/test/save-store.test.ts`: `restartStory(slot)` grava de forma atômica mantendo backup e falha em slot vazio/corrompido e sem a extração; o resumo de slot traz `staleStory` para `storyRev < 1`
- [X] T042 [US7] Implementar `restartStory` e `staleStory` em `packages/app/src/main/save-store.ts`, o IPC tipado em `packages/app/src/preload/index.ts` e `packages/app/src/main/index.ts` (canal `saves:restart-story`). Fora do plano: o script inicial só rodava com `rev === 0 && playTimeMs === 0`, e o recomeço mantém os dois, então a história recomeçada nasceria com personagens duplicados. Agora roda também quando `storyUnstarted` (nenhuma var e só as flags de `applyNewGame`); a fala do Oak segue só para save novo. Teste em `packages/server/test/new-game-start.test.ts`
- [X] T043 [US7] Cliente: aviso "história desatualizada" com **Recomeçar a história** (confirmação explícita) e **Continuar sem garantia** na seleção de slot em `packages/client/src/SaveSlots.svelte` (a seleção de slot fica ali, não em `screens/`); textos em `pt-BR.ts`. Verificado no app (slot 3 com `storyRev` 0, 2026-11-03, `.evidence/024/us7-*.png`): aviso, escolha, confirmação, entrada no quarto (mapa 64, 104,104), save com `rev` e tempo mantidos e backup antigo; ao carregar, o depurador mostra 144 flags com 418, 678 e 744

## Phase 9: User Story 6 - Caminho dourado com a ROM real (P2)

**Objetivo**: `npm run golden` passa do marco 1 ao 10.

**Teste independente**: com a extração local, marcos 1–10 alcançados; sabotar a flag da mãe falha no marco 2 com relatório.

- [X] T044 [P] [US6] Teste vermelho do relatório e do avaliador em `packages/app/test/golden-report.test.ts` (sintético): sucesso lista marcos e total; falha traz marco, check que falhou, último script, posição, condições de scripts/gatilhos e flags/vars do marco; treinador vencido pela flag de derrota; duplicado com os objetos. Fica em `app`, não em `server`: o caminho dourado precisa dos leitores da extração (`server-host/`), que vivem no app
- [X] T045 [US6] Formatador e avaliador em `packages/app/golden/report.ts` e `packages/app/golden/milestones.ts` (marcos como dados: mapa, flags, vars, time, itens, insígnias, rival nomeado, treinador vencido)
- [X] T046 [US6] `debugWarp` em `packages/server/src/scripts.ts` (mesmas coordenadas do comando `Warp` dos scripts) e `packages/server/src/session.ts`; recusado sem depurador ligado, fora de build de desenvolvimento, com script rodando ou mapa inexistente (teste em `packages/server/test/scripts-debug.test.ts`). `game-server.ts` não muda: `devTools` já vem de `devArena`
- [X] T047 [US6] `packages/app/golden/campaign.golden.ts`, `packages/app/vitest.golden.config.ts` e o script `golden` no app e na raiz (`npm run golden`). Os leitores de dados do servidor saíram de `server-host/entry.ts` para `server-host/server-data.ts`, usado pelo processo do servidor e pelo caminho dourado. Lê a extração de `SOULSILVER_DATA` (pasta `stages`) ou da pasta do app; sem ela, falha com mensagem que manda extrair. Não roda o extrator na ROM: a extração local já vem da ROM real e extrair de novo a cada execução só atrasa (research R7). Fora de `npm test` e da CI: o padrão `*.golden.ts` não casa com a config normal (conferido com `vitest list`)
- [X] T048 [US6] Marcos 1–10 percorridos na extração local; ids em `contracts/golden-path.md`. R8 refinado: script dos bancos comuns (ex.: árvores de apricorn, 146:0, na Rota 29) não identifica personagem. Achado no caminho: o jogador travava depois da cena do Mr. Pokémon, mas era o teleporte do piloto para (4, 8) em vez do tapete da porta (4, 9); a cena anda o Mr. Pokémon até (4, 8)
- [X] T049 [US6] Sabotagem: `SetVar` ignorando 0x4106 falha no marco 2 com relatório completo (abaixo); revertido

**Relatório da camada 3 (`npm run golden`, extração local, 2026-11-03, 3 de 3 execuções)**:

```text
ok  1. Jogo novo no quarto
ok  2. Cena da mãe concluída
ok  3. Inicial recebido
ok  4. Running Shoes
ok  5. Mystery Egg e Pokédex
ok  6. Rival vencido e nomeado
ok  7. Ovo entregue ao Elm
ok  8. Poké Balls do tutorial
ok  9. Sprout Tower concluída
ok  10. Falkner e Insígnia Zephyr
10 de 10 marcos
```

Sem comandos faltando, sem jogador travado e log do servidor vazio (o teste exige os três).

**Sabotagem (T049)**:

```text
ok  1. Jogo novo no quarto
FALHOU 2. Cena da mãe concluída: var 0x4106 = 1 (está 0)
  último script: 845:0
  posição: mapa 63, tile (3, 4)
  condições do mapa:
    mapScript 0845:6: var 0x4106 = 3 (não)
    mapScript 0845:0: var 0x4106 = 0 (sim)
  vars: 0x4106 = 0
1 de 10 marcos
```

## Phase 10: Polish

- [X] T050 [P] Registrar em `docs/balance-log.md` que não há desvios (spec sem mudança de balanceamento) e atualizar `docs/` com `pnpm golden`
- [X] T051 Rodar `pnpm -r test` e `pnpm golden`; corrigir regressões
- [X] T052 Rodar `graphify update .`

## Dependencies & Execution Order

- Phase 1 → Phase 2 → histórias. T001 concluída (research R1/R3). T016a depende de T011.
- US1 (MVP) depende da Phase 2. US2 depende de US1. US3 depende de T010/T011 (US1 em paralelo após isso). US4 independente de US1 após Phase 2. US5 independente. US7 depende de T008. US6 por último: depende de US1–US5 (usa os painéis no relatório).
- Dentro de cada história: teste vermelho → implementação → verificação manual.

## Parallel opportunities

- Phase 2: T003/T005/T007/T009/T012 (testes) em paralelo.
- Após Phase 2: US4, US5 e US7 em paralelo com US1.
- T027/T029/T031 e T034/T035 em paralelo.
## Implementation Strategy

- **MVP**: Phase 1–3 (a história sai do quarto) e, em seguida, US2.
- Depois: US3 → US4 → US5 → US7 → US6 (fecha o spec).
- **Risco principal** (antes T001, resolvido): agora é T010, a busca das structs no ARM9/overlay 1 por padrão de bytes; ambiguidade é erro do estágio, não chute.

## Phase 11: Convergence

- [X] T053 Resolver as lutas do caminho dourado com o bot de referência do spec 019 (tirar o `bot` de `packages/server/test/ai-fight.ts` para um módulo exportável e usá-lo em `packages/app/golden/campaign.golden.ts`), removendo o `shortcut` que zera a vida do treinador; o script recebe o fim da luta como no jogo per Como testar/Lutas (contradicts). Feito: o bot saiu para `packages/server/src/reference-bot.ts` (usado por `test/ai-fight.ts` e pelo piloto, que o aplica em toda luta, de treinador ou selvagem). Achados que o atalho escondia: (1) o script dava tempo esgotado esperando a luta (1200 ticks) e a luta do Li morria no meio: luta, loja e PC não têm mais tempo limite (`OPEN_ENDED` em `scripts.ts`, testes em `trainer-battle-start.test.ts` e `shop.test.ts`); (2) o Pokémon do treinador saía dentro da parede quando o treinador fica num altar (Li): `place` em `trainer-battle.ts` para no último tile andável (teste no mesmo arquivo). Com o inicial nível 5 o Li vence: o piloto escolhe Cyndaquil e treina contra selvagens com o bot até dois níveis acima do mais forte do líder (`train`), como um jogador faria
- [X] T054 Passar pelos treinadores das rotas 29 a 31 no caminho dourado e, depois de cada luta (rival, rotas, Sprout Tower, Falkner), conferir flag de treinador derrotado, prêmio igual à fórmula e ausência de novo desafio ao passar de novo na frente per Como testar/Lutas (missing). Feito: Joey, Mikey, Don (Rota 30) e Wade (Rota 31) depois do ovo, como no jogo (antes disso o Joey está escondido pela flag 409). O piloto lê posição, direção e alcance do treinador na extração e entra na linha de visão a partir do tile livre mais distante; o Mikey tem a linha tapada pelas pessoas da cena (flag 406) e é desafiado falando ao lado dele. Rival, Li e Falkner conferidos do mesmo jeito (passar de novo pelo gatilho ou falar de novo). A Rota 29 não tem treinadores
- [X] T055 Check de loja em Cherrygrove no caminho dourado: estoque oferecido = estoque extraído para o momento da história, comprar 1 Potion e vender 1, conferir dinheiro e mochila per Como testar/Loja (missing). Feito: balconista em (2, 6) do mapa 68, falado de (4, 6) por cima do balcão; uma conversa só, como no jogo (comprar, o menu volta, vender, sair). Faltavam `MysteryGift` (0, 1, 7), `MomGiftCheck` e `NopVar490` do script de entrada de toda loja (144:0): implementados em `handlers/mart.ts` com teste em `groups.test.ts`
- [X] T056 Comando de desenvolvimento `debugSetHp` (protocolo, servidor, mesmas travas de `debugWarp`, com teste) e check do Centro de Cherrygrove: HP máximo, status limpo e `respawn` em Cherrygrove depois da enfermeira per Como testar/Centro (missing). Feito: `debugSetHp` em `protocol.ts`, `session.ts` e `scripts.ts` (`setHp`), com as travas do `debugWarp`; testes em `scripts-debug.test.ts` e `protocol-v17.test.ts`. A enfermeira é a pessoa 0 em (8, 11) do mapa 69 (a de (6, 4) é a do Union Room). Faltava `PartyLegalCheck` (4:3): implementado em `handlers/center.ts`. Status não é salvo (só existe em combate), então não há o que limpar fora dele
- [X] T057 Check do PC depois do marco 8: capturar um selvagem (encontro ligado só nesse passo), depositar no PC, retirar e conferir a equipe per Como testar/PC (missing). Feito: o spawn de selvagens fica ligado só na captura e no treino (o piloto zera o limite de spawn, lido a cada tentativa). Captura como jogador: chega perto, botão de combate, o bot enfraquece, o piloto segura o bot e joga a bola. PC pelo tile de (11, 12); menu Someone's PC e o primeiro item, depois cancelar os dois menus
- [X] T058 Segundo jogador na mesma sessão parado em New Bark Town; em cada marco, conferir que os NPCs visíveis para ele seguem as flags dele, não as do primeiro per Como testar/Isolamento (missing). Feito: o segundo jogador ("Kris") começa a própria história e espera em New Bark (690, 402). Em cada marco: os objetos do mapa seguem as flags dele e nenhum personagem que as flags dele escondem chega a ele; o teste exige que as flags dos dois tenham diferido em New Bark (chegou a 2)
- [X] T059 Separar comandos faltantes do caminho principal (reprovam) dos opcionais (listados à parte no relatório) em `packages/app/golden/report.ts` e `campaign.golden.ts`, com teste em `golden-report.test.ts` per Como testar/Comandos faltantes (partial). Feito: `optionalMissing` em `packages/app/golden/report.ts` (comandos do relatório da extração usados nos mapas visitados e nos que as portas deles levam, sem handler e não executados), com teste em `golden-report.test.ts`. O caminho principal reprova com qualquer comando faltando. No percurso real surgiram e foram implementados `MysteryGift`, `MomGiftCheck`, `NopVar490`, `PartyLegalCheck` e `SetPhoneCall`/`RunPhoneCall` (a ligação do Elm na Rota 30, 227:0, texto 0716:33/34; `shortcut` em `handlers/story.ts`: só essa ligação mapeada, como caixa de texto)
- [X] T060 Driver da camada 4 (skill `run-soulsilver`): cliente envia `debugWarp` em build de desenvolvimento; percorrer o trecho com F3 ligado e salvar as 15 capturas 01-quarto … 15-insignia em `.evidence/024/`; conferir cada uma contra o detonado e registrar no `walkthrough.md` per Como testar/Camada 4 (missing). Feito (2026-11-03): as 15 capturas em `.evidence/024/`, conferidas contra o detonado na seção "Roteiro no app" do `walkthrough.md`. Sem mudança no cliente: o driver teleporta por `window.soulSilver.sendGame`. Até o tutorial a campanha foi jogada no app; para PC, Li e Falkner o slot recebeu o save que o caminho dourado grava antes do Li (`GOLDEN_SAVES`), e as lutas foram jogadas no app pelo teclado. Saves do usuário copiados antes e restaurados depois. Achado: autosave no meio de uma cena guardava efeitos parciais (segundo Mystery Egg ao recarregar); ver T064
- [ ] T061 Levar todas as linhas do `walkthrough.md` a "Verificado no app", com jogada humana sem comandos de desenvolvimento registrada, e anexar ao `tasks.md` o novo relatório de `npm run golden` com os checks dos specs 020–023 per Como testar/Definição de pronto (partial)

**Relatório da camada 3 com os checks dos specs 020–023 (`npm run golden`, extração local, 2026-11-03, 3 de 3 execuções iguais, ~57 s cada)**:

```text
ok  1. Jogo novo no quarto
ok  2. Cena da mãe concluída
ok  3. Inicial recebido
ok  4. Running Shoes
ok  5. Mystery Egg e Pokédex
ok  6. Rival vencido e nomeado
ok  7. Ovo entregue ao Elm
ok  8. Poké Balls do tutorial
ok  9. Sprout Tower concluída
ok  10. Falkner e Insígnia Zephyr
10 de 10 marcos
ok  loja de Cherrygrove: loja 0, 4 itens; Potion comprada por 300 e vendida por 150
ok  Centro de Cherrygrove: HP máximo, sem status salvo, retorno no mapa 69
ok  luta do rival (Cherrygrove): treinador 497, flag 1857, prêmio 500, sem novo desafio
ok  PC de Cherrygrove: espécie 16 capturada, depositada e retirada
ok  luta Joey (Rota 30): treinador 8, flag 1368, prêmio 64, sem novo desafio
ok  luta Mikey (Rota 30): treinador 47, flag 1407, prêmio 64, sem novo desafio
ok  luta Don (Rota 30): treinador 249, flag 1609, prêmio 48, sem novo desafio
ok  luta Wade (Rota 31): treinador 4, flag 1364, prêmio 32, sem novo desafio
ok  luta Li (Sprout Tower): treinador 290, flag 1650, prêmio 1200, sem novo desafio
ok  luta Falkner (ginásio de Violet): treinador 20, flag 1380, prêmio 1560, sem novo desafio
ok  isolamento (spec 020): em 10 marcos o segundo jogador viu New Bark pelas próprias flags; até 2 flags de esconder diferentes das do primeiro
11 de 11 checks dos specs 020–023
comandos sem implementação fora do caminho principal (não reprovam): BankOrWalletIsFull, BankTransaction, CameronPhoto, CheckBankBalance, CheckReturnLoanMon, GetPartySelection, GiveRibbon, HasEnoughMoneyVar, KenyaCheck, KenyaCheckPartyOrMailbox, MonGiveMail, MonHasRibbon, PartySelectUI, PhotoAlbumIsFull, ReturnLoanMon, ScrCmd_376, ScrCmd_377, ScrCmd_606, ScrCmd_795, ScrCmd_796
```

Sem comandos faltando no caminho principal, sem jogador travado e log do servidor vazio (o teste exige os três).

**Relatório da camada 3 com os checks dos specs 020–023 e 026–027 (`npm run golden`, extração local, 2026-11-13, 3 de 3 execuções iguais, ~9 s cada)**:

Reforço do caminho dourado: depois do inicial (marco 3), o piloto reconecta com o Cyndaquil no nível 60 (PS cheio e experiência do nível) e mais 100 Potions, e usa uma Potion em combate com 20% do PS ou menos; a captura do PC lança a bola também no selvagem nocauteado, que o jogo deixa capturável por `faintedSeconds` (30 s). Este relatório não prova que o rival se vence com o inicial no nível 5: isso fica para a jogada humana desta tarefa.

```text
ok  1. Jogo novo no quarto
ok  2. Cena da mãe concluída
ok  3. Inicial recebido
ok  4. Running Shoes
ok  5. Mystery Egg e Pokédex
ok  6. Rival vencido e nomeado
ok  7. Ovo entregue ao Elm
ok  8. Poké Balls do tutorial
ok  9. Sprout Tower concluída
ok  10. Falkner e Insígnia Zephyr
10 de 10 marcos
ok  loja de Cherrygrove: loja 0, 4 itens; Potion comprada por 300 e vendida por 150
ok  Centro de Cherrygrove: HP máximo, sem status salvo, retorno no mapa 69
ok  luta do rival (Cherrygrove): treinador 497, flag 1857, prêmio 500, sem novo desafio
ok  ligação do Elm depois do Mr. Pokémon pelo telefone (spec 026): 0716:33
ok  PC de Cherrygrove: espécie 16 capturada, depositada e retirada
ok  ligação da mãe na Rota 30 pelo telefone (spec 026): 0664:22, escolha guardar, FLAG_SYS_MOMS_SAVINGS ligada
ok  luta Joey (Rota 30): treinador 8, flag 1368, prêmio 64, sem novo desafio
ok  Joey oferece o número depois da luta (spec 026): contato 10 registrado
ok  revanche do Joey pelo telefone (spec 026): ligação 0675:10, revanche contra o treinador 279 vencida, seeking desligado
ok  luta Mikey (Rota 30): treinador 47, flag 1407, prêmio 64, sem novo desafio
ok  luta Don (Rota 30): treinador 249, flag 1609, prêmio 48, sem novo desafio
ok  luta Wade (Rota 31): treinador 4, flag 1364, prêmio 32, sem novo desafio
ok  luta Li (Sprout Tower): treinador 290, flag 1650, prêmio 1200, sem novo desafio
ok  luta Falkner (ginásio de Violet): treinador 20, flag 1380, prêmio 1560, sem novo desafio
ok  item 17 (heal) da mochila no fim do caminho
ok  item 468 (none) da mochila no fim do caminho
ok  item 4 (ball) da mochila no fim do caminho
ok  item 155 (heal) da mochila no fim do caminho
ok  item 397 (teach) da mochila no fim do caminho
ok  item 378 (teach) da mochila no fim do caminho
ok  isolamento (spec 020): em 10 marcos o segundo jogador viu New Bark pelas próprias flags; até 2 flags de esconder diferentes das do primeiro
21 de 21 checks dos specs 020–023
comandos sem implementação fora do caminho principal (não reprovam): BankOrWalletIsFull, BankTransaction, CameronPhoto, CheckBankBalance, CheckReturnLoanMon, GetPartySelection, GiveRibbon, HasEnoughMoneyVar, KenyaCheck, KenyaCheckPartyOrMailbox, MonGiveMail, MonHasRibbon, PartySelectUI, PhotoAlbumIsFull, ReturnLoanMon, ScrCmd_376, ScrCmd_377, ScrCmd_795, ScrCmd_796
```

Sem comandos faltando no caminho principal, sem jogador travado e log do servidor vazio (o teste exige os três).

## Phase 12: Convergence

- [X] T062 Atualizar o "Como ficou" da research R7 em `research.md`: lutas pelo bot do spec 019 (sem zerar a vida), treino contra selvagens antes do Li e do Falkner, spawn de selvagens ligado só na captura e no treino, segundo jogador e checks dos specs 020–023 per plan: research R7 (partial)
- [X] T063 Documentar `{ type: "debugSetHp", hp }` em `contracts/protocol-v17.md` (mesmas travas do `debugWarp`: depurador ligado e build de desenvolvimento) per contracts/protocol-v17 (missing)
- [X] T064 Save feito com um script em andamento guarda o estado de antes do script (`snapshot`/`capture` e `onStart` em `packages/server/src/session.ts` e `scripts.ts`), como o original, que nunca salva no meio de uma cena; compras e PC abertos pelo script continuam salvos na hora (`inService`). Teste em `packages/server/test/save-mid-script.test.ts`; `scripts-blocking.test.ts` ajustado. Achado do roteiro no app (T060) per spec Edge Cases ("salva no meio de uma cena") (partial)

## Phase 13: Convergence

- [X] T065 CRITICAL: o `hello.arena` mudou de formato (`{ a, b }` → `{ trainer, team, foe }`) sem mudar `PROTOCOL_VERSION` (17). Subir para 18 com contrato e teste de recusa entre versões, ou registrar no contrato (e na constituição, se for o caso) que o campo `arena`, só de desenvolvimento e só solo, fica fora do protocolo versionado per Constitution (versão do protocolo) (contradicts). Feito: `PROTOCOL_VERSION` = 18, contrato `contracts/protocol-v18.md`, teste de recusa de um cliente v17 em `packages/server/test/arena.test.ts`
- [X] T066 Registrar a arena de testes reformulada (treinador e time do jogador, adversário NPC com time editável ou selvagens com IA/parados, retorno à arena ao perder; `packages/server/src/arena.ts`, `session.ts`, `wild.ts` `place`, `trainer-battle.ts` com time substituto, `packages/client/src/ArenaSetup.svelte`) num contrato desta spec ou numa spec própria, e atualizar `specs/013-realtime-combat/contracts/game-protocol-v5.md`, que ainda descreve `arena: { a, b }` per spec 024 FR-013 (escopo) (unrequested). Feito: `contracts/protocol-v18.md` descreve a arena; o contrato v5 do spec 013 aponta para ele

## Phase 14: Convergence

- [ ] T067 CRITICAL: zerar os erros de lint (`npx eslint`) nos arquivos que este spec mudou e cujas tasks estão concluídas: `packages/client/src/GameSession.svelte` (`svelte/prefer-svelte-reactivity` nas linhas 107, 193, 194; `no-unsafe-argument` na 830), `packages/client/src/audio/reactions.ts` (variável sem uso, 43), `packages/client/src/game/StarterChoice.svelte` (asserção desnecessária, 48), `packages/server/src/session.ts` (`unbound-method`, 266) e `packages/shared/test/save/migrate-v7.test.ts` (`any` e acessos inseguros, 51–59), sem mudar comportamento; rodar typecheck, lint e testes per Constitution (task concluída só com typecheck, lint e testes passando) (contradicts)
