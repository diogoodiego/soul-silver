# Estado do projeto

Fonte da verdade do que já foi feito. Os prompts dos itens pendentes estão em `docs/roadmap/`,
exportados do documento "Roadmap — SoulSilver Desktop" (uma aba por marco), onde o plano é feito. Atualize este arquivo ao terminar
cada item (ver `CLAUDE.md`).

**Próximo item: 032.7 Verificação**

Versões atuais: protocolo 32, save 18.

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
- [ ] 032.1–032.7 Olivine, Mahogany e Lake of Rage
- [ ] 033.1–033.8 Torre de Rádio até Lugia nas Whirl Islands
- [ ] 034.1–034.6 Victory Road e Liga

## Próximos marcos

- Marco 5 · Kanto: blocos 035–037.
- Marco 6 · Pós-jogo e extras: blocos 038–039; atividades especiais (040+) aguardam decisão.
- Marco 7 · Polimento (P.1–P.4) e lançamento (L.1–L.3).

## Pendências

Itens dados como concluídos com algo ainda em aberto. Resolva quando o item atual tocar no
assunto, ou quando o desenvolvedor pedir.

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
- 031.7: comparação com as páginas 6–20 do detonado pendente (sem capturas; verificação só no servidor); roteiro manual em `.evidence/031/roteiro-manual.md`.

## Decisões

Só o que muda o rumo de itens futuros, uma linha cada.

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
