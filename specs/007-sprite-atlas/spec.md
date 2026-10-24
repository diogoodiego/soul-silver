# Feature Specification: Sprites

**Feature Branch**: `007-sprite-atlas`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "Sprites: etapa do extrator que converte os gráficos 2D da ROM em atlas de imagens com metadados de animação, prontos para o renderer."

## Contexto

Personagens e Pokémon andando no mapa, os Pokémon controlados no combate e os ícones de menu
vêm dos gráficos 2D da ROM do jogador (princípios I e II). O HGSS já tem sprites de overworld
para todos os 493 Pokémon, base direta para os Pokémon selvagens visíveis no mapa.

Esta feature acrescenta uma etapa ao pipeline de extração (features 003 a 006). Ela converte os
gráficos da ROM, que usam formato e paletas próprios, em atlas de imagens com metadados que o
renderer (feature 11) consome sem conhecer o formato original.

Atores:

- **Desenvolvedor do overworld**: precisa de personagens e Pokémon andando no mapa.
- **Desenvolvedor do combate**: precisa do sprite de cada Pokémon na batalha.
- **Desenvolvedor de UI**: precisa de ícones para equipe, mochila e Pokédex.
- **Desenvolvedor (conferência)**: confere cores e quadros e vê qualquer sprite animado.
- **Jogador**: não interage com esta feature. Os atlas são gerados durante a preparação do jogo.

Termos:

- **Atlas**: imagem que reúne vários quadros, acompanhada de metadados.
- **Quadro**: uma imagem individual de um sprite, com nome próprio.
- **Ponto de ancoragem**: o ponto do quadro que fica sobre a posição do personagem no mapa (o
  "pé" do sprite).
- **Animação**: sequência nomeada de quadros, com a duração de cada um.
- **Paleta**: conjunto de cores do sprite. Cada sprite de batalha tem a paleta normal e a shiny.
- **Forma alternativa** e **diferença de gênero**: variações de uma espécie com gráfico próprio
  (feature 004).
- **Relatório de sprites**: resumo gerado ao fim da etapa, com contagens e quadros faltando.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sprites de overworld andando nas quatro direções (Priority: P1)

O desenvolvedor do overworld pede o sprite do jogador (uma das duas opções de personagem do
HGSS), de um NPC ou de um Pokémon e recebe os quadros de caminhada nas quatro direções, com
nomes estáveis, ponto de ancoragem e a sequência de cada animação. Para o jogador e os NPCs,
recebe também os quadros das outras ações que o original define (por exemplo, parado, correr,
pedalar).

**Why this priority**: sem personagens e Pokémon desenhados no mapa não há overworld, e os
Pokémon selvagens visíveis dependem dos sprites de overworld dos 493 Pokémon.

**Independent Test**: com gráficos e paletas sintéticos, extrair os atlas e consultar uma
animação de caminhada para cada direção; com a ROM real, conferir a contagem no relatório.

**Acceptance Scenarios**:

1. **Given** os atlas extraídos, **When** o desenvolvedor consulta cada uma das duas opções de
   personagem do jogador, **Then** recebe os quadros de cada direção e ação, com nomes e ponto
   de ancoragem.
2. **Given** os atlas extraídos, **When** o desenvolvedor consulta um NPC de overworld,
   **Then** recebe os quadros de cada direção e ação que o original define para ele.
3. **Given** os atlas extraídos, **When** o desenvolvedor consulta qualquer um dos 493 Pokémon,
   **Then** recebe os quadros de caminhada nas quatro direções.
4. **Given** uma espécie cujo overworld muda por forma ou gênero no original, **When** o
   desenvolvedor a consulta, **Then** cada variação tem o próprio conjunto de quadros.
5. **Given** os atlas extraídos, **When** o desenvolvedor pede uma animação de caminhada,
   **Then** recebe a sequência ordenada de quadros e a duração de cada um.

---

### User Story 2 - Sprites de batalha normais e shiny (Priority: P2)

O desenvolvedor do combate pede o sprite de um Pokémon e recebe a imagem de frente e de costas,
na versão normal e na shiny, com formas alternativas e diferenças de gênero quando o original as
diferencia. As cores vêm das paletas originais.

**Why this priority**: o combate action depende deles, mas só depois de haver mapa e
personagens.

**Independent Test**: com gráficos e paletas sintéticos, extrair e conferir que a versão shiny
tem os mesmos pixels da normal com cores diferentes; com a ROM real, fazer a conferência visual
de 20 Pokémon (SC-002).

**Acceptance Scenarios**:

1. **Given** os atlas extraídos, **When** o desenvolvedor consulta um Pokémon, **Then** recebe
   o sprite de frente e de costas, normal e shiny.
2. **Given** um sprite e sua paleta shiny, **When** o desenvolvedor compara as duas versões,
   **Then** a forma é idêntica e só as cores diferem, conforme as paletas originais.
3. **Given** uma espécie com formas alternativas ou diferença de gênero no original, **When** o
   desenvolvedor a consulta, **Then** cada variação tem o próprio sprite, ligado à espécie e à
   forma pelo identificador.
4. **Given** uma espécie sem diferença de gênero ou forma, **When** o desenvolvedor consulta o
   sprite de qualquer gênero, **Then** recebe o mesmo sprite, sem duplicar a imagem.

---

### User Story 3 - Ícones de Pokémon e de itens e sprites de treinadores (Priority: P3)

O desenvolvedor de UI pede o ícone de um Pokémon (equipe, Pokédex) ou de um item (mochila) e
recebe a imagem pronta, com as cores corretas. O desenvolvedor do combate e dos diálogos pede o
sprite de um treinador.

**Why this priority**: telas de menu e treinadores completam a interface, mas o jogo roda sem
elas nas primeiras entregas.

**Independent Test**: com gráficos e paletas sintéticos, extrair e consultar ícones e
treinadores; com a ROM real, conferir as contagens no relatório.

**Acceptance Scenarios**:

1. **Given** os atlas extraídos, **When** o desenvolvedor consulta o ícone de um Pokémon,
   **Then** recebe a imagem, e a forma alternativa tem o próprio ícone quando o original a
   diferencia.
2. **Given** os atlas extraídos, **When** o desenvolvedor consulta o ícone de um item pelo
   identificador, **Then** recebe a imagem com as cores corretas.
3. **Given** os atlas extraídos, **When** o desenvolvedor consulta um sprite de treinador,
   **Then** recebe a imagem com as cores corretas.

---

### User Story 4 - Relatório e pré-visualização de desenvolvimento (Priority: P4)

Ao fim da etapa, o desenvolvedor vê o relatório de sprites, com contagens e quadros faltando.
Em uma página de pré-visualização de desenvolvimento, escolhe qualquer sprite e o vê animado,
na versão normal ou shiny, para conferir cores, quadros e ancoragem a olho.

**Why this priority**: sem o relatório e a página, a conferência de cores e quadros depende de
abrir arquivos um a um. Ela valida as histórias 1 a 3, mas não bloqueia o resto do jogo.

**Independent Test**: gerar o relatório sobre atlas completos (sem alertas) e sobre atlas com
um quadro removido; abrir a página com atlas sintéticos e animar um sprite.

**Acceptance Scenarios**:

1. **Given** a ROM real extraída, **When** o desenvolvedor gera o relatório, **Then** os 493
   Pokémon aparecem com sprites de overworld e de batalha, normal e shiny, sem quadros
   faltando.
2. **Given** atlas com um quadro faltando, **When** o relatório roda, **Then** ele lista o
   sprite e o quadro, sem esconder o problema.
3. **Given** a página de pré-visualização, **When** o desenvolvedor escolhe um sprite,
   **Then** vê a animação rodando, com opção de trocar entre normal e shiny e de ver o ponto de
   ancoragem.
4. **Given** a página de pré-visualização, **When** o desenvolvedor a abre sem atlas
   extraídos, **Then** vê uma mensagem clara dizendo que a extração precisa rodar antes.

---

### Edge Cases

- **Paleta ausente ou com menos cores que o gráfico usa**: a etapa falha para aquele sprite
  com mensagem que diz o sprite e a paleta, sem gravar imagem com cores erradas.
- **Gráfico comprimido ou corrompido**: a etapa registra o sprite no relatório como não
  extraído, diz o motivo e segue para os demais; só falha quando a perda passa do limite
  aceito pelo relatório.
- **Quadros de tamanhos diferentes no mesmo sprite**: cada quadro mantém o próprio tamanho e a
  própria ancoragem, sem cortar nem esticar.
- **Cor transparente**: a primeira cor da paleta vira transparência, como no original, e
  nenhum fundo sólido sobra no atlas.
- **Quadro espelhado**: quando o original reaproveita um quadro espelhado (por exemplo, andar
  para a esquerda e para a direita), o metadado indica o espelhamento em vez de duplicar a
  imagem; a mesma regra vale para todos os sprites.
- **Pokémon sem sprite de overworld próprio numa forma**: usa o da forma base e o relatório
  lista o caso, em vez de deixar a forma sem quadros.
- **Reextração**: com a mesma ROM, os atlas e os metadados saem idênticos byte a byte.
- **Pasta de saída com atlas anteriores incompletos**: a etapa os substitui por inteiro, sem
  deixar uma mistura de versões.

## Requirements *(mandatory)*

### Functional Requirements

**Overworld**

- **FR-001**: A etapa MUST gerar os sprites das duas opções de personagem do jogador, com os
  quadros de cada direção e de cada ação que o original define.
- **FR-002**: A etapa MUST gerar os sprites de todos os NPCs de overworld, com os quadros de
  cada direção e ação.
- **FR-003**: A etapa MUST gerar, para cada um dos 493 Pokémon, os quadros de caminhada nas
  quatro direções, incluindo formas e gênero quando o original os diferencia.

**Batalha**

- **FR-004**: A etapa MUST gerar, para cada Pokémon, o sprite de frente e de costas, na versão
  normal e na shiny, aplicando a paleta original de cada versão.
- **FR-005**: A etapa MUST gerar sprites próprios para cada forma alternativa e diferença de
  gênero que o original distingue, e MUST indicar qual espécie, forma e gênero cada sprite
  representa.

**Ícones e treinadores**

- **FR-006**: A etapa MUST gerar o ícone de cada Pokémon (incluindo formas que o original
  distingue) e o ícone de cada item.
- **FR-007**: A etapa MUST gerar os sprites de treinadores.

**Saída**

- **FR-008**: A saída MUST ser atlas de imagem acompanhados de metadados com, para cada
  quadro: nome, posição e tamanho no atlas e ponto de ancoragem.
- **FR-009**: Os metadados MUST descrever cada animação como sequência nomeada de quadros com a
  duração de cada um, e MUST indicar os quadros espelhados quando houver.
- **FR-010**: Os nomes de quadros e sprites MUST seguir os identificadores estáveis das
  features 004 e 005 (espécie, forma, item), derivados do índice original e iguais entre
  reextrações e versões do app.
- **FR-011**: A saída MUST ser determinística: a mesma ROM gera atlas e metadados idênticos byte
  a byte.
- **FR-012**: A primeira cor de cada paleta MUST virar transparência, e as demais cores MUST ser
  convertidas para a imagem final sem ajuste artístico.

**Validação e relatório**

- **FR-013**: Cada arquivo de metadados MUST ter schema único, compartilhado entre o extrator e
  o jogo (princípio VI), validado ao gravar e ao carregar, com erro que diz arquivo, caminho do
  campo e problema (princípio III).
- **FR-014**: A etapa MUST gerar o relatório de sprites com a contagem de sprites, quadros e
  animações por categoria, e MUST listar cada sprite ou quadro faltando, cada paleta ausente e
  cada substituição por forma base.
- **FR-015**: Um sprite com erro de leitura MUST ser registrado no relatório com o motivo e MUST
  NOT impedir os demais, até um limite de perdas definido no relatório.
- **FR-016**: A etapa MUST gravar a saída apenas na pasta de dados do usuário e MUST NOT gravar
  nenhuma imagem no repositório (princípio II).

**Pré-visualização**

- **FR-017**: O projeto MUST oferecer uma página de pré-visualização de desenvolvimento que lista
  os sprites extraídos e mostra qualquer um animado, na versão normal ou shiny, com opção de
  mostrar o ponto de ancoragem.
- **FR-018**: A página de pré-visualização MUST ser usada só em desenvolvimento e MUST NOT fazer
  parte do app distribuído.

**Testes**

- **FR-019**: Os testes MUST usar gráficos e paletas sintéticos e MUST NOT depender de dados
  reais da ROM (princípio II).
- **FR-020**: A conferência com a ROM real (contagens e amostra visual) MUST ser manual,
  separada da integração contínua.

### Key Entities

- **Sprite**: conjunto nomeado de quadros e animações de uma categoria (overworld, batalha,
  ícone, treinador), ligado a espécie, forma, gênero, item ou treinador pelo identificador.
- **Quadro**: imagem dentro de um atlas, com nome, posição, tamanho e ponto de ancoragem.
- **Animação**: sequência nomeada de quadros, com a duração de cada um e a indicação de
  espelhamento.
- **Atlas**: imagem que reúne os quadros de vários sprites, com o arquivo de metadados
  correspondente.
- **Paleta**: cores de um sprite, nas versões normal e shiny.
- **Relatório de sprites**: contagens por categoria, quadros e paletas faltando, e
  substituições por forma base.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Os 493 Pokémon têm sprites de overworld e de batalha, normal e shiny, sem quadros
  faltando segundo o relatório (zero alertas de quadro faltando).
- **SC-002**: Uma conferência visual de 20 Pokémon, incluindo ao menos 3 formas alternativas e 3
  diferenças de gênero, mostra cores e quadros corretos em 20 de 20, comparados com o jogo
  original.
- **SC-003**: A página de pré-visualização mostra animado qualquer sprite extraído, em até 2
  cliques a partir da lista.
- **SC-004**: Duas extrações da mesma ROM produzem atlas e metadados idênticos byte a byte.
- **SC-005**: Os testes passam usando apenas dados sintéticos, sem acesso à ROM.
- **SC-006**: Todo erro de metadados inválido diz arquivo, campo e problema em 100% dos casos
  testados.

## Assumptions

- A feature 003 entrega o acesso aos arquivos da ROM e a feature 004 entrega os identificadores
  de espécie, forma e item; os nomes de sprites derivam deles.
- O HGSS tem sprites de overworld para todos os 493 Pokémon, que cobrem os selvagens visíveis
  no mapa.
- "Todos os NPCs de overworld" significa todos os sprites de NPC que o jogo original define, sem
  filtrar por uso no mapa.
- Ícones de Pokémon seguem a regra de formas e gênero do original; ícones de item têm um quadro
  só.
- A página de pré-visualização roda só no ambiente de desenvolvimento, lê os atlas da pasta de
  dados do usuário e não é empacotada.
- Animações de interface, a renderização no jogo (feature 11) e sprites novos que não existem
  no original estão fora do escopo.
- O limite aceito de sprites não extraídos é zero para os 493 Pokémon e definido no relatório
  para as demais categorias.
