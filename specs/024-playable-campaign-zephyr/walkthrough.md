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
