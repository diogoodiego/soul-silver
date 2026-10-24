# Feature Specification: Mapas pré-renderizados e colisão

**Feature Branch**: `006-map-prerender`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "Mapas: etapa do extrator que converte os mapas da ROM em imagens pré-renderizadas e dados de colisão alinhados, além de um visualizador de desenvolvimento para conferir o resultado."

## Contexto

O jogo usa o mesmo mapa do original (princípio I), mas desenhado em 2D (a constituição prevê mapas pré-renderizados com grade de colisão). Os mapas do HGSS são modelos 3D com alturas, pontes e níveis sobrepostos; tudo precisa virar camadas 2D que o jogo consiga desenhar e por onde consiga andar. É o maior risco técnico do projeto.

Esta feature acrescenta uma etapa ao pipeline de extração (features 003, 004 e 005) e um visualizador de desenvolvimento. Todos os dados saem da ROM do jogador e ficam na pasta de dados do usuário (princípio II).

Atores:

- **Desenvolvedor do overworld**: consome imagens, colisão e composição das áreas.
- **Desenvolvedor (conferência)**: abre mapas no visualizador para validar a extração sem o jogo pronto.
- **Jogador**: não interage com esta feature; os mapas são gerados na preparação do jogo.

Termos:

- **Mapa**: uma área jogável completa (externa, interior ou caverna) com header próprio.
- **Header de mapa**: metadados do mapa (nome, música, clima, tipo de área, referências a eventos, scripts e encontros).
- **Pedaço**: bloco de terreno 3D reutilizável que compõe uma área; cada pedaço tem tiles, permissões, alturas, prédios e modelo.
- **Matriz**: grade que diz qual pedaço ocupa cada posição da área.
- **Tile**: célula da grade de colisão; corresponde a um bloco de pixels de tamanho constante na imagem.
- **Camada inferior / superior**: imagem desenhada abaixo do jogador (chão) e acima dele (copas, telhados, toldos, parte de cima de pontes).
- **Nível**: plano de altura independente num mapa com sobreposição (ex.: caminho sob uma ponte).
- **Categoria de colisão**: bloqueado, livre, grama alta, água, ressalto (com direção), escada, transição de nível e tile especial.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Imagens e colisão alinhadas por mapa (Priority: P1)

Para cada mapa, o desenvolvedor do overworld obtém a imagem da camada inferior, a imagem da camada superior e a grade de colisão, todas alinhadas tile a tile. Em mapas com níveis sobrepostos, obtém imagens e colisão separadas por nível, com as transições entre níveis marcadas.

**Why this priority**: sem imagem e colisão alinhadas o jogador não consegue ver nem andar pelo mundo; é o núcleo da feature e o maior risco técnico.

**Independent Test**: com pedaços e matrizes sintéticos pequenos, gerar o mapa e verificar dimensões, alinhamento tile a tile, separação de camadas e categorias de colisão.

**Acceptance Scenarios**:

1. **Given** um mapa sintético de 2×2 pedaços, **When** o extrator o processa, **Then** a imagem tem largura e altura iguais ao número de tiles multiplicado pelo tamanho constante do tile, e a grade de colisão tem uma célula por tile.
2. **Given** um pedaço com copa de árvore, **When** é pré-renderizado, **Then** a copa aparece só na camada superior e o tronco e o chão na inferior.
3. **Given** um mapa com ponte sobre caminho, **When** é processado, **Then** há uma colisão e uma imagem por nível, e os tiles de entrada e saída da ponte estão marcados como transição de nível.
4. **Given** uma permissão de tile desconhecida, **When** a colisão é traduzida, **Then** o tile recebe a categoria de tile especial e preserva o valor original.
5. **Given** um mapa interior ou caverna, **When** é processado, **Then** segue o mesmo fluxo e produz o mesmo tipo de saída que um mapa externo.

---

### User Story 2 - Composição e vizinhança das áreas (Priority: P2)

Para cada área, o desenvolvedor sabe quais pedaços a compõem, quais mapas são vizinhos e qual a altura de cada pedaço, para montar o mundo contínuo. Também obtém o header de cada mapa (nome, música, clima, tipo de área e referências a eventos, scripts e encontros).

**Why this priority**: o mundo contínuo e o carregamento de eventos dependem dessa informação, mas só fazem sentido depois que cada mapa tem imagem e colisão.

**Independent Test**: com matrizes e headers sintéticos, extrair e conferir pedaços por posição, vizinhos, alturas e campos do header.

**Acceptance Scenarios**:

1. **Given** uma área sintética com matriz conhecida, **When** extraída, **Then** a lista de pedaços por posição e a altura de cada pedaço correspondem à matriz.
2. **Given** duas áreas adjacentes, **When** extraídas, **Then** cada uma lista a outra como vizinha, com a direção correta.
3. **Given** um header de mapa, **When** extraído, **Then** nome, música, clima, tipo de área e referências a eventos, scripts e encontros estão presentes.

---

### User Story 3 - Visualizador de desenvolvimento (Priority: P3)

O desenvolvedor abre qualquer mapa extraído num visualizador, alterna as camadas e liga a colisão sobreposta, colorida por categoria, para conferir a extração sem precisar do jogo pronto.

**Why this priority**: é a ferramenta de validação manual dos critérios de sucesso; não bloqueia a extração em si.

**Independent Test**: abrir um mapa sintético no visualizador, alternar camadas e a sobreposição de colisão e conferir visualmente cada categoria.

**Acceptance Scenarios**:

1. **Given** um mapa extraído, **When** o desenvolvedor o abre, **Then** vê a imagem composta das camadas.
2. **Given** o mapa aberto, **When** alterna a camada inferior ou a superior, **Then** apenas a camada escolhida é mostrada ou ocultada.
3. **Given** o mapa aberto, **When** liga a colisão, **Then** cada tile aparece com a cor da sua categoria, com legenda das cores.
4. **Given** um mapa com níveis, **When** o desenvolvedor escolhe um nível, **Then** vê a imagem e a colisão daquele nível, com as transições marcadas.

---

### Edge Cases

- Pedaço sem prédios, ou prédio que ultrapassa os limites do pedaço: o alinhamento com a grade continua exato.
- Textura animada (água, flores): o extrator grava a descrição da animação (quadros, velocidade e deslocamento) para o overworld reproduzir; o mapa é listado no relatório com o aviso `animated-texture`. Uma animação sem quadros válidos é falha do mapa, com motivo.
- Permissão de tile desconhecida: preservada com o valor original, e o mapa recebe aviso.
- Modelo 3D ou textura corrompido ou ausente: o mapa falha com motivo registrado, sem interromper os demais.
- Mapa sem vizinhos ou sem eventos: processado normalmente, com listas vazias.
- Altura do terreno que gera sobreposição ambígua entre níveis: resolvida de forma determinística e registrada como aviso.
- Reexecução sobre uma extração anterior: resultado idêntico para a mesma ROM.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O extrator MUST extrair os headers de mapa (nome, música, clima, tipo de área e referências a eventos, scripts e encontros).
- **FR-002**: O extrator MUST extrair as matrizes que montam cada área e, por pedaço, as permissões e colisão por tile, as alturas do terreno, a posição dos prédios e o modelo 3D com texturas.
- **FR-003**: O extrator MUST pré-renderizar cada pedaço, com prédios, em projeção fixa, de modo que cada tile corresponda exatamente a um bloco de pixels de tamanho constante.
- **FR-004**: O visual SHOULD lembrar o ângulo da versão DS, mas o alinhamento com a grade MUST ter prioridade sobre a fidelidade visual.
- **FR-005**: O extrator MUST gerar no mínimo duas camadas visuais por mapa: inferior (abaixo do jogador) e superior (copas, telhados, toldos, parte de cima de pontes).
- **FR-006**: Para mapas com níveis sobrepostos, o extrator MUST gerar colisão e imagens por nível e MUST marcar as transições entre níveis.
- **FR-007**: O extrator MUST traduzir as permissões originais em categorias: bloqueado, livre, grama alta, água, ressalto com direção, escada, transição de nível e tile especial.
- **FR-008**: Permissões desconhecidas MUST ser preservadas com o valor original.
- **FR-009**: O extrator MUST gravar, para cada mapa, a descrição das texturas animadas que ele usa: material, tipo de animação (rolagem de textura ou troca de quadros), número de quadros e os valores de cada quadro. Cada mapa afetado MUST ser listado no relatório.
- **FR-019**: O extrator MUST ligar cada animação ao mapa pelo nome do material que ela altera, e MUST NOT incluir animações que nenhum modelo do mapa usa.
- **FR-020**: Para cada mapa animado, o extrator MUST renderizar o ciclo reamostrado em 8 quadros e gravar só a região que muda, alinhada aos tiles, por nível e camada.
- **FR-021**: O visualizador de desenvolvimento MUST tocar esses quadros, com um controle para ligar e desligar a animação. A reprodução dentro do jogo fica com o overworld.
- **FR-010**: Interiores e cavernas MUST ser processados pelo mesmo fluxo dos mapas externos.
- **FR-011**: O extrator MUST registrar, para cada área, os pedaços que a compõem, os vizinhos e a altura de cada pedaço.
- **FR-012**: O relatório final MUST listar cada mapa como sucesso, sucesso com avisos ou falha, com o motivo.
- **FR-013**: A falha em um mapa MUST NOT interromper o processamento dos demais.
- **FR-014**: Os dados gerados MUST ser descritos por schemas validados no carregamento (princípio III), com erro claro (arquivo, caminho do campo e problema).
- **FR-015**: O visualizador de desenvolvimento MUST mostrar o mapa, alternar camadas (e níveis) e sobrepor a colisão colorida por categoria, com legenda.
- **FR-016**: O visualizador MUST funcionar apenas com os dados extraídos, sem depender do jogo completo.
- **FR-017**: Os testes MUST usar modelos e grades sintéticos pequenos e MUST NOT depender de dados reais da ROM (princípio II).
- **FR-018**: Nenhum dado derivado da ROM MUST ser commitado ou empacotado; as saídas ficam na pasta de dados do usuário (princípio II).

### Key Entities

- **Mapa**: identificador, header, área a que pertence, tipo (externo, interior, caverna), dimensões em tiles, níveis, situação no relatório.
- **Header de mapa**: nome, música, clima, tipo de área, referências a eventos, scripts e encontros.
- **Área / Matriz**: grade de posições com o pedaço de cada posição, vizinhos e alturas.
- **Pedaço**: permissões por tile, alturas, prédios, modelo 3D, texturas.
- **Camada visual**: imagem inferior ou superior, por nível.
- **Grade de colisão**: categoria por tile, valor original da permissão, direção (ressaltos), marcas de transição de nível.
- **Relatório de extração**: por mapa, situação (sucesso, sucesso com avisos, falha), motivo e lista de avisos (texturas animadas, permissões desconhecidas).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: New Bark Town, Route 29, Cherrygrove City e uma caverna com níveis sobrepostos aparecem reconhecíveis no visualizador, com colisão correta numa conferência manual.
- **SC-002**: Pelo menos 95% dos mapas são processados sem falha, e 100% das falhas restantes têm motivo registrado.
- **SC-003**: Em 100% dos mapas, a imagem e a grade batem tile a tile, sem deslocamento acumulado nas bordas (largura e altura da imagem = tiles × tamanho do tile).
- **SC-004**: 100% dos mapas aparecem no relatório com situação e motivo, e 100% dos mapas com textura animada ou permissão desconhecida estão listados com aviso.
- **SC-005**: O desenvolvedor alterna camadas e colisão de qualquer mapa em um único passo no visualizador, sem abrir o jogo.
- **SC-006**: Extrair duas vezes a mesma ROM produz saídas idênticas.

## Assumptions

- A ROM já passou pela validação de hash e pelas etapas das features 003 a 005; esta etapa reutiliza o pipeline e a pasta de dados do usuário.
- O tamanho do tile em pixels é constante; ele e o ângulo visual exato são decisões do plano, respeitando a prioridade do alinhamento.
- O visualizador é uma ferramenta de desenvolvimento, não parte do jogo distribuído ao jogador final.
- As referências a eventos, scripts e encontros são guardadas como referências; o conteúdo delas é tratado em outras features.
- A reprodução das texturas animadas dentro do jogo, o movimento do jogador, warps funcionando e NPCs (spec 8) estão fora do escopo. A extração dos dados, os quadros renderizados e a reprodução no visualizador estão dentro (FR-009, FR-019 a FR-021). O ciclo é reamostrado em 8 quadros, então a velocidade real de cada animação não é preservada.
- "Todos os mapas" significa todos os headers de mapa do jogo (externos, interiores e cavernas); a conferência manual cobre as quatro amostras do SC-001.
