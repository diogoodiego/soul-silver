# Detonado de referência → scripts da ROM (spec 024)

Referência de ordem e gatilhos dos eventos: o detonado HeartGold/SoulSilver (páginas 1–6) que o usuário forneceu (o PDF não fica no repositório). Cada passo abaixo cita o script real da extração local e o estado que ele deixa. "Verificado no app" = jogado no app com capturas da cena inteira. "Só no servidor" = a sonda sem interface chegou ao fim do script com o estado certo; não mostra o que aparece na tela. Todo script termina com a verificação de que o jogador ainda consegue andar (`checkFree` em `packages/server/src/scripts.ts`).

| # | Detonado | Mapa | Script (arquivo:entrada) | Estado ao fim | Situação |
|---|---|---|---|---|---|
| 1 | Prof. Oak, menino/menina, quarto | 64 | intro sintética + `_std_init` (9600 → 149:0) | flags 418/678/744/960…, 0x403C | Verificado no app |
| 2 | Descer e falar com a mãe (PokéGear) | 63 | frame 0x4106=0 → 845:0 (via script de mapa) | 0x4106 = 1, flags 283–286 | Verificado no app (TempBGM/ResetBGM) |
| 3 | Sair; Marill brincando; amigo vem buscá-lo | 60 | frame 0x4106=1 → 842:3 | 0x4106 = 2 | Verificado no app |
| 4 | Entrar no laboratório; Elm ao telefone | 61 | trigger linha 10, 0x4108=0 → 843:11 | flag 352 | Verificado no app (2026-11-03, camada 4): flag 352 no fim do telefonema do Elm |
| 5 | Escolher o inicial na máquina | 61 | onResume 843:10 (`PlaceStarterBallsInElmsLab`); sign (8,4) → 843:12, `ChooseStarter` | flag 106, inicial no time (apelido opcional, `NicknameInput`); 0x4108 = 1, 0x4072 = 1 | Verificado no app: bolas 3D, tela de escolha com prévia, apelido |
| 6a | Amiga (Lyra/Ethan) na porta do laboratório | 60 | frame 0x4072=1 → 842:8 | 0x4072 = 2 | Verificado no app |
| 6b | Potions do assistente ao sair do laboratório | 61 | trigger linha 11, 0x4108=1 → 843:3, std 2008 | 5 Potions, 0x4108 = 2 | Verificado no app (2026-11-03, camada 4): 0x4108 = 2 ao sair do laboratório |
| 6c | Mãe devolve o PokéGear | 63 | conversa → 845:1 | flag 156 | Verificado no app (2026-11-03, camada 4): flag 156 depois da conversa com a mãe |
| 6d | Elm na saída oeste dá o número | 60 | trigger x=676, 0x407E=0 → 842:2 | 0x407E = 1 | Verificado no app; sem a flag 156 a amiga manda voltar para casa, como no original |
| 7 | Cherrygrove: guia, Running Shoes, mapa | 67 | triggers 0x4073=0 → 850:1, 0x4073=1 → 850:2 | 0x4073 = 2 | Parcial no app (2026-11-03): o guia aparece e conduz o tour (`06-guia-cherrygrove.png`), mas o tour não chegou ao fim nas execuções do driver (cada uma termina antes, e ao recarregar o gatilho só dispara de novo andando por ele); fim do tour (0x4073 = 2) só no servidor |
| 8 | Mr. Pokémon: Mystery Egg; Oak: Pokédex; Elm liga | 143 | frame 0x4107=0 → 229:1 | Mystery Egg, 0x4108 = 3, 0x4073 = 3 | Verificado no app (2026-11-03): `07-mr-pokemon.png`; a ligação do Elm na Rota 30 em seguida (`extra-ligacao-elm.png`, "H-hello? Gold?") |
| 9 | Rival na saída de Cherrygrove; nome do rival | 67/61 | trigger 0x4073=3 → 850:3 (luta 495–497); frame 0x4108=3 → 843:2 (policial: nome do rival, depois o Elm recebe o ovo) | 0x4073 = 4, `rivalName`, flag 121; ovo entregue, 0x4108 = 4 | Verificado no app (2026-11-03): luta do rival vencida pelo teclado (`08-luta-rival.png`), nome "Silver" pela tela de nome, ovo entregue (0x4108 = 4) |
| 10 | Tutorial de captura (5 Poké Balls) | 33 | trigger 0x408B=1 → 225:1 | 5 Poké Balls, flag 154 | Verificado no app (2026-11-03): `12-tutorial-captura.png`, flag 154 no fim |
| 11 | Sprout Tower | 110/155/156 | 3F: trigger 0x40A4=0 → 18:1; Li → 18:2 (luta 290) | flag 118, HM05 | Verificado no app (2026-11-03): cena do rival no 3F e luta do Li vencida pelo teclado (`13-sprout-tower.png`, flags 118 e 1650, HM05). Equipe treinada pelo caminho dourado (ver abaixo) |
| 12 | Falkner, Insígnia Zephyr | 135 | Falkner → 859:1 (luta 20) | insígnia, flag 402, 0x4074 = 1 | Verificado no app (2026-11-03): luta do Falkner vencida pelo teclado (`14-falkner.png`), "Gold received the Zephyr Badge" e prêmio ¥1560 (`15-insignia.png`); insígnias 1, flags 402 e 1380. Equipe treinada pelo caminho dourado |
| 13 | Spec 030.1: sair do ginásio; o Elm liga | 73 | frame 0x4074=1 → 857:0 (std 2039) | flag 159, 0x4074 = 2; flag 407 apagada (assistente aparece no Poké Mart) | Verificado no app (2026-11-14): `.evidence/030/02-ligacao-do-elm.png` |
| 14 | Assistente no Poké Mart de Violet: ovo de Togepi (time de até 5) | 157 | pessoa 4 → 858:2 (`GiveTogepiEgg`) | flag 112, 0x4074 = 3, 0x4108 = 7; flag 568 apagada (Kimono Girl aparece) | Verificado no app: `05-assistente-pergunta.png`, `06-ovo-recebido.png` |
| 15 | Kimono Girl na saída do Poké Mart | 73 | frame 0x4074=3 → 857:4 (std 2067/2068) | flag 568, 0x4074 = 4 | Verificado no app: `08-kimono-fala.png`, `09-kimono-sai.png` |
| 16 | O ovo eclode andando | qualquer | distância andada (spec 029.4), std 2021 | Togepi no time; flag 0x983 (`FLAG_SYS_HATCHED_TOGEPI_EGG`, `sub_02093134`) | Verificado no app: `11-oh.png`, `13-togepi-eclodiu.png` |
| 17 | Mostrar o Togepi ao Elm: Everstone | 61 | Elm (movido para (4, 5) por 843:10) → 843:0, ramo L32 com Togepi à frente | Everstone, flag 114 | Verificado no app: `16-elm-ve-o-togepi.png`; o caminho dourado conversa com ele de (4, 6) |
| 18 | Spec 030.2: Rota 32, Miracle Seed na entrada norte | 36 | trigger (475, 305) 2×1, 0x408D=0 → 232:2 | Miracle Seed (239), flag 116, 0x408D = 1 | Só no servidor (caminho dourado, 2026-11-14) |
| 19 | Treinadores da Rota 32; vendedor de SlowpokeTail recusado e aceito | 36 | pessoas 3–9 e 11 (lutas 49, 27, 60, 18, 57, 26, 56, 383); pessoa 10 → 232:3 | flags de treinador; dinheiro e bolsa iguais depois do vendedor | Só no servidor (caminho dourado, 2026-11-14) |
| 20 | Pescador do Centro Pokémon da Rota 32: Old Rod | 169 | pessoa 4 → 233:1 | Old Rod (445), flag 117 | Só no servidor (caminho dourado, 2026-11-14) |
| 21 | Union Cave até a Rota 33 | 99 → 37 | warp (462, 430) da Rota 32; saída (27, 93) | jogador no mapa 37 | Só no servidor (caminho dourado, 2026-11-14) |
| 22 | Spec 030.3: Ruins of Alph, primeira visita (portão da Rota 32, área externa, centro de pesquisa) | 98 → 113 → 321 | onLoad 37:6 (`MoveWarp`), onTransition 37:5; trigger (441, 286) 0x40FB=1 → 37:7 (só age com um Arceus de evento à frente); diretor → 38:0 (`ScrCmd_545`), pessoa 2 → 38:1 (`CheckSeenAllLetterUnown`) | jogador no mapa 321, flag 271 | Verificado no app (2026-11-14): `.evidence/030/18-ruins-of-alph.png`; centro de pesquisa só no servidor (caminho dourado) |
| 23 | Spec 030.3: Dark Cave pela Rota 31 | 35 → 176 | warp (565, 269) da Rota 31 | jogador no mapa 176 | Verificado no app (2026-11-14): `.evidence/030/19-dark-cave.png` (escura, sem Flash) |
| 24 | Spec 030.4: chegada a Azalea, cena dos Rockets junto ao poço | 74 | trigger (434, 466) 0x4080=0 → 866:3 | 0x4080 = 1, flags 625 e 626; flag 415 apagada (guarda no poço) | Só no servidor (caminho dourado, 2026-11-14) |
| 25 | Kurt em casa corre para o Slowpoke Well | 164 | pessoa 0 → 874:1 | flags 119, 414, 415 | Só no servidor (caminho dourado, 2026-11-14) |
| 26 | Slowpoke Well: Rockets e o executivo Proton; de volta à casa do Kurt, Fast Ball e o número do Kurt pela neta | 74 → 114 → 177 → 164 | warp (433, 454); pessoas 1–3 de 177 (lutas 101, 12, 13); Proton, pessoa 4 → 60:2 (luta 486); frame 0x4080=2 → 874:5 | flags 123, 124, 425; Fast Ball (492); 0x4080 = 4; contato 5 | Só no servidor (caminho dourado, 2026-11-14) |
| 27 | Ginásio de Azalea liberado: o Rocket da porta (pessoa 1 de 74, flag 425) saiu | 74 → 136 | porta (405, 471) | jogador no mapa 136 | Só no servidor (caminho dourado, 2026-11-14) |
| 28 | Spec 030.5: ginásio de Azalea, Spinarak pelos fios até o Bugsy | 136 → 180 | onTransition 869:16 (`AzaleaGymInit`); triggers 869:2–13 (`AzaleaGymSpinarak` 0–11); placas 869:14–15 (`AzaleaGymSwitch` 0–1); fios em `azalea-gym.json` (overlay 4) | caminho 0→4, 7→9, alavanca 0, 9→6, alavanca 1, 6→10; jogador em (9, 6), abaixo do Bugsy | Caminho dourado (2026-11-14) e verificado no app, caminho inteiro (`.evidence/030/azalea-gym/30-carrinhos-nas-paradas.png` a `42-bugsy.png`, com o fio e a alavanca antes e depois em `35` e `36`; treinadores marcados como vencidos por `debugSetFlag`, as lutas ficam com o caminho dourado) |
| 29 | Spec 030.6: Bugsy, Insígnia Hive e TM49 | 180 | Bugsy, pessoa 5 → 869:1 (luta 21); std 2033 com o item 416 | insígnias 2, flags 127 e 1381; treinadores do ginásio marcados (1427–1429, 1370) | Caminho dourado (2026-11-14, bot de referência, prêmio ¥1800) e verificado no app: luta vencida pelo teclado (`.evidence/030/bugsy-rival/01` a `05`), "Gold received the Hive Badge from Bugsy!" com "Você venceu! Ganhou ¥1800." em `06-hive-badge.png` |
| 30 | Spec 030.6: rival na saída oeste de Azalea | 74 | trigger (395, 462) 1×5, 0x4075 = 1 (gravado pelo Proton, 60:2) → 866:2; luta pelo inicial (266, 269 ou 1) | 0x4075 = 2, rival escondido (pessoa 9) | Caminho dourado (2026-11-14, bot de referência, treinador 269, prêmio ¥1152) e verificado no app: luta vencida pelo teclado (`.evidence/030/bugsy-rival/10` a `13`) |

Ruins of Alph e Dark Cave (spec 030.3): os mapas acessíveis (98, 113, 321, 323, 315, 176) não têm comandos faltando, exceto os das câmaras de quebra-cabeça, que ficam para a decisão do Marco 6: `AlphPuzzle`, `OpenAlphHiddenRoom` e `PlayerHasSpecies` (312–318), `ScrCmd_344` e `ScrCmd_527` (323, cena depois de um quebra-cabeça) e `ScrCmd_374` e `MakeObjectVisible` (315, só com 0x40CE = 1). Atalhos: `MoveWarp` não move warps (o primeiro warp de cada tile já é o que ele mantém enquanto 0x403E < 6) e a Pokédex não guarda formas, então um Unown capturado conta como uma forma. Sinjoh Ruins (522/521) só abre com um Arceus de evento.

Ginásio de Azalea (spec 030.5): no overlay 4 (base 0x02253E20) ficam as 12 paradas (0x37B4, x e z u16) e, em 0x3784, um ponteiro por parada para 4 registros, um por estado das alavancas: número de pontos, parada de destino e a polilinha do fio. O início das aranhas (paradas 0, 1, 2 e 7) vem do `InitAzaleaGym` (pokeheartgold `gymmick_init.c`). A alavanca n inverte o bit n de `switches`, conferido no código da ROM: o comando 328 (tabela de comandos na ARM9, 0x020FAD00) chama 0x02254404 no overlay 4, que faz `eor` com 1 (alavanca 0) ou 2 (alavanca 1). Os carrinhos são o modelo 118 (`gym02lift`, construções internas `a/1/4/8`), desenhados como props de script; o carrinho pende uma casa ao sul do ponto do fio (malha de z −2 a 34 px), e o jogador viaja sobre ele, 4 px por tick, descendo do carrinho para a frente no fim do fio. Os fios (115, 116) e as alavancas (117, 122) saem da malha fixa do mapa 180 e viram props na pose em que termina a animação de cada estado: `AzaleaGymSwitch` toca a animação 0 com o bit zerado e a 1 com o bit ligado (`a/1/0/6`: BCA0 25 a 28 para os fios, em que cada pose zera a escala de uma das duas peças; BTP0 23, 24, 41 e 42 para as alavancas, troca de textura). As posições vêm da peça 248 do mapa (`azalea-gym.json`, `levers`). O estado fica na memória do servidor e recomeça ao entrar no mapa, como faz o `AzaleaGymInit`. Atalhos: a velocidade do passeio não foi lida da ROM; as animações aparecem na pose final, sem os 2 ou 3 quadros de transição; o par modelo–animação foi casado pelo nome (`g2rope_1ani1`…), não pela tabela da ROM; os outros jogadores não veem o carrinho de quem passeia.

Equipe do caminho dourado (spec 030.6): ao subir a equipe para o nível 60 (`boosted`), cada membro recebe os golpes que teria subindo de nível (os quatro últimos do learnset, a regra de `wildMoves`). Antes, o Cyndaquil seguia só com Tackle e Leer, e o Gastly do rival em Azalea, imune a golpes Normais, tornava a luta impossível de vencer. A checagem de personagem duplicado ignora agora um bando que aparece e some pela mesma flag (os quatro Slowpokes de Azalea, flag 427).

Triggers (spec 030.5): como no original, um trigger só dispara num passo. Chegar sobre um deles (carregar o jogo, porta, warp) não o roda; atravessar a borda entre mapas do mundo aberto andando ainda conta como passo. Antes, um save feito no meio de um passeio (que guarda o jogador sobre a parada) fazia o passeio disparar sozinho ao carregar.

Fora do caminho principal, a Rota 32 (mapa 36) usa ainda a fita da irmã do dia (`MonHasRibbon`/`GiveRibbon`, fita 63) e as fotos do Cameron (`PhotoAlbumIsFull`/`CameronPhoto`): implementados no save v15 (fitas por membro do time, álbum de até 36 fotos) e no protocolo 28. A foto fica guardada, mas o cliente ainda não mostra a tela da foto nem o álbum.

## Roteiro no app (camada 4, 2026-11-03)

App construído (`npm run build -w @soulsilver/app`, não empacotado: servidor com `devTools`), driver da skill `run-soulsilver`, teleportes por `window.soulSilver.sendGame({ type: "debugWarp", … })` com o depurador ligado (F3). Jogo novo no slot 3 (os saves do usuário foram copiados para `%APPDATA%/SoulSilver Desktop/saves-backup-2026-11-03-t060` antes e restaurados depois; o save final da campanha ficou em `.evidence/024/slot-3-campanha-final.json`).

Até o tutorial de captura a campanha foi jogada no app com o inicial escolhido na tela (Chikorita). Para o PC, o Li e o Falkner o slot recebeu o save que o caminho dourado grava antes do Li (`GOLDEN_SAVES`, `keep` em `campaign.golden.ts`): Cyndaquil nível 12 treinado pelo bot e o Pidgey capturado. As lutas do Li e do Falkner foram então jogadas no app pelo teclado.

| Captura | Detonado | Conferido na imagem |
|---|---|---|
| 01-quarto | Pág. 1: começa no quarto | mapa 64, jogador no quarto, sem script |
| 02-cena-mae | Pág. 1: a mãe chama ao descer | mapa 63, "Hi, Gold! You're finally awake. Your friend Lyra was just here." |
| 03-new-bark-sem-duplicados | Pág. 1: sair de casa | mapa 60 depois da cena da amiga; cada personagem uma vez, lista de objetos com a flag de cada um |
| 04-escolha-inicial | Pág. 1: escolher o inicial | tela das três Poké Balls com prévia (Chikorita, Planta) |
| 05-amiga-porta-lab | Pág. 1: a amiga na porta do laboratório | Lyra com Marill na porta; o rival espia pela janela, como no original |
| 06-guia-cherrygrove | Pág. 2: o guia de Cherrygrove | mapa 67, o guia à frente do jogador ("That's OK!") |
| 07-mr-pokemon | Pág. 2: Mr. Pokémon e o Prof. Oak | mapa 143, Mr. Pokémon andando até o jogador, Oak na sala |
| 08-luta-rival | Pág. 3: o rival na saída de Cherrygrove | arena da luta (TrainerBattle 850:3) com o Cyndaquil do rival |
| 09-loja | Pág. 3: Poké Mart de Cherrygrove | tela de compra: Poké Ball ¥200, Potion ¥300, Antidote ¥100, Parlyz Heal ¥200 (o estoque extraído para 0 insígnias) |
| 10-centro | Pág. 2/3: Centro Pokémon | HP baixado por `debugSetHp` (barra vermelha), enfermeira no balcão perguntando se cura |
| 11-pc | Pág. 3: PC | PC de Pokémon com o Pidgey depositado na BOX 1 e só o Cyndaquil na equipe; retirado em seguida |
| 12-tutorial-captura | Pág. 3: a amiga ensina a capturar | Lyra entra no mato com o Marill (225:1); flag 154 no fim |
| 13-sprout-tower | Pág. 5: Sprout Tower | Li derrotado: "The way you battle is quite elegant." |
| 14-falkner | Pág. 6: Falkner | arena da luta no ginásio de Violet (TrainerBattle 859:1) |
| 15-insignia | Pág. 6: Insígnia Zephyr | "Gold received the Zephyr Badge from Falkner!", "Você venceu! Ganhou ¥1560." |

Achado durante o roteiro (corrigido): um autosave caiu no meio da cena do Mr. Pokémon, depois do ovo e antes das variáveis da cena; ao recarregar a cena rodou de novo e deu um segundo Mystery Egg. Agora o save feito com um script em andamento guarda o estado de antes dele (`snapshot`/`capture` em `session.ts`, teste `save-mid-script.test.ts`); compras e PC abertos pelo script continuam salvos na hora.

Falta: a jogada humana sem comandos de desenvolvimento (T061) e o fim do tour do guia no app (linha 7).


## Comandos sem implementação nos mapas do trecho (relatório da extração, 2026-11-02)

Caminho principal: nenhum. `GiveTogepiEgg` também falta, mas vem depois da insígnia. Correção (2026-11-03, caminho dourado com loja, Centro e lutas reais): o relatório por mapa não contava os prédios, e faltavam `MysteryGift`/`MomGiftCheck`/`NopVar490` (entrada de toda loja, 144:0), `PartyLegalCheck` (enfermeira, 4:3) e `SetPhoneCall`/`RunPhoneCall` (ligação do Elm na Rota 30, 227:0). Todos implementados; a lista dos opcionais agora sai do `npm run golden`.

Fora do caminho principal (opcionais do trecho): fotos (`CameronPhoto`, `PhotoAlbumIsFull`), banco da mãe (`BankTransaction`, `CheckBankBalance`, `BankOrWalletIsFull`, `HasEnoughMoneyVar`, `ScrCmd_795`, `ScrCmd_796`), troca de Violet (`LoadNPCTrade`, `NPCTradeExec`, …), carta do Kenya (`KenyaCheck`, `MonGiveMail`, …), Union Room/PC (`ScrCmd_289`, `PromptEasyChat`, …), fitas (`GiveRibbon`, `MonHasRibbon`), Shiny Leaf (`GetShinyLeafCount`, `TryGiveShinyLeafCrown`, `ShowCertificate`).

A lista da spec ("faltam seis comandos") veio do diagnóstico inicial e estava incompleta; FR "log de comandos faltantes vazio ao fim do trecho" cobre todos os do caminho principal.
