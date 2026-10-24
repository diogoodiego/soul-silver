# Pesquisa: Mapas pré-renderizados e colisão

**Feature**: [spec.md](./spec.md) | **Plano**: [plan.md](./plan.md)

Este documento resolve as decisões em aberto do plano. Onde a decisão depende de formato
binário da ROM ainda não confirmado no código, a entrada diz isso explicitamente e aponta para a
tarefa de verificação (R0), que roda antes da implementação das demais etapas.

## R0. Verificação dos formatos de mapa na ROM (pré-requisito)

**Decisão**: antes de qualquer código de produção, um script de exploração (fora de `src/`, em
`packages/extractor/scripts/` ou no scratchpad, nunca commitado com dados) confirma, na ROM real
do desenvolvedor, a localização e a estrutura de: headers de mapa (NARC de headers), matrizes de
área, arquivos de "land" (pedaços de terreno com permissões, alturas e prédios) e modelos NSBMD
dos prédios e do terreno com texturas NSBTX.

**Rationale**: a spec pede isso como base de tudo; errar a estrutura de um arquivo invalida todas
as demais decisões. Os nomes de NARC e os offsets seguem o padrão já usado pela 004
(`data/readers`), mas o formato de mapa é diferente de tudo que a 004 leu.

**Hipóteses a confirmar** (conhecimento de domínio de Gen 4, não verificado neste repositório):

- o header de mapa tem tamanho fixo e referencia matriz, scripts, encontros e eventos por índice
  de arquivo dentro de NARCs;
- a matriz da área é uma grade de índices de pedaço (com largura e altura em pedaços) e cada
  pedaço ocupa uma porção fixa de tiles (32 × 32 tiles na Gen 4);
- cada pedaço tem um arquivo com permissões por tile, um arquivo de altura por tile e uma lista
  de prédios com posição, rotação e índice de modelo;
- os modelos são NSBMD (triângulos com UV e referência a textura) e as texturas são NSBTX
  (formatos de cor comprimidos ou indexados).

**Alternativas**: pular a verificação e deduzir do código de terceiros: rejeitado, porque o
conteúdo precisa bater com a ROM real e esta feature é a de maior risco.

**Saída**: um documento curto de descobertas, sem bytes da ROM, em `docs/` ou anexo a este
research, citando nomes de arquivo e offsets relativos. Fica como entrada das tarefas.

### Achados parciais (R0)

Verificado com os arquivos já extraídos pela 003 em `assets/stages/rom-unpack/narc/` (somente
caminhos e contagens; nenhum byte da ROM foi copiado para o repositório):

- **Modelos de prédio, externos**: `a/0/4/0` tem 340 membros `BMD0` (NSBMD). É idêntico, membro a
  membro, a `fielddata/build_model/bm_field.narc` (340 de 340 iguais).
- **Modelos de prédio, internos**: `a/1/4/8` tem 222 membros `BMD0` e é idêntico a
  `fielddata/build_model/bm_room.narc` (222 de 222 iguais).
- **Tabelas de 24 bytes**: `a/1/0/7` (340) e `a/1/0/8` (222) têm um registro por modelo de
  prédio. Não são headers e não são necessárias nesta feature.
- **Land data (pedaços)**: `a/0/6/5`, 676 membros. Cabeçalho de 4 × u32 (tamanho de permissões,
  prédios, modelo e alturas), depois o bloco extra do HGSS (u16 `0x1234`, u16 tamanho) e as seções
  nessa ordem. As permissões têm sempre `0x800` bytes (32 × 32 tiles × u16), os prédios são
  registros de 48 bytes, o modelo é `BMD0` e as alturas são `BDHC`. Os 676 membros batem em
  tamanho e magia.
- **Matriz de área**: `a/0/4/1`, 288 membros. Campos: u8 largura, u8 altura, u8 tem headers, u8 tem
  alturas, u8 tamanho do nome, nome; depois grade u16 de headers, grade u8 de alturas e grade u16
  de land data. Os 288 membros batem em tamanho (a matriz principal é 47 × 17).
- **Área**: `a/0/4/2`, 106 membros de 8 bytes. u16 conjunto de prédios (`a/0/4/3`, 104) e u16
  conjunto de texturas (`a/0/4/4`, 106 `BTX0`). Os 106 membros apontam para índices válidos.
- **Headers de mapa**: não estão num NARC. Ficam numa tabela de 540 entradas de 24 bytes no ARM9
  descomprimido (`code-decompress`), no offset `0xf6be0`. Os campos confirmados por limite de
  índice nas 540 entradas são: u8 área em `+1`, u16 matriz em `+4`, u16 scripts em `+6`, u16
  mensagens em `+10`, u16 música de dia em `+12` (82 valores entre 1000 e 1216), u16 música de
  noite em `+14`, u16 eventos em `+16`, u8 clima em `+20` (7 valores). O offset é fixo porque o
  extrator aceita uma única ROM, conferida por hash (003).
- **Permissões**: cada tile é um u16. O byte alto `0x80` marca bloqueio (266 mil tiles); o byte
  baixo é o comportamento do tile. Os comportamentos presentes e a tradução para categorias estão
  em R6.

- **Modelos** (lidos pelo código de produção em todos os 1238 modelos, sem erro): 676 pedaços,
  340 prédios externos e 222 internos, 12.762 shapes e 834 mil triângulos. O pedaço ocupa
  x, z ∈ [−256, 256] em unidades de mundo, ou seja, **16 unidades por tile**; cerca de 3% dos
  vértices passam até um tile da borda. Os pedaços não têm TEX0 e usam o conjunto de texturas da
  área (`a/0/4/4`), por nome.
- **Texturas**: 5538, todas decodificáveis. Formatos em uso: A3I5 (97), 4 cores (1590), 16 cores
  (3668), 256 cores (9) e A5I3 (174). Comprimido 4×4 e cor direta não aparecem.
- **Materiais animados**: 2607 materiais (água, ondas) não têm textura ligada no modelo; a
  textura de mesmo nome existe no conjunto e é usada como quadro estático (R7).

Reprodução: `node packages/extractor/src/maps/probe.ts` sobre a saída da 003.

**Gate**: `PIECE_TILES = 32` confirmado. O modelo de pedaço do plano se mantém, com uma diferença:
os headers vêm do ARM9, não de um NARC. O data-model não muda.

## R1. Tamanho do tile em pixels

**Decisão**: 16 px por tile na imagem final (constante `MAP_TILE_PX = 16`), ou seja, cada tile
da grade ocupa exatamente um bloco de 16 × 16 pixels.

**Rationale**: é o tamanho em que o jogo DS desenha o chão 2D, e facilita o sprite sheet de
16 px. O bloco de 16 px dá resolução suficiente para as copas e os telhados sem ficar pesado
(um mapa de 32 × 32 tiles por pedaço gera 512 × 512 px por pedaço).

**Alternativas**: 32 px (mais legível, mas o dobro de memória e de tamanho de arquivo);
resolução variável por mapa (rejeitada: quebra o princípio do alinhamento constante).

> **Revisão (2026-10-24)**: o pré-render 2D (R2 a R5, R7) foi substituído pela exportação da malha
> 3D (`mesh.json`, `mesh.bin`, `textures/`), desenhada pelo cliente com three.js. Ver
> specs/011-world-movement-warps/research.md, "Revisão: render 3D com three.js".

## R2. Projeção dos prédios

**Decisão** (revista na implementação): projeção oblíqua fixa, sem rotação. Um ponto do mundo
`(x, y, z)` (y para cima, z para o sul, em unidades de tile) vai para a tela em
`(x * 16, (z - k * y) * 16)`, com `k` constante (`OBLIQUE_HEIGHT`). A profundidade é `-(y + k * z)`:
fica mais perto da câmera o que é mais alto ou mais ao sul.

A versão anterior (ortográfica com 30° de inclinação e 45° de rotação vertical) foi descartada
porque transforma cada tile num losango, o que contradiz o requisito de bloco quadrado por tile
(FR-003). Na oblíqua, o plano do chão mapeia direto para a grade, e só a altura desloca o
desenho para cima, mostrando as fachadas como no DS. O valor de `k` é ajustado na conferência
visual do SC-001; ele não afeta o alinhamento do chão.

**Rationale**: com ortográfica e escala inteira, a posição de um tile na imagem é uma função
linear exata da posição na grade, o que garante o SC-003 (sem deslocamento acumulado).
Perspectiva exigiria arredondamento por tile e poderia acumular erro nas bordas.

**Regra de alinhamento**: a imagem de cada pedaço é gerada num quadro de tiles × 16 px, com o
canto superior esquerdo de cada tile em `(x * 16, y * 16)` do quadro. O que sobra de um prédio
além da área do pedaço é recortado para a camada que o contém (ver R4).

**Alternativas**: câmera perspectiva (rejeitada pelo motivo acima); projeção de vista de topo
pura (rejeitada: não lembra o ângulo do DS, que o spec pede como SHOULD).

## R3. Renderizador de software sem dependência nova

**Decisão**: rasterizador por software em TypeScript puro dentro do `extractor`, com z-buffer,
amostragem de textura por vizinho mais próximo (sem filtro), e codificador PNG com `node:zlib`.

**Rationale**: o extrator roda em Node no processo de extração, sem GPU. O princípio X pede zero
dependência nova sem justificativa; bibliotecas de canvas (como `node-canvas`) exigem binários
nativos e não são necessárias, pois o escopo é uma projeção fixa e triângulos com textura.

**Alternativas**: `node-canvas` ou `sharp` (rejeitadas: binários nativos e dependência nova);
renderer WebGL headless (rejeitado: depende de GPU/driver no Windows do jogador).

**Risco**: desempenho. Mitigação: o processamento é uma vez por mapa na extração, com meta de
no máximo 2 min para todos os mapas (ver plano, Performance Goals).

## R4. Camadas inferior e superior

**Decisão**: cada pedaço é renderizado duas vezes com o mesmo quadro: a camada inferior recebe
o terreno e os prédios cuja altura de topo fica abaixo do limiar de "copa"; a camada superior
recebe o restante (copas de árvore, telhados, toldos, parte alta de pontes). O limiar e a
classificação de cada prédio vêm dos dados da ROM, quando o modelo declara a camada, ou da
altura do prédio em relação ao nível do jogador, como regra de fallback documentada.

**Rationale**: o spec exige no mínimo duas camadas; a separação pelo que está acima do jogador
é o que o overworld precisa para desenhar o sprite do jogador entre as duas.

**Alternativas**: classificar por nome do modelo (rejeitada: frágil, depende de convenção de
nomes da ROM); só uma camada (rejeitada: não cumpre o requisito).

## R5. Níveis sobrepostos

**Decisão**: cada mapa é separado em níveis por faixa de altura de pedaço. Dois pedaços que se
sobrepõem na mesma posição de grade com alturas diferentes geram níveis distintos. Para cada
nível, há uma colisão e um par de camadas. Tiles de transição (entrada e saída de ponte, rampa
entre níveis) recebem a categoria "transição de nível" e apontam para o nível de destino.

**Rationale**: é o caso do HGSS (ponte sobre caminho). A regra por altura é determinística e
testável com grades sintéticas.

**Alternativas**: um único nível com colisão por altura (rejeitada: não separa o que o jogador
pode pisar sob a ponte e em cima dela).

**Risco**: a ambiguidade de altura em tiles de rampa. Mitigação: regra fixa e aviso no
relatório (ver spec, Edge Cases).

## R6. Tradução de permissões para categorias

**Decisão**: tabela de tradução em `shared` (`map-collision.ts`), de valor de permissão original
para uma das categorias: bloqueado, livre, grama alta, água, ressalto com direção, escada,
transição de nível, tile especial. Valor não mapeado vira `special` com o valor original
preservado no campo `raw`.

**Rationale**: a tabela de categorias é conteúdo de dados (princípio III), e o jogo lê a mesma
tabela. O mapeamento de valor para categoria é a parte que o jogo precisa rebalancear ou
corrigir sem código.

**Alternativas**: mapear dentro do extrator (rejeitada: o servidor e o visualizador precisam da
mesma tabela; ver princípio IV).

**Tabela inicial** (byte baixo = comportamento; byte alto `0x80` = bloqueio):

| Categoria | Valores | Confiança |
|-----------|---------|-----------|
| `blocked` | byte alto com bit `0x80` | confirmado pela distribuição (R0) |
| `free` | comportamento `0x00` sem bloqueio | confirmado pela distribuição (R0) |
| `tallGrass` | `0x02`, `0x03` | hipótese (constantes da Gen 4) |
| `water` | `0x10`, `0x11`, `0x13`, `0x15` | hipótese; `0x15` aparece em 44 mil tiles |
| `ledge` | `0x38` leste, `0x39` oeste, `0x3a` norte, `0x3b` sul | hipótese; `0x3b` domina, coerente com Johto |
| `ladder` | nenhum valor confirmado | fica `special` até a conferência manual |
| `levelTransition` | derivada dos níveis (R5), não de um valor de permissão | — |
| `special` | todo o resto, com `raw` preservado | — |

As hipóteses são confirmadas ou corrigidas na conferência manual do SC-001. Como a tabela é um
dado em `shared`, uma correção não exige mudar código.

## R7. Texturas animadas

**Decisão (revista)**: a extração grava a descrição de cada animação que um mapa usa, e a
reprodução fica com o overworld (spec 006, FR-009, FR-019, FR-020). A primeira versão, que usava
só o primeiro quadro, foi substituída por essa decisão.

**Animações na ROM (verificado, `a/1/0/6`)**: 99 arquivos `BTA0` (rolagem de textura, bloco
`SRT0`), 79 `BTP0` (troca de quadros, bloco `PAT0`), 85 `BCA0` e 10 `BMA0`, este último
fora do escopo de texturas. Em `BTA0` e `BTP0`, cada animação tem um dicionário próprio de
materiais, e o nome do material é a chave de ligação com os modelos do mapa (FR-019).

**Formatos (verificados nos 178 arquivos `BTA0`/`BTP0`, 357 animações, sem erro)**:

- **Rolagem (`BTA0`)**: animação = `M AT`, u16 duração, u16 (1), dicionário de materiais em +8 com entradas
  de 40 bytes = 5 trilhas de 8 bytes (escala S, escala T, rotação, translação S, translação T). Cada
  trilha: u32 flags e u32 valor. Flags: bits 0-15 número de quadros; bit 29 constante; bit 28 valores
  s16 (sem ele, s32). Constante: o valor é s32 em ponto fixo 4.12 (rotação: s16 seno, s16 cosseno).
  Animada: o valor é o deslocamento, a partir do início da animação, de um quadro por valor
  (rotação: par seno/cosseno de 4 bytes). Toda trilha animada tem tantos quadros quanto a duração.
- **Troca de quadros (`BTP0`)**: animação = `M PT`, u16 duração, u8 nº de texturas, u8 nº de paletas, u16
  deslocamento dos nomes das texturas, u16 o das paletas (16 bytes por nome), dicionário de materiais em
  +12 com entradas de 8 bytes: u16 nº de quadros-chave, 2 × u16 (não usados), u16 deslocamento dos
  quadros. Cada quadro-chave: u16 quadro, u8 textura, u8 paleta (índices das listas de nomes).
- **Verificação**: a água (`en_sp1`) anda −1/60 por quadro durante 60 quadros: um tile inteiro,
  em laço sem emenda. O moinho de New Bark Town sai com 3 animações de 120 quadros.
- **Não confirmado**: a ordem das trilhas (S antes de T) segue a convenção Nitro; a direção da
  rolagem precisa de conferência visual quando o overworld reproduzir a animação.

**Rationale**: o plano separa a extração (dados, test-first) da reprodução (overworld).

## R8. Dados de saída e pasta

**Decisão**: a saída fica na área de trabalho da 003, na etapa `maps`:
`stages/maps/` com um diretório por mapa (`<mapa-id>/`) contendo `header.json`, `layers/<nível>-<camada>.png`,
`collision/<nível>.json`, e um índice `areas.json`. O relatório da etapa vai no `--report`.

**Rationale**: segue o padrão das features 004 e 005 (JSON validado por zod em `shared`, PNG
para imagens). PNG é o formato em que o visualizador e o jogo carregam.

## R9. Visualizador de desenvolvimento

**Decisão**: visualizador como ferramenta de desenvolvimento, aberto pela CLI
(`npm run maps:view -- <mapa-id>`), que serve um HTML estático em `localhost` a partir da pasta
de saída. Usa só HTML e JavaScript sem dependência de build, com `<canvas>`.

**Rationale**: o visualizador não é parte do jogo distribuído, então não precisa do Electron.
Um HTML local é suficiente para alternar camadas e sobrepor a colisão, e não cria superfície de
IPC (princípio IX).

**Alternativas**: uma janela Electron de desenvolvimento (rejeitada: acopla a ferramenta ao app
e adiciona superfície de IPC); visualizador dentro do app (rejeitada: o spec o trata como
ferramenta de conferência, não como função do jogo).

**Risco**: o visualizador servir arquivos com o mesmo origem do servidor local. Mitigação:
servidor só em `127.0.0.1` e apenas leitura da pasta de saída.

## R10. Mapas com falha e relatório

**Decisão**: cada mapa passa por etapas (header, matriz, pedaços, render, colisão). Uma falha
em qualquer etapa marca o mapa como falha com o motivo e a etapa; o processamento segue para o
próximo mapa. O relatório lista cada mapa como sucesso, sucesso com avisos ou falha.

**Rationale**: FR-013 e SC-002.

## R11. Testes

**Decisão**: fixtures sintéticos em `packages/extractor/test/fixtures/maps/`: um pedaço de 2 × 2
tiles com permissões conhecidas, um prédio cúbico simples com textura de 2 × 2 px, uma matriz
2 × 2 de pedaços, e um mapa com ponte sobre caminho. Os testes montam as estruturas em código
(builders), no mesmo padrão da 003 e da 005.

**Rationale**: princípio II e FR-017. Permite verificar alinhamento tile a tile sem a ROM.

## Resumo das decisões em aberto

| Pergunta do plano | Decisão |
|-------------------|---------|
| Tamanho do tile | 16 px (R1) |
| Ângulo visual | ortográfico isométrico, 30° / 45° (R2) |
| Renderização sem GPU | rasterizador TS puro, PNG via `node:zlib` (R3) |
| Camadas | inferior e superior por altura de topo do prédio (R4) |
| Níveis | separação por faixa de altura, transição marcada (R5) |
| Permissões | tabela de dados em `shared` (R6) |
| Texturas animadas | primeiro quadro, aviso no relatório (R7) |
| Visualizador | HTML local servido pela CLI (R9) |
| Verificação dos formatos | pré-requisito R0 |

### R7 (quadros reproduzidos)

Para tocar a animação num mapa de camadas estáticas, a etapa renderiza o mapa em 8 instantes do ciclo de cada animação
(`k / 8`, `k = 0..7`) e guarda só a região que difere do quadro 0, em caixa alinhada aos tiles. Medido na ROM real: 250 dos
294 mapas animados têm região em movimento (22 megapixels por quadro no total), a saída passou de 149 para 183 MB e a
etapa de ~2 para ~6,7 min. O ciclo é reamostrado: animações de 60 a 1800 quadros tocam no mesmo ritmo (4 quadros por segundo no
visualizador). Rotação de textura não é tocada.
