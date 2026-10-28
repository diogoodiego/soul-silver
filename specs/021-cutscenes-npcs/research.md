# Research: Cutscenes e NPCs

## R1. Onde a cutscene roda

- **Decisão**: o servidor mantém o runner do script (spec 020) e envia ao cliente de quem disparou um pedido `cutscene` com os passos; o cliente encena e responde ao terminar.
- **Motivo**: princípio IV (servidor autoritativo, flags no servidor) e VII (os outros não veem a encenação). É a mesma divisão já adotada para `say`/`fade` em 020.
- **Alternativas**: runner inteiro no cliente (rejeitada: duplica o interpretador e quebra IV); servidor movendo os NPCs de fato (rejeitada: afetaria todos os jogadores).

## R2. Atores locais durante a cutscene

- **Decisão**: ao iniciar, o servidor lista as pessoas envolvidas; para aquele jogador, a replicação deixa de enviar a posição compartilhada delas, e o cliente as controla. Ao fim, o servidor reaplica a posição final (ou o `npcPlacement`).
- **Motivo**: evita brigar com o NPC compartilhado e garante isolamento.
- **Alternativa**: clonar NPCs só para o jogador (rejeitada: IDs e colisão duplicados).

## R3. Posição permanente

- **Decisão**: `npcPlacement` no save, `{ mapa: { pessoa: { x, z, facing } } }`, gravado por comandos de reposicionamento dos scripts, aplicado no filtro de replicação por jogador. A spec pede "determinada por flags e variáveis do jogador": como o original grava a posição por comandos e não por uma tabela de flags, o placement é estado individual do jogador, no save, e nunca compartilhado.
- **Alternativa**: derivar posição só de flags (rejeitada: o original não tem essa tabela; exigiria inventar dados).
- **A confirmar na extração**: quais comandos do original reposicionam objetos (lista no `events-report`).

## R4. Tipos de movimento

- **Decisão**: mapear o campo `movement` de `map-events` para quatro padrões numa tabela em `shared/npc`. Códigos desconhecidos caem em "parado" e são logados.
- **Motivo**: comportamento seguro por padrão; a tabela cresce por cobertura.
- **A confirmar**: valores de `movement` e significado de `param`/`xRange`/`yRange` nos dados extraídos de New Bark e Cherrygrove (tarefa de levantamento antes dos testes).

## R5. Determinismo e ritmo dos NPCs

- **Decisão**: RNG semeado por (mapa, pessoa) e intervalos em ticks de 20 Hz, fiéis ao original onde a extração der o dado; senão valores iniciais documentados e ajustados na comparação lado a lado.

## R6. Inatingível e selvagens

- **Decisão**: flag `busy` na entidade do jogador. O combate ignora alvos `busy`; o servidor limpa a ameaça dos selvagens (`ThreatTable`) contra ele ao iniciar. Interação (de NPC ou jogador) é rejeitada enquanto `busy`.

## R7. Companheiro

- **Decisão**: o script indica se o companheiro participa (ator local como os NPCs); caso contrário ele fica parado no lugar durante o `busy`.

## R8. Introdução e texto acelerado

- **Decisão**: a criação do save marca a introdução pendente; ao entrar no mundo o servidor dispara o script de introdução com nome e personagem do save (reuso da spec 020). A opção de texto acelerado multiplica a velocidade de texto das Configurações, sem criar uma segunda configuração.

## Confirmado nos dados extraídos (T002)

Levantamento sobre os 2667 NPCs dos 540 mapas (contagem por valor de `movement`): 0 (1329), 15 (449), 17 (159), 3 (153), 14 (134), 16 (125), 2 (97), 5 (72), 4 (36), 20 (27), demais ≤ 17 cada. Sem NPC com `movement` 1, 12, 21–37, 40, 43, 47–52.

Mapeamento adotado (heurístico, a ajustar na comparação lado a lado):

| `movement` | Padrão | Evidência |
|---|---|---|
| 0, 14–19 | `still` (usa `facing`) | maioria sem faixa; 14–19 só variam `param` |
| 2 | `look` (4 direções) | 97 NPCs, faixa 0×0 |
| 3 | `wander` (faixa `xRange`×`yRange`) | faixas 1×0 a 1×1 em New Bark/Cherrygrove |
| 4–13 | `look` (4 direções) | `param` 1–5, faixa 0×0; subconjunto exato de direções ainda não decodificado |
| 20 | `path` de ida e volta no eixo da faixa | faixas 9×0 e 0×4 |
| 38–46, 53 com faixa > 0 | `wander` | faixas 2×2 a 10×5 |
| demais / desconhecido | `still` + aviso | seguro por padrão |

`param[0]` aparece como 0–5 nos tipos 4–13; seu significado (direção inicial ou conjunto de direções) fica como atalho: `look` usa as 4 direções. Os comandos de reposicionamento de objeto e de câmera exatos serão levantados no `events-report` ao implementar T019/T024 (o relatório lista `commands` por nome); sem dados de ROM no repositório.

Mapas conferidos: 60 (New Bark) tem NPCs com `movement` 0, 2, 3, 14; 67 (Cherrygrove) tem 0, 3, 5, 14, 15, 17.

## Sprites de NPC: o que se sabe (T014a, em aberto)

- O atlas `overworld-npc` usa como id o índice do membro no arquivo `a/0/8/1` (0–265: personagens de 16 quadros; 266+ são modelos 3D e blocos de Pokémon acompanhantes `tsure_poke` a partir do 297). Nomes dos membros: 0 `babyboy1` … 85 `pokehero`, 87 `savehero`, 91 `rock`, 92 `breakrock`, 93 `tree`, 94 `monstarball`, 146 `gsleader1`, 148 `gsleader3`.
- O campo `sprite` dos eventos **não** é esse índice: só 408 de 2667 NPCs casam por identidade, e os ids mais usados (87 ×264, 336 ×133, 328 ×117, 85 ×103) caem em membros que não são personagens; 146 e 148 aparecem em New Bark e Cherrygrove, onde não há líderes de ginásio.
- Há no ARM9 (0xff7b6, u16) uma tabela de 172 entradas identidade com saltos (172→173, 201→229, depois +28 a partir do índice ~300), mas ela **não** explica os ids 85–87 (objetos: rocha, árvore, bola), então não foi adotada.
- Próximo passo: achar a tabela id de evento → membro (ou o deslocamento do campo `sprite` no `map-events`; conferir também a leitura do campo na spec 008) comparando com NPCs conhecidos de New Bark e Cherrygrove.

### Âncoras por classe de treinador (resolvido em parte)

Cada classe de treinador usa um único `sprite` de evento (cruzando `trainers.json` com `map-events`). Casando com os nomes dos membros: 316–338 ↔ membros 113–136 (id − 202: Youngster 317 = `gsboy2`, Pokéfan 328 = `gsmiddleman1`, Hiker 333 = `mount`, Super Nerd 338 = `gsassistantm`); 341–348 ↔ 137–144 (id − 204: Gentleman…Sailor); 351 ↔ 145 (Psychic = `mystery`). Os ids 339, 340, 349 e 350 não têm âncora. Ids abaixo de 316 (p.ex. 29 Scientist, 33 Skier, 34 Policeman, 146 School Kid, 218–229) claramente não são identidade e seguem sem mapa. A tabela real do jogo não foi achada nos binários (a tabela stride-8 do ARM9 em 0x100194 é chaveada pelo id de evento, mas seus campos apontam para outro arquivo).

### Resolvido: tabela do jogo (T014a)

A tabela está no overlay 1 decomprimido, em 0x21ba8: entradas de 6 bytes `{ id do sprite do evento, membro de a/0/8/1, flags }`, 901 entradas, terminadas por id 0xffff. Confere com todas as âncoras (33 Skier = `skierw`, 34 Policeman = `policeman`, 146 School Kid = `gsboy1`, 148 = `gsrivel`, 219 Medium = `itako`, 365 = `gsmama`, 85/86/87 = `breakrock`/`tree`/`monstarball`, 316–351 como antes). A regra provisória `npcSheetOf` foi removida. Os ids 101–111 não estão na tabela: são sprites escolhidos por variável de script (a tratar com o interpretador). Objetos que não são folhas de 16 quadros ainda não entram no atlas.

### Cobertura completa

- Membros da tabela que não são folhas de 16 quadros entram no atlas: 32 quadros andam e correm, 17 quadros usam os 16 primeiros, o resto (objetos de 1 quadro, árvores de Apricorn com duas paletas, objetos de 7 quadros) vira um quadro parado.
- Ids 101–116 não estão na tabela: o jogo desenha o sprite guardado na variável 0x4020 + (id − 101) do jogador. `GetFriendSprite` grava 239 (heroína) para um jogador masculino e 238 (herói) para um feminino; os outros scripts usam `SetVar` com ids da tabela (0, 97, 282, 283, 286, 317, 320, 354, 365, 366, 1047–1049). Variável não definida vale 0, o herói, como no original.
- Conferido sobre a extração completa: 0 de 2667 NPCs sem folha e nenhum valor gravado nessas variáveis sem folha.
