# Estado do projeto

Fonte da verdade do que já foi feito. Os prompts dos itens pendentes estão em `docs/roadmap/`,
exportados do documento "Roadmap — SoulSilver Desktop" (uma aba por marco), onde o plano é feito. Atualize este arquivo ao terminar
cada item (ver `CLAUDE.md`).

**Próximo item: 030.10 Verificação**

Versões atuais: protocolo 29, save 15.

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
- [ ] 030.10 Verificação
- [ ] 031.1–031.7 Ecruteak até Cianwood
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
- 024: erros de lint em `GameSession.svelte`, `audio/reactions.ts`, `StarterChoice.svelte`,
  `server/src/session.ts` e `shared/test/save/migrate-v7.test.ts` (conferir se ainda existem).
- 025: captura `04-fishing-bite.png` e roteiro manual do tempo de reação na pesca.
- 027: seletor rápido com gamepad (roteiro manual; impedir o Pokémon de andar com o D-pad).
- 027: item escondido 8001 no tile (572,390), fora da grade dos mapas 33 e 34; sonda do Dowsing.
- 027: captura do seletor de apricorns do Kurt (`06b-kurt-choice.png`).
- 030.8: elevador da loja de departamentos (mapa 441, comandos de dynamic warp/elevator) sem implementação; escadas cobrem os andares.
- 030.8: troca Drowzee→Machop (mapa 195) sem os comandos de NPC trade, como a de Violet (162).
- 030.8: Name Rater (206), Game Corner (183, 536), GetPartySlotWithFatefulEncounter (184) e ScrCmd_722 (519) sem implementação.
- 030.8: ScrCmd_522 (mapas 137 e 196) só roda com a flag 2404 de revanche do pós-jogo; ficou de fora.
- 030.8: Torre de Rádio 1F (112) está no bloco 033 em `map-blocks.json`, mas o quiz roda no 030; comandos faltantes lá (Loto, BufferIntEx etc.) não estão no caminho do quiz.
- 030.8: `trainer-perf.test.ts` e `perf.test.ts` falham sob carga paralela (passam sozinhos).
- 030.9: treinadores fora do golden (`shortcut:`): Route 35 nº 5 e National Park 22–24 não iniciam luta; nº 13 dá +0 de dinheiro (teto 999999?); Route 35 nº 0 só à noite (ScrCmd_379); Route 36 nº 3 não inicia luta.
- 030.9: GetItemQuantity (mapa 40, pessoa 0) sem implementação; ScrCmd_607 nos mapas 102/104 (concurso) pendente.
- 030.9: o selvagem do encontro fixo é entidade comum (outros jogadores o veem e atacam); só flags e resultado são por jogador.
- 030.9: faltam testes de servidor dos resultados 2 (blackout), 4 (captura) e 5 (fuga) do encontro fixo.
- 030.9: após nocaute, o corpo segue capturável por `faintedSeconds`, mas o script já fechou como vitória e a flag 361 não liga.

## Decisões

Só o que muda o rumo de itens futuros, uma linha cada.

- O Spec Kit não é mais usado. `specs/` é histórico; o trabalho segue os itens do roadmap.
- Só o SoulSilver (EUA) é aceito: Lugia é obrigatório nas Whirl Islands (033.7); Ho-Oh fica no pós-jogo (039.4).
- O bloco 030 começa na página 6 do detonado e inclui o ovo do Togepi (depende do 029).
- A cobertura de mapas por bloco está em `content/roadmap/map-blocks.json`; um bloco só fecha
  sem comandos faltantes nos seus mapas.
- O quiz da Radio Card (112, 29:2) é obrigatório antes do ginásio de Goldenrod: libera a porta pela flag 792.
- WildBattle (encontro fixo) é um selvagem real-time por jogador; BattleOutcome 1/2/4/5 = nocaute/blackout/captura/fuga, e o `onLoad` do mapa roda antes de o script retomar.
- Route 36 passou para o bloco 030 em `map-blocks.json`; o Bug-Catching Contest segue fora.
