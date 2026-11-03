# Contrato: caminho dourado

Comando: `npm run golden` (raiz; roda `packages/app/golden/campaign.golden.ts` com `packages/app/vitest.golden.config.ts`). Lê a extração de `SOULSILVER_DATA` (a pasta `stages`) ou, sem a variável, da pasta do app (`%APPDATA%/SoulSilver Desktop/extraction/stages`). Sem extração, falha com mensagem que manda extrair. Nunca roda em `npm test` nem na CI.

## Marcos

Cada marco: executa os passos (inputs + teleportes de desenvolvimento por `debugWarp`), espera nenhum script ou luta segurar o jogador por 2 s, espera o próximo save e confere os checks. As lutas (rival, treinadores das rotas 29 a 31, Sprout Tower, Falkner) são resolvidas pelo bot de referência do spec 019; nenhum atalho pula o script de batalha, que recebe o fim da luta como no jogo. Os ids vêm dos scripts extraídos, conferidos com pret/pokeheartgold.

| # | Marco | Checks | Origem |
|---|-------|--------|--------|
| 1 | Jogo novo no quarto | mapa 64; flags 418, 678, 744, 960 | `NewGame_InitSaveData` (960) e script inicial 149:0 |
| 2 | Cena da mãe concluída | var 0x4106 = 1 | 845:0 (`VAR_SCENE_PLAYERS_HOUSE_1F`) |
| 3 | Inicial recebido | time com 1; flag 106; var 0x4108 = 1 | 843:12 (`FLAG_GOT_STARTER`, `VAR_SCENE_ELMS_LAB`) |
| 4 | Running Shoes | var 0x4073 = 2 | 850:1 e 850:2; `GiveRunningShoes` não guarda nada aqui (correr é sempre possível) |
| 5 | Mystery Egg e Pokédex | item 484 na bolsa; flag 107; vars 0x4107 = 1, 0x4108 = 3, 0x4073 = 3 | 229:1 (`FLAG_GOT_POKEDEX`) |
| 6 | Rival vencido e nomeado | var 0x4073 = 4; flag 121; `rivalName` ≠ ""; treinador 495, 496 ou 497 vencido | 850:3 (luta) e 843:2 (`FLAG_GAVE_RIVAL_NAME_TO_OFFICER`) |
| 7 | Ovo entregue ao Elm | item 484 fora da bolsa; vars 0x4108 = 4, 0x408B = 1 | 843:2 (`TakeItem`) |
| 8 | Poké Balls do tutorial | item 4 × 5; flag 154 | 225:1 (`FLAG_WATCHED_CATCHING_TUTORIAL`) |
| 9 | Sprout Tower concluída | flag 118; item 397 (HM05); treinador 290 vencido | 18:2 (Li) |
| 10 | Falkner e Insígnia Zephyr | insígnias ≥ 1; flag 402; var 0x4074 = 1; treinador 20 vencido | 859:1 |

Em todo marco: nenhum personagem duplicado no mapa atual (research R8). No fim: nenhum comando faltando no caminho principal, nenhum jogador travado e log do servidor vazio (sem script encerrado por tempo, teleporte recusado ou script inicial interrompido).

## Checks dos specs 020–023 com a ROM real

| Check | Quando | Confere |
|-------|--------|---------|
| Luta (019/022) | depois de cada luta do trecho | flag de treinador derrotado ligada; dinheiro ganho = fórmula de prêmio; passar de novo na frente do treinador não inicia luta |
| Loja (023) | Cherrygrove, depois do marco 4 | estoque oferecido = estoque extraído para o estado atual da história; comprar 1 Potion e vender 1: dinheiro e mochila batem |
| Centro (023) | Cherrygrove | HP reduzido por comando de desenvolvimento; depois da enfermeira: HP máximo, status limpo, ponto de retorno em Cherrygrove |
| PC (023) | depois do marco 8 | captura um selvagem, deposita no PC, retira; equipe confere |
| Isolamento (020) | em todo marco | segundo jogador parado em New Bark Town; os NPCs que ele vê seguem as flags dele, não as do primeiro |

## Relatório

Sucesso: uma linha por marco alcançado, uma por check dos specs 020–023 e o total; os comandos faltando do caminho opcional em lista separada (não reprovam).
Falha: marcos alcançados, marco que falhou e check que não bateu, último script executado (`arquivo:entrada`), posição (mapa, tile), condições dos scripts de mapa e gatilhos do mapa (mesmo formato do painel do depurador), flags/vars do marco, comandos faltando, travamentos e as últimas linhas do log do servidor.
