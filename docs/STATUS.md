# Estado do projeto

Fonte da verdade do que já foi feito. Os prompts dos itens pendentes estão em `docs/roadmap/`,
exportados do documento "Roadmap — SoulSilver Desktop" (uma aba por marco), onde o plano é feito. Atualize este arquivo ao terminar
cada item (ver `CLAUDE.md`).

**Próximo item: 034.5 Balanceamento de Johto**

Versões atuais: protocolo 40, save 20.

## Concluídos

- Marco 0 · Fundação: specs 001–002.
- Marco 1 · Extrator: specs 003–009.
- Marco 2 · Núcleo jogável: specs 010–019.
- Marco 3 · Sistemas da história: specs 020–023, e os blocos abaixo.
  - 024 Campanha jogável até a Insígnia Zephyr (024.1–024.6)
  - 025 Golpes de campo e locomoção (025.1–025.13) — `51613ac`, `f304863`
  - 026 Tempo e Pokégear (026.1–026.9) — `f304863`
  - 027 Itens (027.1–027.12) — `f304863`
  - 028 Interação multiplayer (028.1–028.8) — `8cec2c8`

## Marco 4 · Johto completo (em andamento)

M4.0 a 030.7 commitados em `90850df`; a partir daí, um commit por item.

- [x] M4.0 Tabela de mapas por bloco (`content/roadmap/map-blocks.json`, `npm run maps:blocks`)
- [x] 029.1 Creche
- [x] 029.2 Compatibilidade e geração de ovos
- [x] 029.3 Herança
- [x] 029.4 Eclosão
- [x] 029.5 Ovos de presente
- [x] 029.6 Verificação
- [x] 030.1 Depois da Insígnia Zephyr
- [x] 030.2 Route 32 e Union Cave
- [x] 030.3 Ruins of Alph e Dark Cave
- [x] 030.4 Azalea e Slowpoke Well
- [x] 030.5 Ginásio de Azalea
- [x] 030.6 Bugsy e o rival
- [x] 030.7 Ilex Forest
- [x] 030.8 Goldenrod e Whitney
- [x] 030.9 Routes 35 e 36, National Park e Sudowoodo
- [x] 030.10 Verificação
- [x] 031.1–031.7 Ecruteak até Cianwood
- [x] 032.1–032.7 Olivine, Mahogany e Lake of Rage
- [x] V.1 Visual HD-2D: pós-processamento (avulso; roteiro manual pendente)
- [x] V.2 Visual HD-2D: sombras projetadas (avulso; roteiro manual pendente)
- [x] V.3 Ringue para lutas de treinador em interiores (avulso; roteiro manual pendente)
- [x] R.1 Senha da sala (avulso, bloco R em `docs/roadmap/rede.md`)
- [x] R.2 IPv6 direto (guia em `docs/multiplayer-internet.md`)
- [x] R.3 Convite WebRTC (código copiado, sem servidor próprio)
- [x] R.4 Verificação do bloco R (roteiro manual pendente em `.evidence/R/roteiro.md`)
- [x] R.5 Abrir a porta no roteador por UPnP (roteiro manual pendente em `.evidence/R/roteiro.md`, seção 4)
- [x] 033.1 Torre de Rádio
- [x] 033.2 Ice Path
- [x] 033.3 Blackthorn e Dragon's Den
- [x] 033.4 Oito insígnias
- [x] 033.5 Lutas consecutivas
- [x] 033.6 Kimono Girls
- [x] 033.7 Whirl Islands e Lugia
- [x] 033.8 Verificação (capturas manuais pendentes)
- [x] 034.1 Caminho até a Victory Road
- [x] 034.2 Victory Road e rival
- [x] 034.3 Elite Four
- [x] 034.4 Lance, Hall da Fama e retorno
- [x] H Tela única com HUD e Pokédex-celular (avulso; roteiro manual pendente em `.evidence/H/roteiro.md`)
- [ ] 034.5–034.6 Balanceamento e verificação
- [ ] 034.7 Pendências dos blocos 033 e 034 (lista no roadmap)

## Próximos marcos

- Marco 5 · Kanto: blocos 035–037.
- Marco 6 · Pós-jogo e extras: blocos 038–039; atividades especiais (040+) aguardam decisão.
- Marco 7 · Polimento (P.1–P.4) e lançamento (L.1–L.3).

## Pendências

Itens dados como concluídos com algo ainda em aberto. Resolva quando o item atual tocar no
assunto, ou quando o desenvolvedor pedir.

- H: roteiro manual em `.evidence/H/roteiro.md` (pose e animação da Pokédex, apps cabendo na tela, minimapa, time, golpes em combate).
- H: dois goldens já falham na base (`f56c77f`), independentemente do bloco H: a árvore de Cut do mapa 10 (1041, 219) continua bloqueando em `field.golden.ts`, e a luta com o Gyarados vermelho não começa em `campaign.golden.ts`.
- V.1/V.2: roteiro manual em `.evidence/V.1/roteiro.md` (visual, ajuste das forças em `MAX`/`BLOOM_THRESHOLD`/`MAX_SHADE`, `shadow.bias`, FPS em Alta).
- V.3: mapa 306 sem piso reconhecível (ringue invisível, colisão ok); 4 interiores só com piso, sem parede. Roteiro manual: ida/volta do ringue, texturas, câmera perto das paredes.
- V.3: batalha roteirizada usa a pessoa mais próxima (até 2 tiles) como sprite do treinador no ringue (`shortcut:` em `trainer-battle.ts`).
- V.2: testes de tempo do servidor (`perf`, `trainer-perf`) falham às vezes na suíte cheia e passam isolados; não é do V.2.
- 024: jogada humana do `walkthrough.md` sem comandos de desenvolvimento (manual).
- 032.1: o golden entra direto ao lado da Jasmine; os gatilhos do ginásio de Olivine (z = 23 e 15, 0x410E 1→2→3) não são exercitados.
- 032.1: ligações roteirizadas do Baoba além do índice 0 (desafios da Safari Zone) faltam em `scripted-calls.json`.
- 032.2: a luta do Karate King não é jogada até o fim; a sonda só confere o início e a entrega do Tyrogue com a flag 269 ligada.
- 032.2: ginásio bloqueado e loja suspeita de Mahogany (mapas 87 e 116) sem sonda nem caminho dourado.
- 032.3: recorde de tamanho do Magikarp (BufferRecordSize no mapa 88; BufferMonSize, PlayerHasSpecies, SizeRecordCompare/Update no 295) falta; precisa de campo no save (subir versão).
- 032.3 (`shortcut:`): o golden refaz o boost do time antes do Gyarados para o Pidgey lutar da água e reensina Surf.
- 032.3: jogador só com Pokémon terrestres não consegue lutar com o Gyarados obrigatório no meio do lago (regra de envio da spec 025 + IA passiva); decidir.
- 032.3: ScrCmd_775 (voo do Lance) não é desenhado no cliente.
- 032.4: efeito de `ScrCmd_710` (onResume do B2F) e `ScrCmd_530` desconhecido; hoje são no-op.
- 032.4: armadilhas de warp do B1F e desligar as estátuas pelo computador (89:4, flag 214) sem sonda.
- 032.5: prêmio da luta contra dois treinadores (soma dos dois) não conferido com a fonte original; arg3 do `MultiBattle` ignorado.
- 032.5 (`shortcut:`): o golden faz warp até (30, 20) no B2F porque os portões extraídos (pessoas 5 e 6) bloqueiam o `route`.
- 032.5: cliente da luta com aliado não verificado (Pokémon do Lance com sprite de treinador classe 123).
- 032.6 (`shortcut:`): velocidade do deslize no gelo = corrida (`SLIDE_SPEED_PX`), valor original não lido da ROM.
- 032.6: bloco de gelo empurrado salta ao fim do deslize e só se move para quem empurrou; exigência de Strength e reset ao reentrar não conferidos.
- 032.6: golden confere treinadores do ginásio de Mahogany só pelo prêmio do Pryce; deslize pausado por batalha não verificado no cliente.
- 032.7: M4.0 do bloco com 19/21 mapas limpos; 88 e 295 dependem do recorde de tamanho do Magikarp (campo novo no save).
- 033.1 (`shortcut:`): disfarce Rocket não desenhado (RocketCostumeFlagAction no-op); ScrCmd_109 (tipo de movimento) não aplicado; ScrCmd_622 lido como direção da pessoa (inferido do mapa 200).
- 033.1: golden passa pelos andares 2F–5F da Torre e pelo armazém (201/202) por warp/route sem lutar com os grunts de visão; loteria, senha da Buena e Machokes do mapa 200 fora do golden.
- 033.1: o tile do gatilho do rival no 1F (23, 5) é também a escada; depois da cena o jogador sobe para o 2F.
- 033.2 (`shortcut:`): a pedra que cai num buraco do B1F mostra a rocha do B2F pelo buraco (`boulderHoles` em `content/field/moves.json`, casada pelo ponto de queda do jogador), não pela pedra; regra original não conferida com o pokeheartgold.
- 033.2: a extração dos mapas subiu para v12 (cavernas sem a fileira de cima liberada; interiores seguem liberando, as viagens do Spinarak de Azalea passam por cima delas); quem tem extração antiga precisa reextrair os mapas (o app faz sozinho pela versão da etapa).
- 033.3 (`shortcut:`): plataformas do ginásio de Blackthorn sem desenho no cliente (modelos 120/121 não enviados como props), sem animação nem som de movimento/batida; o servidor move e gira e trava a lava.
- 033.3: no Dragon's Den (253) o extrator marca as paredes do santuário (x 27 e 29, z 43–49) como `levelTransition`; não atrapalha o caminho, mas é colisão errada.
- 033.7 (`shortcut:`): cenas visuais do Lugia (sino, câmera, ondas, olhos, chegada, barras de cinema, ScrCmd_805, ProcessSoundplate) e a asa do monge (ShowLegendaryWing) são no-op; o golden entra nas Whirl Islands por warp no mapa 243 e vence o Lugia por nocaute (captura não exercitada).
- 033.8: mapas do bloco 033 com comandos faltando só em atividades paralelas, sem implementação: loteria (112: LotoIDGet, LotoIDSearch, BufferIntEx, BufferBoxMonNick), senha da Buena (186: GetBuenasPassword), acessórios do Fashion Case (118: ScrCmd_403/406), lojas do subsolo (199: ScrCmd_255/155/154/256/404/492/494/553/830–833, MonAddFriendship, MonAddContestValue), casas de Blackthorn (290: MonGetGender, GetEVTotal; 291: Move Tutor/Relearner). Decidir: implementar num item próprio ou tirar esses mapas do bloco.
- 033.8: capturas manuais pelo `.evidence/033/roteiro.md` e comparação com as páginas 29–37 e 100–104 do detonado.
- 034.1–034.2 (`shortcut:`): o golden cruza por warp a água das Routes 26/27, o interior das Tohjo Falls e os andares da Victory Road (até a cena do rival).
- 034.4 (`shortcut:`): animação do Hall da Fama e créditos não desenhados; HOFCredits leva o jogador ao quarto (início do jogo novo).
- 034: capturas manuais pelo `.evidence/034/roteiro.md` (páginas 37–40 do detonado).
- 033.3: o golden ensina o HM05 (Whirlpool) no Dragon's Den para cruzar o redemoinho (13–15, 36–38) até a porta do santuário.
- 033.2: o golden pega o HM04 da Route 42 no começo do Ice Path (antes passava por warp) e o ensina ao líder; Sayo é empurrada na volta ao 1F.
- 032.7: capturas manuais pelo `.evidence/032/roteiro.md` e comparação com as páginas 21–28 do detonado.
- 025: captura `04-fishing-bite.png` e roteiro manual do tempo de reação na pesca.
- 027: seletor rápido com gamepad (roteiro manual; impedir o Pokémon de andar com o D-pad).
- 027: item escondido 8001 no tile (572,390), fora da grade dos mapas 33 e 34; sonda do Dowsing.
- 027: captura do seletor de apricorns do Kurt (`06b-kurt-choice.png`).
- 030.8: elevador da loja de departamentos (mapa 441): faltam BufferDeptStoreFloorNo e ElevatorCurFloorBox, e a tabela de andares {200: 0, 191–196: 1–6}; escadas cobrem os andares.
- 030.8: Name Rater (206), Game Corner (183, 536) e ScrCmd_722 (519) sem implementação.
- 030.8: Torre de Rádio 1F (112) está no bloco 033 em `map-blocks.json`, mas o quiz roda no 030; comandos faltantes lá (Loto, BufferIntEx etc.) não estão no caminho do quiz.
- 030.8: `trainer-perf.test.ts`, `perf.test.ts` e `extractor/test/sprites/stage.test.ts` falham sob carga paralela (passam sozinhos).
- 030.9: treinadores fora do golden (`shortcut:`): Route 35 nº 5 e National Park 22–24 não iniciam luta; nº 13 dá +0 de dinheiro (teto 999999?); Route 35 nº 0 só à noite (ScrCmd_379); Route 36 nº 3 não inicia luta.
- 030.9: GetItemQuantity (mapa 40, pessoa 0) sem implementação.
- 030.9: o selvagem do encontro fixo é entidade comum (outros jogadores o veem e atacam); só flags e resultado são por jogador.
- 030.9: faltam testes de servidor dos resultados 2 (blackout), 4 (captura) e 5 (fuga) do encontro fixo.
- 030.9: após nocaute, o corpo segue capturável por `faintedSeconds`, mas o script já fechou como vitória e a flag 361 não liga.
- 030.10: comparar capturas de `.evidence/030/` com as páginas 6–14 do detonado; faltam capturas de Route 32/Union Cave, Bugsy e rival.
- 030.10: mapa 158 em `pending` (Union Room com o multiplayer; Primo/Easy Chat em bloco posterior).
- 030.10: devolução do Kenya na Route 31 (mapa 35: KenyaCheck, MonGiveMail, ReturnLoanMon) é do bloco 024; correio não vai à caixa do PC.
- 030.10 (`shortcut:`): trocas sem animação e sem nome/ID do treinador original; Pichu de orelha espetada sem forma; cena do Celebi não desenhada; IsBugContestantRegistered sempre 0; giveMon não guarda item.
- 031.1 (`shortcut:`): saltos dos cães (MoveAction_105–110) sem arco no cliente; golden pula os treinadores da Route 37 por warp.
- 031.2 (`shortcut:`): errante salta para rota aleatória (sem grafo de vizinhas); Latias/Latios ignorados até o Marco 5; saltos do Suicune parados no cliente.
- 031.2: errante é entidade comum (outros jogadores veem/capturam); status volta com duração nova e confusão não é guardada; HP se perde se desconectar com ele no mapa.
- 031.2: CreateRoamer da Burned Tower sondado só com fixture sintético, não com a ROM real.
- 031.3 (`shortcut:`): escuridão e velas do ginásio de Ecruteak não desenhadas (EcruteakGymInit no-op); o caminho não fica invisível no cliente.
- 031.3: cena de entrada do ginásio (var 0x4079 = 0) fora do golden.
- 031.4: flags diárias (2720+, ex. 2744 do Lapras) nunca zeram; Lapras não volta depois de capturado/derrotado (precisa do dia no save).
- 031.4: chegada surfando ao Lapras e o percurso de Surf na Union Cave/Ruins não sondados (save não guarda estado de surf).
- 031.5 (`shortcut:`): tabela de andares do elevador só com o farol (1F/6F); destino do elevador fora do save (salvar dentro perde a saída).
- 031.5: ElevatorAnim, MakeObjectVisible, ScrCmd_374 e ScrCmd_459 sem desenho no cliente; golden pula treinadores das Routes 38/39 e o gatilho da Route 39 (278,171).
- 031.5: interiores de Olivine (226–231, 240, 330, 367) seguem pending; 229, 240 e 330 com comandos faltando.
- 031.6 (`shortcut:`): cachoeira do ginásio de Cianwood não desenhada; manivela em variável temporária (volta a 0 ao reentrar).
- 031.6: golden pula os nadadores das Routes 40/41 e faz warp até o Sentret quando o caminho trava; cena do Rocket no teatro sem teste de servidor.
- 031.7 (`shortcut:`): CheckReturnLoanMon nunca dá 3 (sem Ball Capsule); ordem das checagens não conferida com o pokeheartgold.
- 031.7: selos só no save, sem tela de Seal Case/Ball Capsule; Shuckle (232) e selos (215) só com testes sintéticos, fora do golden.
- R.1: o painel Online dentro do jogo não tem campo de senha; ao trocar de sessão por ali, só vale uma senha já usada antes com aquele host.
- R.1: a lista de partidas da LAN não indica quais pedem senha.
- R.2: conexão real por IPv6 entre duas casas não testada (roteiro manual no R.4); o rótulo "IP do anfitrião" e o placeholder seguem só com exemplo IPv4.
- R.3: conexão WebRTC real não testada (vitest não tem WebRTC; roteiro manual no R.4); NAT simétrico (4G) não conecta, sem TURN.
- R.3: convidado por convite não reconecta (o botão de reconectar falha com mensagem; precisa de convite novo) e o painel Online mostra "convite" como endereço.
- R.3: o STUN padrão é o público do Google, que vê o IP de quem gera convite; trocável ou vazio nas Configurações.
- R.4: roteiro manual em `.evidence/R/roteiro.md` (senha na LAN, IPv6 entre casas, convite WebRTC, 4G) a cargo do desenvolvedor.
- R.4: `scripts-perf` também falha às vezes na suíte cheia e passa isolado (como `perf`/`trainer-perf`); não é do bloco R.
- R.5: UPnP com roteador real não testado (roteiro manual, seção 4); só IPv4 e TCP; sem NAT-PMP/PCP; se o app morrer sem fechar, a porta fica aberta até 1 h (ou até reiniciar o roteador, nos que só aceitam mapeamento permanente).
- 031.7: comparação com as páginas 6–20 do detonado pendente (sem capturas; verificação só no servidor); roteiro manual em `.evidence/031/roteiro-manual.md`.

## Decisões

Só o que muda o rumo de itens futuros, uma linha cada.

- Hora do jogo escolhida pelo host (app Relógio na tela de início da Pokédex, `setClock`, protocolo 41): o relógio anda a partir dela; a diferença para o PC fica em `clockOffsetMs` no save do host (save v21) e vale para toda a sessão.

- Rede pela internet (bloco R): só IPv6 direto e WebRTC com convite por código copiado; sem relay, VPN ou túnel. A senha da sala é conferida no socket de rede (`ws-listener`), nunca na sessão, e vem das Configurações do host.
- Canais vindos do renderer (R.3) chegam ao servidor como `Link` adotado pelo `ws-listener`, por MessagePort; `null` na porta quer dizer "fechou".
- V.1: com efeitos ligados, o canvas tem o tamanho da tela e a cena é desenhada num render target nativo (`render/post.ts`); quem ler pixels do canvas deve contar com isso.
- H: o jogo é uma tela única (sem as duas telas). O menu é a Pokédex-celular (`hud/PhoneDex.svelte`, poses `docked`/`raised` em `render/pokedex-model.ts`), com cada app numa `MenuPage` roteada por `game/PauseMenu.svelte`. App novo do menu entra em `APPS` (`game/menu-page.ts`).
- H: o cartão do treinador vem da mensagem `trainer-card` (protocolo 36), que o servidor envia quando dinheiro, insígnias, Pokédex ou Hall da Fama mudam. O save 20 traz `trainerId` (obrigatório) e `startedAt` (opcional); o `restartStory` mantém os dois.
- V.2: sombra sem iluminar os materiais (camada `SHADE` sobre o mapa); um item futuro de luz real deve substituir essa camada, não somar.

- 033.1: Routes 44–46, Ice Path, Blackthorn, Dragon’s Den e o subsolo de Goldenrod (118, 199–202) entraram no bloco 033 em `map-blocks.json`; Dark Cave (123) segue pendente.
- 033.1: uma pessoa parada num tile de porta (warp sólido) bloqueia a entrada (`afterMove`); o golden aceita `route` até um warp e mira treinadores pela posição atual.
- 033.2: cavernas não liberam a fileira de cima de áreas bloqueadas altas (extração v12): a parede vale como na ROM.
- 033.3: o ginásio de Blackthorn segue `src/field/gymmick/blackthorn.c` do pokeheartgold (`field/blackthorn-gym.ts`): estado por jogador, reiniciado pelo BlackthornGymInit a cada entrada; lava (0x2C) sem plataforma é parede só para quem tem o estado.
- 033.5: o modo de lutas consecutivas já vinha das regras do bloco 022 (sem cura entre lutas, itens dentro e fora delas, derrota com WhiteOut no script); o item só acrescentou os testes de harness (`trainer-battle-sequence.test.ts`).
- 034.4: o Hall da Fama fica em `save.hallOfFame` (save 19, até 30 equipes, sem ovos); protocolo 34.
- 033.1: `GOLDEN_RESUME="<save>:<marco>"` retoma o golden de um save do `keep` (só desenvolvimento; a verificação é a corrida completa).
- WildBattle com shiny 1 gera o selvagem fixo shiny (`wilds.place(..., shiny)`), sem mudar protocolo nem save.
- `StaticWildWonOrCaughtCheck` dá 1 quando o Pokémon fugiu (necessário para os Electrodes do mapa 248).
- O HM 424 (Whirlpool) é entregue no fim do esconderijo (032.4), não no 032.6.
- Luta com aliado NPC: derrota do jogador é derrota dos dois; aliado sem Pokémon deixa o jogador sozinho, vitória conjunta.
- Lutas contra dois treinadores (MultiBattle e TrainerBattle com 2º treinador) pagam e marcam os dois.
- Gelo é lido pelo comportamento do tile (`isIce`, 0x20 sem bloqueio), sem nova categoria no schema.
- Objetos com sprite 406 sem script são blocos de gelo: empurrados sem Strength, deslizam no gelo; reusar no Ice Path (033.2).
- O Spec Kit não é mais usado. `specs/` é histórico; o trabalho segue os itens do roadmap.
- Só o SoulSilver (EUA) é aceito: Lugia é obrigatório nas Whirl Islands (033.7); Ho-Oh fica no pós-jogo (039.4).
- O bloco 030 começa na página 6 do detonado e inclui o ovo do Togepi (depende do 029).
- A cobertura de mapas por bloco está em `content/roadmap/map-blocks.json`; um bloco só fecha
  sem comandos faltantes nos seus mapas.
- O quiz da Radio Card (112, 29:2) é obrigatório antes do ginásio de Goldenrod: libera a porta pela flag 792.
- WildBattle (encontro fixo) é um selvagem real-time por jogador; BattleOutcome 1/2/4/5 = nocaute/blackout/captura/fuga, e o `onLoad` do mapa roda antes de o script retomar.
- Route 36 passou para o bloco 030 em `map-blocks.json`; o Bug-Catching Contest segue fora.
- Trocas com NPC vêm de `npc-trades.json` (a/1/1/2, estágio de eventos); o membro guarda `trade`/`mail` (save 16).
- Comandos só visuais das cenas de lendários (ScrCmd_523, MoveAction dos saltos) não fazem nada no servidor (COSMETIC).
- Errantes ficam em `save.roamers` por jogador, mudam de rota a cada troca de mapa e aparecem na grama como selvagens "skittish"; nocaute grava var 0x4045+id = 2.
- Route 42 (44, 132) e Mt. Mortar 1F (119) passaram para o bloco 031: o HM04 vem do gatilho da Route 42 (var 0x4091).
- Warp com destino 4095 é o destino dinâmico do jogador (`data.dynamicWarp`, "mapa:âncora"); todo warp comum grava a origem.
- Farol (115, 220–225, 446) e Olivine City (77) passaram para o bloco 031; o ginásio de Olivine (138) segue no 032.
- O HM03 (Dance Theater, mapa 86) faz parte do caminho dourado do 031; um Sentret capturado na Route 29 usa o Surf.
- Seal Case é `save.seals` (id 1–80 → 1–99; nomes do banco 16 em runtime); a tela de Ball Capsule parte dele.
- Verificação só pelo servidor (golden, sondas, harness): não abrir o app nem fazer capturas (pedido do desenvolvedor).
- V.3: luta de treinador em mapa `indoor` vai para a área `ring:<mapa>:<batalha>` (18×18, só o lutador); scripts e roamers ignoram a ida e a volta; o save guarda a posição de antes.
- R.5: abrir para a internet é opcional e explícito (botão no painel Online), nunca automático ao hospedar; o mapeamento UPnP vive e morre com a porta do host (`unlisten`).
- Bloco H: todo golpe leva ao menos 0,5 s de preparo (`minCastS` em `content/combat/tuning.json`), para a área e a carga serem vistas e desviadas; os testes de mecânica usam `minCastS: 0` (`combatData()`).
- Bloco H: nenhum golpe prende o Pokémon durante o preparo (o campo `rooted` das archetypes ficou sem uso); a direção do golpe é a do início do preparo.
- Bloco H: o papel de uma pessoa (`data.role`: shop, heal, battle, none) vem dos comandos que o script dela alcança (`packages/server/src/npc-roles.ts`); "Falar" (a tecla de interagir) num vendedor ou enfermeira roda o script respondendo "até logo" ao menu e "não" à pergunta; "Loja", "Vender" e "Curar" agem sem script (`npc-action`, protocolo 40). As opções usam os botões dos golpes: interagir (A, o do golpe 1 no controle), golpe 2, golpe 3. O caminho em que o script abre a loja ficou para placas e scripts de história (test/shop.test.ts usa uma placa).
