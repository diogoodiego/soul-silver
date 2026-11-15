# Estado do projeto

Fonte da verdade do que já foi feito. Os prompts dos itens pendentes estão em `docs/roadmap/`,
exportados do documento "Roadmap — SoulSilver Desktop" (uma aba por marco), onde o plano é feito. Atualize este arquivo ao terminar
cada item (ver `CLAUDE.md`).

**Próximo item: 030.8 Goldenrod e Whitney**

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

O trabalho de M4.0 a 030.7 ainda não foi commitado (o último commit é `434794b`).

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
- [ ] 030.8 Goldenrod e Whitney
- [ ] 030.9 Routes 35 e 36, National Park e Sudowoodo
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

## Decisões

Só o que muda o rumo de itens futuros, uma linha cada.

- O Spec Kit não é mais usado. `specs/` é histórico; o trabalho segue os itens do roadmap.
- Só o SoulSilver (EUA) é aceito: Lugia é obrigatório nas Whirl Islands (033.7); Ho-Oh fica no pós-jogo (039.4).
- O bloco 030 começa na página 6 do detonado e inclui o ovo do Togepi (depende do 029).
- A cobertura de mapas por bloco está em `content/roadmap/map-blocks.json`; um bloco só fecha
  sem comandos faltantes nos seus mapas.
