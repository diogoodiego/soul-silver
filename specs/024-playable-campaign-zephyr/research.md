# Research: Campanha jogável até a Insígnia Zephyr

## R1. Origem do estado inicial do jogo novo (flags, variáveis, mapa, posição)

**Confirmado (T001, pret/pokeheartgold clonado em 2026-10-28, `master`)**. O diagnóstico inicial estava errado num ponto: as flags iniciais **estão num script**, e ele já é extraído.

Cadeia do jogo novo no original:
1. `src/overlay_36.c` `ov36_TitleScreen_NewGame_AppExec` → `NewGame_InitSaveData` (L251):
   - `Save_InitDynamicRegion` (save vazio);
   - `Save_SetPositionToPlayerRoom` → `src/location_backup.c` `Location_SetToPlayerRoom`, constante `sLocation_PlayerRoom = { mapId: MAP_NEW_BARK_PLAYER_HOUSE_2F (64), warpId: 0xFFFFFFFF, x: 6, y: 6, direction: 1 (DIR_SOUTH) }` (ARM9, dados somente leitura); logo depois vem `sLocation_OutsidePlayerHome = { 60, -1, 0x2B7, 0x18D, 1 }`;
   - `PlayerProfile_SetMoney(3000)` (já é o padrão do nosso save);
   - `Save_VarsFlags_SetFishingCompetitionLengthRecord(56150)` e `SetFlag960` (`FLAG_UNK_960`, `src/sys_flags.c`) — fora do trecho; aplicar a flag 960 por fidelidade, ignorar o recorde de pesca.
2. Depois da fala do Oak, `gApplication_NewGameFieldsys` → `src/field_system.c` `Field_NewGame_AppInit` → `src/field_warp_tasks.c` `CallFieldTask_NewGame` (L409) → **`RunInitScript`** (`src/script_manager.c` L576) → `StartMapLoadScript(fieldSystem, _std_init)`, que roda o script até o fim de forma síncrona.
3. `_std_init` = 9600 (`include/constants/std_script.h` L619) → `scr_seq_0149_bin` com mensagens `msg_0040` (`src/script_manager.c` L49). O nosso `SCRIPT_BANKS` já tem `{ lo: 9600, file: 149, messageBank: 40 }` (`packages/shared/src/events/refs.ts:21`).
4. `files/fielddata/script/scr_seq/scr_seq_0149.s`: ~140 `SetFlag FLAG_HIDE_*` e um `LotoIDSet`, depois `End`. Inclui, conferido em `include/constants/flags.h`: `FLAG_HIDE_NEW_BARK_MARILL` 0x1A1 = **417**, `FLAG_HIDE_NEW_BARK_FRIEND` 0x1A2 = **418**, `FLAG_HIDE_NEW_BARK_MOM` 0x2A6 = **678**, `FLAG_HIDE_NEW_BARK_FRIEND_2` 0x2E8 = **744**, `FLAG_HIDE_CHERRYGROVE_RIVAL` 0x19C, `FLAG_HIDE_ELMS_LAB_FRIEND` 0x1A6, `FLAG_HIDE_ROUTE_29_FRIEND` 0x1A4 etc. Observação: o "rival" do diagnóstico (418/744) é o **amigo** (Lyra/Ethan) segundo os nomes da decompilação; o objeto 1032 com 417 é o Marill.

**Decisão**:
- **Flags/vars**: nenhum estágio novo de extração. O servidor roda o script 9600 com o interpretador existente, uma única vez, quando o save é criado (equivalente a `RunInitScript`), antes do primeiro tick do jogador. `LotoIDSet` (sorteio do id da loteria) entra como comando suportado que grava a var do original, ou é marcado faltante fora do trecho se não houver var. A flag 960 vem de `NewGame_InitSaveData` (código, não script): ligada pelo mesmo passo de criação, com comentário citando a origem.
- **Mapa/posição**: lidos do ARM9 pelo estágio `events` (versão 4 → 5), como `shops.ts` faz com tabelas fixas: localizar `sLocation_PlayerRoom` pelo par de structs consecutivos `{ m, 0xFFFFFFFF, x, y, d }{ 60, 0xFFFFFFFF, 0x2B7, 0x18D, d }` e gravar `{ map, tx, ty, facing }` em `new-game.json`. Falha da busca = erro do estágio (sem arquivo parcial).
- Validação no teste do caminho dourado (marco 1): após o script, 417, 418, 678 e 744 estão ligadas.

**Conferido na ROM real (US1)**: o script 149 extraído tem 143 `SetFlag`, um `LotoIDSet` e `End`; inclui 418, 678 e 744, mas **não** a 417 (`FLAG_HIDE_NEW_BARK_MARILL`), nem na decompilação. O Marill de New Bark começa visível no original; o "duplicado" do objeto de sprite 1032 (objetos 3 e 9) some porque a 744 esconde o objeto 9. A matriz do mapa 64 começa em (0, 0), então o tile (6, 6) do original é também o tile local; o processo principal converte pela origem mesmo assim.

**Alternativas rejeitadas**: novo estágio que lê "rotina de flags" no código (não existe: são scripts); lista de flags escrita à mão (viola princípio I); heurística de portas (estado atual).

## R2. Inicial pelo script do laboratório

**Decisão**: remover `makeStarter`/`starter.ts` e o parâmetro de `save-store.create`; a criação grava party vazia e dex vazia. O script do Elm usa os comandos de Pokémon existentes (`pokemon.ts`) e liga a flag de marco por conta própria; nenhuma lógica nova de marco.
**Verificar** (tarefa): que o comando de dar Pokémon já registra "visto/capturado" na dex; senão, ajustar o handler (não a criação do save).
**Alternativa rejeitada**: manter o menu e só marcar a flag (diverge do original e quebra a escolha na cena).

## R3. Comandos restantes (confirmado em T001)

Ids e argumentos de `asm/macros/script.inc`; comportamento de `src/`:

| Comando | Id | Argumentos | Comportamento original | Decisão |
|---------|----|-----------|------------------------|---------|
| `TempBGM` | 87 | u16 seq | `src/scrcmd_sound.c` L76 → `sub_02005E44(seq)` (ARM9 0x02005E44, ao lado de `PlayBGM`): troca a música em curso sem mudar a música do mapa | evento de música temporária ao cliente; a música do mapa volta ao trocar de mapa ou com o comando de restaurar já existente |
| `NameRival` | 143 | var | `src/scrcmd_c.c` L2110: tela de nome `NAME_SCREEN_RIVAL`, até `PLAYER_NAME_LENGTH` (7), grava o resultado na var | prompt de texto existente com `purpose: "rival"`; grava `rivalName` e o resultado na var |
| `BufferRivalsName` | 191 | u8 slot | `src/scrcmd_strbuf.c` L41: nome do rival no buffer `slot` | igual, lendo `rivalName` |
| `GetStdMsgNaix` | 438 | var índice, var destino | `src/field/scrcmd_message.c` L51: destino = `ov01_022067C8[índice]`, 0 se fora da tabela | tabela de 4 entradas: `[752, 211, 30, 435]` (msg_0752 dias da semana, msg_0211 golpes de campo, msg_0030 fotógrafo, msg_0435 lojas) |
| `MsgBoxExtern` | 440 | var arquivo, var mensagem | L71: abre o banco `arquivo` de `msgdata/msg` e mostra `mensagem` como caixa de diálogo (espera o jogador) | handler de mensagem existente, com o banco indicado em vez do banco do script |
| `ScrCmd_729` | 729 | var | `src/scrcmd_c.c` L4881: var = 1 se o Pokémon que segue o jogador está ativo, senão 0 | var = 1 se o companion (spec 0xx, `server/src/companion.ts`) está fora da Poké Ball |

**Conferido em US4 (decompilação e ROM real)**:
- `NameRival`: a var é o `noInput` da tela (`src/launch_application.c`), ligado só para apelido (`kind == 1`) ou nome de grupo, então com o rival ela sai sempre 0. A cena 843:436 volta à tela de nome se a var for 1: sem gravar 0, um valor antigo prenderia o jogador nesse laço.
- `ScrCmd_729` lê o companion real: o time pode ter Pokémon com o líder na bola (mapa restrito, espécie grande em interior, time sem vida).
- Música: `ResetBGM` toca de novo a música do mapa (`src/scrcmd_sound.c`). O cliente ignorava todos os eventos `bgm`; agora os obedece. Dez paradas não têm retomada no mesmo script. Uma delas é a cura em 229:35 (`StopBGM`, fanfarra, segue), então a parada vale só até o fim do script. As 25 faixas pedidas por `PlayBGM`/`TempBGM` existem no índice de áudio.
- `VioletGymElevator` só move o elevador. Com um nível de colisão, o caminho a pé da porta (15,27) até a frente do Falkner (15,5) existe, conferido por busca na colisão real do mapa 135, então o comando não faz nada aqui.

**Relatório de faltantes (T033, extração local)**: percorrendo por alcançabilidade os scripts dos mapas 60, 61, 63, 64, 67, 143, 33, 73, 110, 155, 156 e 135, sem treinadores (spec 022), nenhum comando do caminho principal fica sem handler. Sobram opcionais: fotos, banco da mãe, apricorns, golpes de campo, fitas, ligações, itens de TM/MT e `ScrCmd_376`/`ScrCmd_377`/`ScrCmd_061`. Um script que chegar a um deles termina e registra o comando no log. Quem confirma o log vazio ao jogar é o caminho dourado (T048).

**Mensagens externas**: **não** precisa de estágio novo. Os bancos 752, 211, 30 e 435 já estão no catálogo de texto extraído (`text-catalog`), que cobre todos os bancos de `msgdata/msg`. A tabela de 4 ids de `GetStdMsgNaix` fica no overlay 1 (`ov01_022067C8`); ler do overlay pelo mesmo padrão de `shops.ts` dentro do estágio `events` (busca pelos 4 u16 consecutivos). Se a busca for ambígua, registrar aqui e decidir.

## R4. Nome do rival

**Decisão**: `rivalName` no save (v8), padrão vazio. `NameRival` reusa a mensagem de entrada de texto do nome do jogador (mesmas regras: `PLAYER_NAME_MAX`, validação); se o jogador confirmar vazio, usa o nome padrão do original, a mensagem 0254:85 do catálogo (`FIRST_DEFAULT_NAME_RIVAL` em SoulSilver, "Heart" na ROM dos EUA), lida por `scripts-loader.ts`. `BufferRivalsName` escreve o nome no buffer N do runner, como os demais `Buffer*`.
**Alternativa rejeitada**: nome do rival em flag/var (não comporta texto).

## R5. Migração de saves e "história desatualizada"

**Decisão**: schema 7 → 8 adiciona `rivalName: ""` e `storyRev: number`. Migração de qualquer save v≤7 define `storyRev = 0`; saves novos nascem com `storyRev = 1` (revisão que aplica `new-game.json`). Cliente: se `storyRev < STORY_REV` mostra o aviso com as duas opções. "Recomeçar" chama `restartStory` (shared, puro, testado): mantém nome, personagem, tempo de jogo e `rev`, e refaz o resto como save novo com o estado inicial; grava pela gravação atômica (backup do anterior preservado). "Continuar" não altera nada e o aviso reaparece no próximo load (sem estado extra).
**Alternativa rejeitada**: tentar reparar flags automaticamente (spec diz sem garantia; risco de corromper progresso).

**Script inicial na história recomeçada (US7)**: o recomeço mantém `rev` e `playTimeMs`, então o critério antigo do script inicial (`rev === 0 && playTimeMs === 0`) não valia para ele. O servidor passou a rodá-lo também quando a história não começou: `storyUnstarted` (nenhuma var e flags iguais a `NEW_GAME_FLAGS`). Um save jogado sempre tem vars depois do script inicial, porque `LotoIDSet` grava 0x403C, então o critério não o pega. A fala do Oak continua só para save novo.

## R6. Depurador

**Decisão**: estender o `debugScript` (spec 020). O servidor, com o depurador ligado, envia por jogador a cada mudança de mapa e a cada mudança de flag/var: (a) objetos `{ id, hideFlag, visible }`; (b) scripts de mapa e gatilhos `{ kind, script, condition, met }` — a condição é o texto legível já derivável das condições de variável/flag dos dados extraídos; (c) anel de 64 mudanças `{ tick, kind: "flag"|"var", id, value, script }`. O "script autor" vem do runner (arquivo+entrada atuais no momento da escrita; `dev` se vier de `debugSetFlag`). Apenas desenvolvimento, desligado por padrão em cada conexão.
**Reuso**: o mesmo avaliador de visibilidade/condição do servidor alimenta o jogo e o depurador (uma só função), para o painel nunca divergir do comportamento real.

## R7. Caminho dourado local

**Decisão**: `packages/server/golden/campaign.golden.ts`, executado por `pnpm golden` (vitest com config própria, `include: golden/**/*.golden.ts`), que exige `SOULSILVER_ROM` e roda o extrator na ROM em diretório temporário (ou reusa a pasta de dados se `SOULSILVER_DATA` apontar para uma extração válida). Sem a variável, falha com mensagem clara (não passa em silêncio). Não é incluída no `pnpm -r test` nem na CI.
**Como percorre**: cliente de teste no servidor em Node puro (harness existente), enviando inputs de movimento e de confirmação/escolha; teleportes de desenvolvimento (já existe base em `debugSetFlag`; adicionar `debugWarp` somente neste contexto de teste, atrás da flag de desenvolvimento) para pular travessias longas. Lutas (rival, Falkner): o teste vence via comando de desenvolvimento que zera a vida do alvo, ou dando ao jogador nível alto; escolher o mais simples que não fira o servidor autoritativo (usar o próprio mecanismo de dano com Pokémon de nível alto).
**Marcos** (flags/vars lidos por id extraído, listados em `contracts/golden-path.md`, confirmados contra a ROM na primeira execução): 10 marcos da spec; em cada um, ver duplicados (R8).
**Relatório**: marco alcançado; em falha: último script (arquivo+entrada), posição, condições dos scripts de mapa/gatilhos (os mesmos dados do painel R6) e flags relevantes do marco.

**Como ficou (US6, 2026-11-03)**: o caminho dourado vive em `packages/app/golden/`, não em `server/golden`, porque precisa dos leitores da extração do app (`server-host/server-data.ts`, agora compartilhado com o processo do servidor). Lê a extração local (`SOULSILVER_DATA` ou a pasta do app) em vez de extrair a ROM a cada execução: a extração já vem da ROM real, e extrair de novo só atrasaria. O teste falha também com comando faltando, jogador travado ou qualquer linha no log do servidor.

**Revisto (verificação real dos specs 020–023, 2026-11-03)**: a primeira versão vencia as lutas zerando a vida dos Pokémon do treinador e rodava sem selvagens. Esse atalho escondia dois defeitos (o script desistia de uma luta longa por tempo esgotado e o Pokémon do Li saía dentro da parede do altar) e foi proibido. Agora toda luta, de treinador ou de selvagem, é jogada pelo bot de referência do spec 019 (`packages/server/src/reference-bot.ts`), e o script recebe o fim da luta como no jogo. O piloto escolhe Cyndaquil e, antes do Li e do Falkner, treina contra selvagens até dois níveis acima do Pokémon mais forte do líder, como um jogador faria; o resultado é determinístico (semente fixa, 3 de 3 execuções iguais, ~57 s). O spawn de selvagens fica desligado fora da captura e do treino: o piloto zera o limite de spawn, que o servidor lê a cada tentativa (as zonas de spawn de cada mapa ficam em cache, então desligar a tabela de encontros não serve). No percurso também entram loja, Centro e PC de Cherrygrove, os treinadores das rotas 30 e 31 (prêmio pela fórmula, flag e sem novo desafio) e um segundo jogador parado em New Bark cujos NPCs seguem as flags dele. Os comandos sem implementação fora do caminho principal saem do relatório da extração e são listados à parte, sem reprovar.

## R8. Definição de "personagem duplicado"

**Decisão**: no mapa atual, entre objetos visíveis para o jogador (após o filtro de flags), dois objetos são duplicados quando têm o mesmo `spriteId` (e, para o rival/mãe, são o mesmo personagem em versões diferentes). Como sprites iguais podem ser legítimos (ex.: dois treinadores com o mesmo sprite), a regra usa a lista de "personagens de versões" derivada dos próprios dados: objetos cujo `hideFlag` é ligado/desligado por scripts do trecho em pares (versão antiga/nova). Implementação inicial: duplicado = mesmo sprite E mesma tela de interação (mesmo script) OU par de versões conhecido. Refinar na primeira execução real e registrar exceções legítimas aqui.
**Risco**: falso positivo/negativo; mitigado por relatório que lista os objetos envolvidos.

**Conferido na ROM real (US3)**: em New Bark (60), os objetos 4 e 8 (amigo, sprite 101, script 842:4; flags 418 e 744) e 3 e 9 (Marill, sprite 1032, script 842:5; flags 417 e 744) são os únicos pares de mesmo sprite e script, e a regra os pega sem par de versões declarado. Depois do script inicial, nenhum duplicado em 60, 63 e 64. O quarto (64) fica sem objetos visíveis, porque o script inicial esconde os três. A mãe aparece nos mapas 60 e 63, o que não conta: a regra vale por mapa. Os demais marcos ficam para T048.

**Refinado no caminho dourado (T048)**: na Rota 29 (33), as duas árvores de apricorn (objetos 4 e 5, sprite 86) compartilham o script 146:0, do banco comum. Scripts dos bancos comuns (ids a partir de 2000: árvores, itens, treinadores, placas) servem a muitos objetos e não identificam personagem, então a regra só compara scripts do próprio mapa. Com isso, nenhum duplicado nos 10 marcos.

## R10. Padrão de estágio do extrator (T002)

`graphify` liga `SCRIPT_BANKS` a `packages/extractor/src/events/stage.ts` e `events/layout.ts`. O estágio `events` (`eventsStage`, versão 4, entradas `NARC_INPUT, CODE_INPUT, MAPS_INPUT, TEXT_INPUT`) já recebe o ARM9 descomprimido e os overlays, e grava cada arquivo com `write(name, kind, value)` validado por `parseEventsFile`. Tabelas fixas do ARM9 seguem `packages/extractor/src/events/shops.ts` (`readShops(arm9, layout)`, endereços em `events/layout.ts`, `ARM9_BASE`). Os dois dados novos (posição inicial e tabela de `GetStdMsgNaix`) entram nesse mesmo estágio, versão 4 → 5, com um comentário de versão como os existentes ("5: new-game start and std message table (spec 024)").

## R9. Ordem e dependências

R1 destrava tudo (sem o script 9600, duplicados persistem). R2 e R4 independentes entre si. R3 está resolvido. R6 antes de R7 (o relatório reusa os painéis). R5 pode andar em paralelo.
