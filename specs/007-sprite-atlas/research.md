# Pesquisa: Sprites

**Feature**: [spec.md](./spec.md) | **Plano**: [plan.md](./plan.md)

Este documento resolve as decisões em aberto do plano. Onde a decisão depende de formato binário
da ROM ainda não confirmado, a entrada diz isso e aponta para a verificação R0, que roda antes
da implementação.

## R0. Verificação dos arquivos de sprite na ROM (pré-requisito)

**Decisão**: antes do código de produção, uma sonda (`sprites/probe.ts`, só contagens e magias,
nunca bytes da ROM) confirma, na ROM real do desenvolvedor, onde cada categoria vive e como o
índice do membro vira espécie, forma, gênero, item ou treinador.

**Rationale**: a spec depende de mapeamentos que nenhum código deste repositório lê ainda.
Errar um mapeamento troca sprites entre Pokémon sem erro algum.

### Achados parciais (R0)

Verificado nos NARCs já extraídos pela 003 em `assets/stages/rom-unpack/narc/` (somente caminhos,
contagens, magias e tamanhos; nenhum byte foi copiado para o repositório):

| Categoria | Arquivo | Membros | Conteúdo observado |
|-----------|---------|---------|--------------------|
| Batalha | `a/0/0/4` | 2964 (= 6 × 494) | 1812 `RGCN`, 988 `RLCN`, 164 sem magia (provavelmente LZ10). Gráfico de 6448 bytes (80 × 160, 4 bpp mais cabeçalho); paleta de 72 bytes. |
| Ícones de Pokémon | `a/0/2/0` | 551 | 544 `RGCN`, poucas paletas `RLCN`, 3 `RNAN` e 3 `RECN`. |
| Ícones de item | `a/0/1/8` | 797 | 371 `RGCN` + 424 `RLCN`, 1 `RNAN`, 1 `RECN`. |
| Treinadores | `a/0/5/8` | 645 | 258 `RGCN`, 129 `RLCN`, 129 `RECN`, 129 `RNAN`: 129 sprites, cada um com 2 gráficos, paleta, células e animação. |
| Overworld | `a/0/8/1` (candidato) | 863 | 832 `BTX0`, 14 `BMD0`, 17 sem magia. Formato de quadro e mapeamento **não confirmados**. |

Candidatos descartados: `a/0/6/9` (496 membros LZ10 de ~100 bytes: gráficos pequenos, não
overworld).

### Achados confirmados na implementação (batalha, espécies base)

- `a/0/0/4`: 494 grupos de 6 membros (grupo n = espécie n; o grupo 0 é vazio). Membros 0 a 3 são
  os gráficos (costas fêmea, costas macho, frente fêmea, frente macho), 4 e 5 as paletas normal e
  shiny. Gráfico vazio = gênero sem gráfico próprio: 412 espécies com os quatro, 66 só com macho
  (macho ou sem gênero), 16 só com fêmea.
- Cada gráfico é um NCGR de 4 bpp, 160 × 80 (20 × 10 tiles), em ordem linear (scanned). São dois
  quadros de 80 × 80 lado a lado; a extração usa o primeiro e descarta o segundo (quadro de
  repouso alternativo; a spec não o pede).
- Os pixels são cifrados: XOR com um fluxo congruencial linear (`k = k * 0x41C64E6D + 0x6073`)
  semeado pela primeira palavra de 16 bits. Funciona para todos os 1812 gráficos (o primeiro
  quadro sempre começa transparente, o que gera a semente).
- Paleta NCLR de 72 bytes: 16 cores BGR555. O índice 0 é transparente.
- Quando fêmea e macho são idênticos, vira um sprite `unisex`: 400 unisex e 93 espécies com
  fêmea e macho, no total 586 sprites.
- `a/1/1/4` (261 membros) traz as formas alternativas: 158 gráficos (79 pares costas/frente, na
  ordem Deoxys 4, Unown 28, Castform 4, Burmy 3, Wormadam 3, Shellos 2, Gastrodon 2, Cherrim 2,
  Arceus 18, ovo 1, Shaymin 2, Rotom 6, Giratina 2, Pichu 2), 98 paletas e 5 membros finais (ovos).
  As 98 paletas são 49 pares (normal, shiny) na ordem dos grupos, **sem tabela de ligação**:
  Deoxys e Unown usam um par só para todas as formas (pares 0 e 1), Castform 2 a 5, Burmy 6 a 8,
  Wormadam 9 a 11, Shellos 12 e 13, Gastrodon 14 e 15, Cherrim 16 e 17, Arceus 18 a 35, ovo 36,
  Shaymin 37 e 38, Rotom 39 a 44, Giratina 45 e 46, Pichu 47 e 48. Confirmado porque o primeiro
  par de cada grupo é igual à paleta da espécie base no arquivo principal, os 49 pares fecham sem
  sobra e a conferência visual dos 65 sprites (Arceus por tipo, Rotom, Castform, Burmy etc.) mostrou
  as cores certas. Cada par de gráficos é (costas, frente); a forma 0 de cada grupo repete o
  arquivo principal e não é extraída de novo. O ovo (sem espécie) e os 5 membros finais não entram.

### Achados confirmados na implementação (overworld)

- `a/0/8/1` (863 membros): cada membro é um BTX0 cujas texturas `<nome>.1`, `.2`... são os
  quadros (ordem numérica, não a do arquivo, que é lexicográfica), 16 cores, 32 × 32 (64 × 64 nos
  Pokémon grandes), cor 0 transparente.
- Membros 0 a 265: personagens e objetos. Os de 16 quadros e uma paleta são os NPCs (193). O jogador
  são `hero` (69) e `heroine` (70), com 32 quadros. Os demais (ciclismo, surfe, pesca, objetos,
  modelos 3D) têm outras contagens de quadros e **não são extraídos** nesta entrega.
- Direções em blocos, sempre na ordem cima, baixo, esquerda, direita (conferido num Pikachu: cauda
  para o lado oposto do rosto). NPC: 4 quadros por direção; jogador: 16 de caminhada e 16 de
  corrida; Pokémon: 2 quadros por direção.
- Membros 297 a 862 (566): Pokémon que acompanham o jogador, 8 quadros e duas paletas (a primeira
  é a normal, a segunda a shiny, conferido em Bulbasaur e Pikachu). O primeiro membro é 297 e a
  tabela espécie → entrada fica no ARM9 descomprimido em `0xff08a`: 493 u16 crescentes (um por
  espécie, de 1 a 493); a espécie começa no membro `297 + valor` e tem tantas entradas quanto a
  distância até o próximo valor (a última vai até 566). Espécies com mais de uma entrada: Venusaur,
  Pikachu, Meganium, Wobbuffet, Steelix, Heracross, Combee, Gible a Garchomp (443 a 445), Hippopotas e
  Hippowdon (449 e 450): macho e fêmea, nessa ordem (conferido pela cauda do Pikachu); Pichu (2),
  Unown (28), Deoxys (4), Burmy (3), Wormadam (3), Shellos (2), Gastrodon (2), Rotom (6), Giratina
  (2), Shaymin (2) e Arceus (18): formas, em ordem. Total 548 + 18 = 566.
- **Duração dos quadros:** os arquivos não trazem tempo. Os valores usados (125 ms por quadro de
  caminhada, 250 ms nos Pokémon) são provisórios e ficam em `layout.ts`; a feature 11 pode ajustar.
- **Âncora:** o pé é a linha mais baixa opaca de todos os quadros do sprite, no centro horizontal.
- **Pendente:** identificadores de NPC. O índice do membro (`overworld-npc/<membro>`) é usado até
  existir a tabela de eventos que liga o objeto do mapa ao sprite.

### Achados confirmados na implementação (ícones e treinadores)

- **Ícones de Pokémon** (`a/0/2/0`): membro 0 é a paleta compartilhada (256 cores, 16 bancos de 16);
  1 a 6 são células e animações (não usadas); 7 em diante, um NCGR por ícone (32 × 64, 4 bpp, em
  tiles, **largura e altura no cabeçalho são 0xFFFF**: a largura de 4 tiles vem do chamador). O
  quadro de cima é o ícone. O índice do ícone é o número da espécie (0 é o "?"); o banco de paleta
  (0 a 2) é um byte por ícone no ARM9 em `0xffb8f`. Deoxys Attack, Defense e Speed são os ícones
  496 a 498 e as formas B a Z, ! e ? do Unown são 500 a 526 (o 499 repete o A, conferido
  byte a byte). Os ícones 494 e 495 são ovos; 527 a 543 são outras formas que não consegui ligar a
  uma espécie e forma com segurança e não são extraídos.
- **Ícones de item** (`a/0/1/8`): a tabela de itens do ARM9 (a mesma `itemMap` da 004, 8 bytes
  por item) traz, nos campos 2 e 3, o membro do gráfico (512 bytes, 32 × 32, 4 bpp) e o da paleta.
  Os 536 itens apontam para um NCGR e um NCLR válidos; vários itens compartilham gráfico.
- **Treinadores** (`a/0/5/8`): 129 grupos de 5 membros. +1 é a paleta; +4 é um NCGR de 160 × 80
  (4 bpp, em linhas) **cifrado em sentido inverso** (semente na última palavra de 16 bits); a
  metade esquerda de 80 × 80 é o sprite. Os membros +0 (gráfico pequeno), +2 e +3 (células e
  animação) não são usados.

**Saída**: seção de descobertas neste arquivo (caminhos, contagens, offsets relativos; sem
bytes). Se o overworld exigir decodificar textura NSBTX, usa-se `maps/texture.ts` da 006.

## R1. Decodificação dos formatos gráficos do NDS

**Decisão**: leitores próprios, pequenos: LZ10 (cabeçalho `0x10` + tamanho de 24 bits), NCGR
(`RGCN`, bloco `RAHC`, tiles 4 ou 8 bpp, ordem linear ou em tiles de 8 × 8), NCLR (`RLCN`, bloco
`TTLP`, cores BGR555), NCER (`RECN`, células com OAM) e NANR (`RNAN`, sequências com duração).
Cor BGR555 → RGBA8 com expansão `v << 3 | v >> 2`. Índice 0 vira alfa 0 (FR-012).

**Rationale**: o código já tem leitores binários pequenos e testáveis; sem dependência nova
(princípio X). O desenho exato dos bits é verificado em fixtures sintéticos.

**Alternativas**: biblioteca de terceiros para NDS (rejeitada: dependência por poucas centenas
de linhas e sem garantia de determinismo).

## R2. Atlas: agrupamento, empacotamento e shiny

**Decisão**: um conjunto de atlas por categoria (`overworld-player`, `overworld-npc`,
`overworld-pokemon`, `battle`, `icon-pokemon`, `icon-item`, `trainer`). Cada conjunto é dividido
em páginas de no máximo 2048 × 2048 px, empacotadas por prateleiras: quadros ordenados por altura
decrescente, empate pelo nome, para a saída ser determinística. Quadros de cores indexadas viram
RGBA; a variante shiny é um segundo PNG por página, com os mesmos retângulos, então o índice de
quadros existe uma vez só e `shiny` só troca a imagem.

**Rationale**: o renderer escolhe imagem e retângulo de forma independente; metadados duplicados
para shiny seriam fonte de divergência.

**Alternativas**: um atlas único (rejeitado: passaria de 2048 px e de limites de textura em GPU
integrada); paleta como dado separado em vez de PNG shiny (rejeitado: obriga o renderer a
aplicar paleta, e a spec pede cores já aplicadas).

## R3. Contrato de metadados

**Decisão**: por categoria, um `<categoria>.json` com `formatVersion`, a lista de páginas, os
quadros (nome, página, x, y, w, h, âncora), as animações (nome e lista de `{frame, ms, flipX}`) e
os sprites (nome, espécie, forma, gênero, item ou treinador, mais as animações que o sprite
possui). Os campos de espécie, forma e item usam os ids numéricos da 004 (`id()`); o nome do
quadro é `<categoria>/<ids>/<quadro>` (por exemplo, `battle/25/0/front/male`). Schemas em
`shared`, validados ao gravar e ao carregar.

**Rationale**: princípios III e VI; ids numéricos acompanham o que a 004 já guarda e não dependem
de texto traduzível.

## R4. Espelhamento

**Decisão**: quando o original reaproveita um quadro espelhado, a animação referencia o mesmo
quadro com `flipX: true`; a imagem não é duplicada. A regra vale para toda categoria.

**Rationale**: menos pixels, e a diferença entre "esquerda" e "direita" fica explícita para o
renderer. **Alternativa**: gravar os dois quadros (rejeitada: duplica dados e esconde a intenção).

## R5. Falhas parciais e relatório

**Decisão**: o relatório lista, por categoria, as contagens (sprites, quadros, animações), os
quadros e paletas faltando, as substituições por forma base e os sprites não extraídos com o
motivo. A etapa falha se algum dos 493 Pokémon perder sprite de overworld ou de batalha, ou se a
perda em outra categoria passar de 2% (valor inicial, revisto após o R0 com os números reais).

**Rationale**: SC-001 exige zero faltando nos 493; as demais categorias admitem lacunas reais do
jogo original, que o relatório precisa mostrar sem esconder.

## R6. Pré-visualização de desenvolvimento

**Decisão**: `sprites.html`, servida pelo mesmo servidor local do visualizador de mapas
(`npm run sprites:view`), somente leitura e em `127.0.0.1`. Lista os sprites por categoria,
anima o escolhido num canvas 2D, troca normal e shiny e desenha a âncora. Fica em `extractor/src/viewer/`, que não entra no app.

**Rationale**: reaproveita o servidor existente; zero dependências; atende FR-017 e FR-018.

## R7. Reextração e saída

**Decisão**: a etapa grava na pasta de preparo da 003 (substituição inteira da saída, FR da 003),
o que cobre a regra de não misturar versões. PNG sempre com os mesmos filtros e sem chunks
variáveis (`encodePng` da 006).

## R8. Testes

**Decisão**: builders sintéticos de NCGR, NCLR, NCER, NANR, LZ10 e NARC; um mini-ROM de teste com
3 espécies (uma com forma, uma com diferença de gênero), 1 item, 1 treinador e 1 personagem. Casos
principais: paleta shiny muda só cores; quadro espelhado; quadro faltando no relatório; saída
idêntica em duas execuções; paleta com menos cores que o gráfico usa.

## R9. Ordem de entrega

**Decisão**: batalha primeiro (formato já localizado), ícones e treinadores em seguida, overworld
por último (depende do R0). As histórias continuam priorizadas como na spec; a ordem de
implementação reduz o risco, não a prioridade de produto.
