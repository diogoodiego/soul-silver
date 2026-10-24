# Feature Specification: Eventos, scripts, encontros e treinadores

**Feature Branch**: `008-events-scripts-encounters`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "Eventos, scripts, encontros e treinadores: etapa do extrator que converte tudo o que dá vida a cada mapa (NPCs, warps, gatilhos, placas, scripts, tabelas de encontro e times de treinadores) em dados legíveis."

## Contexto

Os triggers da história precisam ser os mesmos do original (princípio I). Hoje o extrator já entrega os mapas (feature 006), os textos (feature 005) e os dados de espécies, golpes e itens (feature 004), mas um mapa ainda é um cenário vazio: falta tudo o que acontece nele. Esses dados vêm da ROM do jogador, e nenhum deles pode ser distribuído com o app (princípio II).

Esta feature acrescenta uma etapa ao pipeline de extração (features 003 a 007). Ela converte os eventos de cada mapa, os scripts, as tabelas de encontro e os times de treinadores em arquivos de dados legíveis, sem executar nada. Três features futuras dependem deles: o interpretador de scripts (feature 18), o spawner de Pokémon selvagens (feature 15) e as batalhas contra treinadores (feature 20).

Atores:

- **Desenvolvedor do interpretador**: precisa ler qualquer script como comandos, não como bytes.
- **Desenvolvedor do spawner**: precisa das tabelas de encontro de cada mapa, por tipo e horário.
- **Desenvolvedor do combate**: precisa dos times dos treinadores.
- **Desenvolvedor (conferência)**: confere o resultado contra o jogo original e usa o relatório de cobertura.
- **Jogador**: não interage com esta feature. Os dados são gerados durante a preparação do jogo.

Termos:

- **Evento**: algo que existe num mapa e reage ao jogador: NPC, warp, gatilho de posição, placa ou interação de fundo.
- **Warp**: ponto do mapa que leva o jogador a outro mapa e posição.
- **Gatilho de posição**: área do mapa que dispara um script quando o jogador pisa nela, às vezes só sob uma condição (por exemplo, uma flag de progresso).
- **Script**: sequência de comandos do jogo que descreve uma cena ou interação.
- **Comando**: uma instrução de script, com nome e argumentos.
- **Rótulo de salto**: destino nomeado de um desvio dentro de um script.
- **Sequência de movimento**: lista de passos que um NPC executa durante um script.
- **Tabela de encontro**: lista de Pokémon selvagens de um mapa para um tipo de encontro, com taxas e faixas de nível.
- **Time de treinador**: classe, nome e Pokémon de um treinador, com nível, golpes, item segurado e flags de IA.
- **Relatório de cobertura**: resumo gerado ao fim da etapa, com cada comando de script, o número de ocorrências e os mapas em que aparece.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Eventos e scripts legíveis (Priority: P1)

O desenvolvedor do interpretador abre os dados de um mapa e vê seus eventos: NPCs com posição, sprite, tipo de movimento, script e flag de visibilidade; warps com destino; gatilhos de posição com a condição; placas e interações de fundo. Cada script aparece como lista de comandos com nome, argumentos nomeados e rótulos de salto, e os textos que ele mostra apontam para os identificadores do catálogo de textos (feature 005).

**Why this priority**: sem eventos e scripts, os mapas não têm história nem interação, e o interpretador (feature 18) não tem o que ler. É o núcleo da feature.

**Independent Test**: com eventos e scripts sintéticos, extrair e conferir que cada comando sai com nome e argumentos e que um comando desconhecido sai como dado bruto; com a ROM real, comparar New Bark Town, o laboratório do Prof. Elm e a Route 29 com o jogo original (SC-001).

**Acceptance Scenarios**:

1. **Given** os dados extraídos, **When** o desenvolvedor consulta um mapa, **Then** recebe a lista de NPCs, warps, gatilhos de posição e placas ou interações de fundo, cada um com seus atributos.
2. **Given** um NPC, **When** o desenvolvedor o consulta, **Then** recebe posição, sprite, tipo de movimento, script e flag de visibilidade.
3. **Given** um script, **When** o desenvolvedor o consulta, **Then** recebe a lista ordenada de comandos, cada um com nome e argumentos nomeados, e os desvios apontam para rótulos de salto.
4. **Given** um comando que mostra texto, **When** o desenvolvedor o consulta, **Then** o argumento de texto traz o identificador do catálogo de textos, não o índice bruto.
5. **Given** um comando que a etapa não conhece, **When** o script é extraído, **Then** o comando é preservado como dado bruto na posição original, sem ser descartado.
6. **Given** um NPC que anda durante um script, **When** o desenvolvedor consulta o script, **Then** recebe a sequência de movimento como lista de passos legíveis.

---

### User Story 2 - Tabelas de encontro por tipo e horário (Priority: P2)

O desenvolvedor do spawner pede as tabelas de encontro de um mapa e recebe cada uma separada por tipo de encontro e, na grama, por horário: grama de manhã, de dia e de noite; surf; cada vara de pesca; Rock Smash; e as demais variantes que o HGSS tiver. Cada entrada traz espécie, taxa e faixa de nível.

**Why this priority**: os Pokémon selvagens visíveis dependem dessas tabelas, mas só fazem sentido depois de haver mapas com eventos.

**Independent Test**: com tabelas sintéticas, extrair e conferir a separação por tipo e horário; com a ROM real, comparar 5 rotas com fontes de referência (SC-003).

**Acceptance Scenarios**:

1. **Given** os dados extraídos, **When** o desenvolvedor consulta um mapa com grama, **Then** recebe tabelas separadas para manhã, dia e noite.
2. **Given** um mapa com água, **When** o desenvolvedor o consulta, **Then** recebe a tabela de surf e a de cada vara de pesca que o original define.
3. **Given** um mapa com Rock Smash ou outra variante que o HGSS define, **When** o desenvolvedor o consulta, **Then** recebe a tabela correspondente.
4. **Given** qualquer entrada de uma tabela, **When** o desenvolvedor a consulta, **Then** recebe a espécie (pelo identificador da feature 004), a taxa e a faixa de nível.
5. **Given** um mapa sem encontros de um tipo, **When** o desenvolvedor consulta esse tipo, **Then** o tipo está ausente, sem tabela vazia inventada.

---

### User Story 3 - Times de treinadores (Priority: P3)

O desenvolvedor do combate pede um treinador e recebe classe, nome e o time completo: cada Pokémon com nível, golpes, item segurado e as flags de IA do treinador.

**Why this priority**: as batalhas contra treinadores (feature 20) só vêm depois de mapa, scripts e encontros selvagens.

**Independent Test**: com treinadores sintéticos, extrair e conferir o time; com a ROM real, comparar 5 treinadores com fontes de referência (SC-003).

**Acceptance Scenarios**:

1. **Given** os dados extraídos, **When** o desenvolvedor consulta um treinador, **Then** recebe classe, nome e a lista de Pokémon do time.
2. **Given** um Pokémon do time, **When** o desenvolvedor o consulta, **Then** recebe espécie, nível, golpes, item segurado e as flags de IA do treinador.
3. **Given** um treinador cujo time usa golpes e itens padrão do original, **When** o desenvolvedor o consulta, **Then** os golpes e os itens aparecem pelos identificadores da feature 004, sem índices brutos.
4. **Given** um NPC de overworld que é treinador, **When** o desenvolvedor consulta o evento, **Then** ele aponta para o treinador correspondente.

---

### User Story 4 - Relatório de cobertura de scripts (Priority: P4)

Ao fim da etapa, o desenvolvedor vê o relatório de cobertura: cada comando de script que existe, quantas vezes aparece e em quais mapas, ordenado de forma a priorizar a implementação do interpretador. Comandos desconhecidos aparecem listados à parte.

**Why this priority**: o relatório orienta o trabalho da feature 18, mas os dados já valem sem ele.

**Independent Test**: gerar o relatório sobre scripts sintéticos com contagens conhecidas e conferir os números; incluir um comando desconhecido e conferir que ele aparece em destaque.

**Acceptance Scenarios**:

1. **Given** a ROM real extraída, **When** o desenvolvedor gera o relatório, **Then** cada comando de script aparece com o número de ocorrências e a lista de mapas.
2. **Given** scripts com um comando desconhecido, **When** o relatório roda, **Then** o comando aparece numa seção própria, com ocorrências e mapas.
3. **Given** a ROM real extraída, **When** o desenvolvedor lê o relatório, **Then** ele informa que 100% dos scripts foram decodificados ou lista os que não foram.

---

### Edge Cases

- **Comando desconhecido**: é preservado como dado bruto, na posição original, e aparece no relatório; a etapa nunca descarta nem aborta por causa dele.
- **Script que termina no meio ou com desvio para fora dos limites**: a etapa registra o script no relatório como não decodificado, com o motivo, e segue para os demais; só falha quando a perda passa do limite aceito pelo relatório.
- **Script compartilhado por vários eventos**: aparece uma vez nos dados, e cada evento aponta para ele, sem duplicar.
- **Referência a texto inexistente**: a etapa registra o problema no relatório, diz o script e o identificador, e mantém o índice bruto no lugar.
- **Mapa sem eventos ou sem encontros**: gera arquivo com listas vazias ou omite o tipo, sem erro.
- **Gatilho de posição com condição**: a condição é gravada de forma legível (qual flag ou variável e qual valor), não como bytes.
- **Evento de visibilidade controlada por flag**: a flag é gravada com seu identificador, para o servidor decidir por jogador o que enviar (princípio VII).
- **Espécie, golpe ou item com índice fora da faixa conhecida**: a etapa falha para aquele registro com mensagem que diz mapa ou treinador e o índice, sem gravar dado errado.
- **Reextração**: com a mesma ROM, os dados saem idênticos byte a byte.
- **Pasta de saída com dados anteriores incompletos**: a etapa os substitui por inteiro, sem deixar uma mistura de versões.

## Requirements *(mandatory)*

### Functional Requirements

**Eventos**

- **FR-001**: A etapa MUST gerar, para cada mapa, a lista de NPCs com posição, sprite, tipo de movimento, script e flag de visibilidade.
- **FR-002**: A etapa MUST gerar, para cada mapa, os warps com o mapa e a posição de destino.
- **FR-003**: A etapa MUST gerar, para cada mapa, os gatilhos de posição com a área, o script e a condição.
- **FR-004**: A etapa MUST gerar, para cada mapa, as placas e interações de fundo com posição e script ou texto associado.

**Scripts**

- **FR-005**: A etapa MUST decodificar cada script como lista ordenada de comandos, cada um com nome e argumentos nomeados, e MUST representar desvios por rótulos de salto.
- **FR-006**: A etapa MUST decodificar as sequências de movimento de NPCs como listas de passos legíveis.
- **FR-007**: A etapa MUST preservar como dado bruto, na posição original, todo comando que não souber decodificar, e MUST NOT descartá-lo.
- **FR-008**: Os argumentos que referenciam texto MUST apontar para os identificadores do catálogo de textos (feature 005), e os que referenciam espécie, golpe ou item MUST usar os identificadores da feature 004.
- **FR-009**: Scripts compartilhados por vários eventos MUST ser gravados uma vez, e cada evento MUST apontar para o script.

**Encontros**

- **FR-010**: A etapa MUST gerar as tabelas de encontro de cada mapa separadas por tipo: grama, surf, cada vara de pesca, Rock Smash e as demais variantes que o HGSS definir.
- **FR-011**: A grama MUST sair separada em manhã, dia e noite.
- **FR-012**: Cada entrada de uma tabela MUST trazer espécie, taxa e faixa de nível, e a soma e a ordem das taxas MUST seguir o original.

**Treinadores**

- **FR-013**: A etapa MUST gerar, para cada treinador, classe, nome e time, com nível, golpes, item segurado e flags de IA.
- **FR-014**: Os eventos que representam treinadores MUST apontar para o treinador correspondente.

**Saída, validação e relatório**

- **FR-015**: Cada arquivo de dados MUST ter schema único, compartilhado entre o extrator e o jogo (princípio VI), validado ao gravar e ao carregar, com erro que diz arquivo, caminho do campo e problema (princípio III).
- **FR-016**: A saída MUST ser determinística: a mesma ROM gera dados idênticos byte a byte.
- **FR-017**: A etapa MUST gerar o relatório de cobertura com cada comando de script, o número de ocorrências e os mapas em que aparece, e MUST listar à parte os comandos desconhecidos e os scripts não decodificados.
- **FR-018**: Um script ou registro com erro de leitura MUST ser registrado no relatório com o motivo e MUST NOT impedir os demais, até um limite de perdas definido no relatório.
- **FR-019**: A etapa MUST gravar a saída apenas na pasta de dados do usuário e MUST NOT gravar nenhum dado extraído no repositório (princípio II).

**Testes**

- **FR-020**: Os testes MUST usar scripts, eventos, tabelas e treinadores sintéticos e MUST NOT depender de dados reais da ROM (princípio II).
- **FR-021**: A conferência com a ROM real (cenas, rotas e treinadores) MUST ser manual, separada da integração contínua.

### Key Entities

- **Evento**: NPC, warp, gatilho de posição ou placa de um mapa, com posição e referência a script ou destino.
- **NPC**: evento com sprite, tipo de movimento, script e flag de visibilidade; pode ser um treinador.
- **Warp**: evento com destino (mapa e posição).
- **Gatilho de posição**: evento com área, condição e script.
- **Script**: lista ordenada de comandos com rótulos de salto, compartilhável entre eventos.
- **Comando**: nome e argumentos nomeados; quando desconhecido, dado bruto.
- **Sequência de movimento**: lista de passos de um NPC.
- **Tabela de encontro**: tipo (e horário, na grama) com entradas de espécie, taxa e faixa de nível, ligada a um mapa.
- **Treinador**: classe, nome e time; cada Pokémon do time tem nível, golpes, item segurado e flags de IA.
- **Relatório de cobertura**: comandos com ocorrências e mapas, comandos desconhecidos e scripts não decodificados.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Os scripts de New Bark Town, do laboratório do Prof. Elm e da Route 29, conferidos contra o jogo original, descrevem os mesmos eventos na mesma ordem em 3 de 3 mapas.
- **SC-002**: 100% dos scripts são decodificados, e todo comando desconhecido, se houver, aparece listado no relatório de cobertura.
- **SC-003**: As tabelas de encontro de 5 rotas e os times de 5 treinadores, conferidos contra fontes de referência, batem em 10 de 10.
- **SC-004**: Duas extrações da mesma ROM produzem dados idênticos byte a byte.
- **SC-005**: Os testes passam usando apenas dados sintéticos, sem acesso à ROM.
- **SC-006**: Todo erro de dados inválidos diz arquivo, campo e problema em 100% dos casos testados.

## Assumptions

- A feature 003 entrega o acesso aos arquivos da ROM, a 004 entrega os identificadores de espécie, golpe e item, a 005 entrega o catálogo de textos e a 006 entrega a lista de mapas e suas posições; esta feature depende dos identificadores e das referências delas.
- A conferência SC-001 e SC-003 é feita manualmente pelo desenvolvedor, contra o jogo original e fontes de referência da comunidade, e não faz parte da integração contínua.
- "Todos os scripts" significa todos os scripts que o jogo original define, sem filtrar por uso no mapa.
- O conjunto de tipos de encontro é o que o HGSS define; a lista exata é descoberta na extração, e os tipos que não existirem simplesmente não aparecem.
- Executar scripts (feature 18), o spawner de Pokémon selvagens (feature 15) e a IA de treinadores (feature 20) estão fora do escopo.
- O limite aceito de arquivos de script perdidos é 2% (zero para a ROM real hoje). A etapa não sabe qual arquivo é da história principal, então o limite vale para todos.
- Além do que a spec lista, a mesma leitura inclui os level scripts de cada mapa (scripts que o jogo roda ao carregar o mapa ou por variável, parte dos triggers da história) e as tabelas de headbutt. Os encontros do Safari e do Concurso de Insetos ficam fora desta entrega.
- "Decodificar um script" significa decodificar tudo que uma entrada do arquivo alcança; os bytes que nenhuma entrada alcança (código morto e padding de alinhamento) são contados no relatório e não decodificados.
- Os argumentos de comando só recebem tipo semântico (texto, espécie, golpe, item, treinador, flag, variável, salto, movimento) quando o nome do argumento na tabela de comandos o indica; os demais saem como número e a feature 18 pode refinar a tabela.
