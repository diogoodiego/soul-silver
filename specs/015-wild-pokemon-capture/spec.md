# Feature Specification: Pokémon selvagens e captura

**Feature Branch**: `015-wild-pokemon-capture`

**Created**: 2026-10-25

**Status**: Draft

**Input**: User description: "Pokémon selvagens e captura: o spawner que povoa o mapa com Pokémon visíveis conforme as tabelas de encontro originais, a IA básica dos selvagens e a captura com Poké Balls arremessadas."

## Contexto

Selvagens visíveis substituem os encontros aleatórios do original. Espécies, níveis e horários vêm
das tabelas de encontro extraídas (spec 8), respeitando o princípio I. Limites, temperamentos e
tempos ficam em dados (princípio III), o servidor decide spawn, IA e captura (princípio IV), e os
selvagens são compartilhados entre jogadores da sessão (princípio VII). O combate usa as regras dos
specs 13 e 14.

Atores:

- **Jogador**: encontra, luta e captura selvagens.
- **Outros jogadores**: veem os mesmos selvagens e podem disputar a captura.
- **Host**: o PC cujo relógio define o horário do dia.

Termos:

- **Zona de spawn**: conjunto de células da grade com categoria de grama alta ou chão de caverna.
- **Área**: região de um mapa com um limite de selvagens simultâneos definido em dados.
- **Horário**: manhã, dia ou noite, com as mesmas faixas de hora do original, pelo relógio do host.
- **Temperamento**: comportamento de IA da espécie (passivo, arisco, agressivo, territorial).
- **Raio de retorno**: distância máxima, em dados, que um selvagem se afasta da zona de origem.
- **Armazenamento temporário**: depósito de Pokémon capturados com a equipe cheia, até existir o PC (spec 21).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Selvagens fiéis às tabelas (Priority: P1)

O jogador vê Pokémon andando na grama alta da Route 29, das espécies e níveis que o original teria
naquele mapa e horário.

**Why this priority**: é a base da feature; sem spawn não há IA nem captura.

**Independent Test**: simular 1.000 spawns da Route 29 em cada horário e comparar a distribuição de
espécies com as taxas da tabela.

**Acceptance Scenarios**:

1. **Given** a Route 29 de dia, **When** 1.000 spawns são simulados, **Then** a frequência de cada
   espécie bate com a taxa da tabela diurna dentro da margem estatística (qui-quadrado, p ≥ 0,01).
2. **Given** o relógio do host à noite, **When** selvagens aparecem, **Then** surgem espécies noturnas
   (ex.: Hoothoot) e nenhuma espécie exclusiva do dia.
3. **Given** uma área no limite de selvagens, **When** o spawner roda, **Then** nenhum novo aparece até
   um sair.
4. **Given** um jogador olhando para uma zona de spawn, **When** um selvagem é criado, **Then** ele
   aparece fora da área visível de todos os jogadores do mapa.
5. **Given** um selvagem sem jogador por perto, **When** passa o tempo de despawn em dados, **Then** ele some.
6. **Given** um spawn sorteado shiny com a chance do original (1/8192), **Then** ele tem a paleta
   shiny e um brilho visível ao aparecer.
7. **Given** um mapa sem zonas de grama ou caverna, **When** o spawner roda, **Then** nada aparece.

---

### User Story 2 - Selvagens com temperamento (Priority: P2)

Alguns selvagens vagam e ignoram o jogador, outros fogem ao vê-lo, outros perseguem e atacam, e
alguns defendem a área em volta.

**Why this priority**: dá vida ao mundo, mas a captura funciona sem ela.

**Independent Test**: colocar um selvagem de cada temperamento perto do jogador e observar a reação.

**Acceptance Scenarios**:

1. **Given** um passivo, **When** o jogador se aproxima, **Then** ele continua vagando; **When**
   atacado, **Then** foge.
2. **Given** um arisco, **When** um jogador entra no campo de visão dele, **Then** ele foge.
3. **Given** um agressivo, **When** um jogador entra no alcance de detecção, **Then** ele persegue e
   ataca o Pokémon em combate do jogador, seguindo as regras do spec 14.
4. **Given** um territorial, **When** um jogador entra na área próxima dele, **Then** ataca; **When**
   o jogador sai dela, **Then** volta a vagar.
5. **Given** um selvagem puxado além do raio de retorno, **When** passa do limite, **Then** volta para
   perto da zona de origem.
6. **Given** uma espécie sem temperamento em dados, **When** aparece, **Then** usa o padrão (passivo).
7. **Given** um selvagem em combate, **When** ataca, **Then** usa apenas golpes aprendidos até o nível
   atual pelo learnset, com o combate do spec 13.

---

### User Story 3 - Captura com Poké Ball arremessada (Priority: P1)

O jogador mira e arremessa uma Poké Ball num selvagem enfraquecido e acompanha de 0 a 3 balançadas
até o resultado.

**Why this priority**: é o objetivo do jogador com os selvagens.

**Independent Test**: arremessar bolas em selvagens com HP e status variados e conferir chance,
balançadas e destino do capturado.

**Acceptance Scenarios**:

1. **Given** um Pokémon controlado em campo, **When** o jogador arremessa, **Then** a bola sai do
   Pokémon na direção mirada; **Given** nenhum Pokémon fora, **Then** sai do treinador.
2. **Given** a bola acerta um selvagem, **When** o resultado é sorteado, **Then** a chance segue a
   fórmula da Gen 4 (HP máximo e atual, taxa de captura, modificador da bola e de status) e mostra de
   0 a 3 balançadas antes do resultado.
3. **Given** a bola erra, **When** cai, **Then** a bola é gasta e nada acontece ao selvagem.
4. **Given** a captura falha, **When** o selvagem escapa, **Then** a bola é gasta e ele pode passar a
   agir como agressivo, com chance em dados.
5. **Given** a captura dá certo e a equipe tem vaga, **Then** o Pokémon entra na equipe; **Given** a
   equipe cheia, **Then** vai para o armazenamento temporário e o jogador é avisado.
6. **Given** dois jogadores acertam o mesmo selvagem, **When** o servidor resolve, **Then** só quem
   acertou primeiro segue com a captura; a bola do outro volta ao inventário dele.
7. **Given** o jogador sem Poké Balls, **When** tenta arremessar, **Then** nada é lançado e ele é avisado.

---

### User Story 4 - Selvagens compartilhados e Pokédex (Priority: P2)

Jogadores no mesmo mapa veem os mesmos selvagens, e cada um registra na própria Pokédex o que viu e
capturou.

**Why this priority**: cumpre o princípio VII; a Pokédex é base de progresso.

**Independent Test**: dois clientes no mesmo mapa comparando espécie, shiny e posição de cada selvagem.

**Acceptance Scenarios**:

1. **Given** dois jogadores no mesmo mapa, **When** um selvagem aparece, **Then** ambos o veem com a
   mesma espécie, nível, shiny e posição (até 1 tile de diferença, por latência).
2. **Given** um selvagem capturado por um jogador, **When** a captura termina, **Then** ele some para todos.
3. **Given** um selvagem entra na tela de um jogador, **Then** a espécie fica registrada como vista na
   Pokédex daquele jogador; **Given** uma captura, **Then** fica registrada como capturada.
4. **Given** um registro na Pokédex, **When** o jogador salva e recarrega, **Then** o registro persiste.

### Edge Cases

- A hora do host muda de faixa com selvagens em campo: os existentes ficam até o despawn; novos seguem o novo horário.
- Selvagem desmaiado não pode ser capturado e some após a animação.
- Bola que acerta um selvagem já em captura por outro jogador não tem efeito e volta ao inventário.
- Jogador sai da sessão durante as balançadas: a captura é cancelada e o selvagem volta ao mundo.
- Mapa com tabela de encontro vazia em algum horário: nada aparece naquele horário.
- Armazenamento temporário cheio (limite em dados): o arremesso é bloqueado com aviso.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE escolher espécie e nível de cada spawn pela tabela de encontro extraída do mapa e do horário, com as taxas por slot do original.
- **FR-002**: O horário DEVE vir do relógio do PC do host, com as faixas de manhã, dia e noite do original.
- **FR-003**: Nesta etapa, o spawn DEVE cobrir só grama alta e chão de caverna; outras categorias NÃO DEVEM gerar selvagens.
- **FR-004**: Zonas de spawn DEVEM ser as células da grade com a categoria correspondente, e cada área DEVE respeitar o limite de selvagens definido em dados.
- **FR-005**: Selvagens DEVEM aparecer fora da área visível de todos os jogadores do mapa.
- **FR-006**: Selvagens DEVEM sumir após um tempo, em dados, sem nenhum jogador dentro de uma distância, em dados.
- **FR-007**: Selvagens DEVEM ser os mesmos para todos os jogadores da sessão: espécie, nível, shiny, HP, status e posição.
- **FR-008**: A chance de shiny DEVE seguir o original (1/8192), com paleta própria e brilho visível ao aparecer.
- **FR-009**: Cada espécie DEVE poder ter um temperamento em dados (passivo, arisco, agressivo, territorial); sem definição, usa passivo.
- **FR-010**: Passivo DEVE vagar e fugir ao ser atacado; arisco DEVE fugir ao ver um jogador; agressivo DEVE perseguir e atacar; territorial DEVE atacar quem entra na área próxima. Raios em dados.
- **FR-011**: Selvagens DEVEM voltar para perto da zona de origem ao passar do raio de retorno.
- **FR-012**: Selvagens DEVEM usar só golpes aprendidos até o nível atual pelo learnset da espécie, com as regras de combate dos specs 13 e 14.
- **FR-013**: A captura DEVE ser um arremesso mirado que sai do Pokémon controlado ou, sem Pokémon fora, do treinador, e consome uma bola do inventário.
- **FR-014**: A chance e o número de balançadas (0 a 3) DEVEM seguir a fórmula da Gen 4, com HP máximo, HP atual, taxa de captura, modificador de status e modificador da bola.
- **FR-015**: Os modificadores de bola DEVEM estar em dados e cobrir as bolas de HGSS, incluindo as condicionais (ex.: Dusk Ball de noite ou em caverna, Quick Ball no início, Net Ball por tipo, Nest Ball por nível).
- **FR-016**: Captura falha DEVE liberar o selvagem, que pode passar a agir como agressivo com chance em dados.
- **FR-017**: Quando mais de um jogador acerta o mesmo selvagem, só o primeiro acerto registrado pelo servidor DEVE seguir com a captura.
- **FR-018**: O capturado DEVE entrar na equipe ou, com a equipe cheia, no armazenamento temporário, que DEVE persistir no save até existir o PC (spec 21).
- **FR-019**: A Pokédex de cada jogador DEVE registrar espécies vistas e capturadas e persistir no save.
- **FR-020**: Selvagens desmaiados NÃO DEVEM ser capturáveis.

### Key Entities

- **Selvagem**: espécie, nível, shiny, HP, status, golpes, temperamento, posição, zona de origem, estado de IA.
- **Área de spawn**: mapa, células da zona, limite de selvagens.
- **Tabela de encontro**: por mapa e horário, slots com espécie, faixa de nível e taxa (spec 8).
- **Temperamento por espécie**: tipo e raios de visão, detecção e território.
- **Bola**: item com modificador de captura e condição opcional.
- **Tentativa de captura**: jogador, selvagem, bola, balançadas, resultado.
- **Pokédex**: por jogador, espécies vistas e capturadas.
- **Armazenamento temporário**: por jogador, Pokémon capturados com a equipe cheia.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 1.000 spawns simulados da Route 29 em cada horário, a distribuição de espécies bate com as taxas da tabela (qui-quadrado, p ≥ 0,01).
- **SC-002**: Em 1.000 spawns noturnos nenhuma espécie exclusiva do dia aparece, e vice-versa.
- **SC-003**: Os testes cobrem a fórmula de captura com cada modificador de bola, cada status e HP cheio, metade e 1, com resultado idêntico à fórmula de referência da Gen 4.
- **SC-004**: Dois jogadores no mesmo mapa veem 100% dos selvagens com a mesma espécie, shiny e posição (até 1 tile de diferença).
- **SC-005**: Nenhum selvagem aparece dentro da área visível de um jogador em 1.000 spawns simulados.
- **SC-006**: Um jogador consegue enfraquecer e capturar um Pokémon da Route 29 em menos de 2 minutos.

## Assumptions

- As tabelas de encontro do spec 8 já trazem slots por horário para grama e caverna.
- Faixas de horário de HGSS: manhã 4h–9h59, dia 10h–19h59, noite 20h–3h59.
- As Poké Balls já existem nos dados do spec 4; o inventário mínimo para consumi-las existe ou entra neste spec.
- Temperamento padrão é passivo; os valores por espécie são escolha de design e ficam em dados.
- Modificador de status da Gen 4: sono e congelamento ×2; paralisia, queimadura e envenenamento ×1,5.
- O armazenamento temporário tem limite generoso (ex.: 30) até o spec 21.
- "Visto" é registrado quando o selvagem entra na tela do jogador.

## Fora do escopo

- Surf, pesca, Rock Smash e Headbutt (spec 22).
- Pokémon errantes e lendários (Marco 4).
- Enxames e encontros por rádio.
- PC de armazenamento (spec 21).
