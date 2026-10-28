# Feature Specification: Batalhas contra treinadores

**Feature Branch**: `022-trainer-battles`

**Created**: 2026-10-27

**Status**: Draft

**Input**: User description: "Batalhas contra treinadores: treinadores NPC que avistam o jogador, se aproximam e lutam em tempo real com os times originais, usando a IA de combate com perfis derivados das flags de IA originais, decisões de troca e uso de itens."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Treinador avista e desafia (Priority: P1)

O jogador entra no campo de visão de um treinador. O treinador mostra o "!", o jogador é travado, o treinador caminha até ele e o diálogo de desafio acontece, como no original. Lutas iniciadas por script (rival, líderes) seguem o mesmo fluxo a partir do comando de batalha.

**Why this priority**: sem o desafio não há batalha; é a porta de entrada de toda a progressão.

**Independent Test**: caminhar até o campo de visão de um treinador da Route 29 e verificar "!", aproximação, diálogo e criação da arena; repetir com um obstáculo na linha de visão e verificar que não há desafio.

**Acceptance Scenarios**:

1. **Given** um treinador não derrotado com alcance de visão definido nos dados extraídos, **When** o jogador entra na linha de visão dentro do alcance, **Then** aparece o "!", o jogador fica travado, o treinador caminha até ele e o diálogo de desafio é exibido.
2. **Given** um obstáculo entre o treinador e o jogador, **When** o jogador está dentro do alcance, **Then** o treinador não o avista.
3. **Given** um script que dispara batalha (rival em Cherrygrove City, Falkner), **When** o comando de batalha executa, **Then** a luta começa pelo mesmo fluxo de arena e diálogo.

---

### User Story 2 - Lutar contra o time inteiro (Priority: P1)

O jogador luta em tempo real, Pokémon por Pokémon, contra o time original. O treinador fica parado e intocável, lança um Pokémon por vez na ordem original, troca e usa itens de forma inteligente conforme o perfil de IA derivado das flags originais.

**Why this priority**: é o núcleo da feature.

**Independent Test**: lutar contra um treinador com poções e flags de troca e observar ordem do time, troca por desvantagem de tipo e uso de poção abaixo do limiar.

**Acceptance Scenarios**:

1. **Given** uma batalha em andamento, **When** o Pokémon do treinador desmaia, **Then** o próximo do time original entra; quando o último cai, a batalha termina.
2. **Given** um perfil com troca habilitada e o Pokémon ativo em desvantagem de tipo, **When** a IA decide, **Then** ela troca por um Pokémon mais favorável.
3. **Given** um treinador com poção e Pokémon abaixo do limiar de HP do perfil, **When** a IA decide, **Then** ele usa a poção com o mesmo tempo de uso que o jogador teria.
4. **Given** um treinador sem flags de IA, **When** a batalha começa, **Then** o perfil padrão da classe é usado.
5. **Given** uma batalha contra treinador, **When** o jogador tenta lançar Poké Ball, **Then** é bloqueado com a mensagem original; **When** tenta fugir, **Then** não é possível.
6. **Given** uma batalha dupla do original, **When** ela começa, **Then** os dois Pokémon adversários entram juntos e o segundo Pokémon da equipe do jogador luta como aliado controlado pela IA.
7. **Given** a arena, **Then** os Pokémon dos dois lados ficam contidos nela, o treinador NPC não pode ser atingido e o raio máximo do companheiro é o da arena.

---

### User Story 3 - Recompensas e fim da batalha (Priority: P2)

Ao vencer, o jogador vê a fala de derrota, recebe o prêmio em dinheiro pela fórmula original e o XP, e o treinador fica marcado como derrotado, sem desafiar de novo. Ao perder, ocorre o blackout já definido. A música de batalha toca conforme a categoria (treinador, rival, líder), com a fanfarra de vitória ao fim.

**Why this priority**: fecha o ciclo e dá progressão, mas depende das histórias 1 e 2.

**Independent Test**: vencer um treinador e conferir dinheiro, XP, fala, flag e ausência de novo desafio; perder e conferir o blackout.

**Acceptance Scenarios**:

1. **Given** vitória, **Then** a fala de derrota é exibida, o dinheiro segue a fórmula original, o XP é distribuído e o treinador é marcado como derrotado nas flags do jogador.
2. **Given** um treinador derrotado, **When** o jogador passa pelo campo de visão, **Then** não há desafio.
3. **Given** derrota, **Then** ocorre blackout conforme as regras existentes.
4. **Given** batalha de treinador, rival ou líder, **Then** a música correspondente dos dados extraídos toca, e a fanfarra de vitória toca ao fim.

---

### User Story 4 - Multiplayer sem interferência (Priority: P2)

A batalha é de um único jogador. Os demais veem a arena e a luta, mas não entram nela nem atingem os Pokémon de dentro. O mesmo treinador pode lutar com dois jogadores ao mesmo tempo, em arenas distintas.

**Why this priority**: preserva o progresso individual em mundo compartilhado.

**Independent Test**: com dois jogadores, um luta enquanto o outro tenta atacar os Pokémon da arena; depois ambos desafiam o mesmo treinador simultaneamente.

**Acceptance Scenarios**:

1. **Given** um jogador em batalha, **When** outro tenta entrar na arena ou atingir seus Pokémon, **Then** não consegue.
2. **Given** dois jogadores que avistam o mesmo treinador, **Then** cada um tem sua própria batalha e arena, com estado do treinador independente.

---

### Edge Cases

- Jogador avistado por dois treinadores ao mesmo tempo: apenas um desafio é iniciado por vez.
- Jogador desconecta durante a batalha: a batalha é encerrada sem marcar o treinador como derrotado.
- Flag de IA sem mapeamento: cai no perfil padrão da classe.
- Itens do treinador esgotados: a IA não tenta usá-los de novo.
- Time do treinador com um único Pokémon: a decisão de troca não é tomada.
- Companheiro do jogador desmaiado em batalha dupla: a luta continua só com o Pokémon controlado.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O alcance de visão de cada treinador MUST vir dos dados de eventos extraídos, e a percepção MUST usar a linha de visão da IA de combate, com obstáculos bloqueando a visão.
- **FR-002**: Ao avistar o jogador, o treinador MUST mostrar o "!", travar o jogador, caminhar até ele e iniciar o diálogo de desafio.
- **FR-003**: Lutas iniciadas por script MUST usar o mesmo fluxo a partir do comando de batalha.
- **FR-004**: A batalha MUST criar uma arena ao redor do ponto do encontro que contém os Pokémon dos dois lados e define o raio máximo do companheiro.
- **FR-005**: O treinador NPC MUST ficar parado e não ser atingível, e MUST lançar um Pokémon por vez na ordem do time original.
- **FR-006**: Os Pokémon do treinador MUST usar a IA de combate com perfil derivado das flags de IA originais por tabela de mapeamento em dados; sem flags, perfil padrão por classe.
- **FR-007**: A IA de treinador MUST decidir trocar de Pokémon (desvantagem de tipo ou HP baixo, conforme o perfil) e usar itens do time original com o mesmo tempo de uso do jogador.
- **FR-008**: Poké Ball MUST ser bloqueada contra Pokémon de treinador, com a mensagem original, e fugir MUST ser impossível.
- **FR-009**: Em batalhas duplas do original, os dois Pokémon adversários MUST entrar juntos; o segundo Pokémon do jogador MUST lutar como aliado controlado pela IA.
- **FR-010**: Na vitória, o sistema MUST exibir a fala de derrota, pagar o prêmio pela fórmula original, distribuir XP e marcar o treinador como derrotado nas flags do jogador; treinadores derrotados MUST NOT desafiar de novo.
- **FR-011**: Na derrota, o sistema MUST aplicar o blackout existente.
- **FR-012**: A música de batalha de treinador, rival e líder MUST seguir os dados extraídos, com fanfarra de vitória ao fim.
- **FR-013**: A batalha MUST ser de um único jogador; outros jogadores MUST ver a arena mas MUST NOT entrar nem atingir os Pokémon dela.
- **FR-014**: O estado do treinador MUST ser por jogador, permitindo batalhas simultâneas com jogadores distintos em arenas distintas.

### Key Entities

- **Treinador**: NPC com classe, time original, itens, alcance de visão, flags de IA, fala de derrota e fala de desafio.
- **Perfil de IA de treinador**: comportamento de combate derivado das flags originais (ou padrão da classe), incluindo regras de troca e uso de itens.
- **Batalha de treinador**: instância por jogador com arena, lados, time restante e itens restantes.
- **Estado de derrota**: flag por jogador indicando treinador derrotado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% dos treinadores da Route 29 até a Sprout Tower e do Ginásio de Violet City avistam, desafiam e lutam com o time original.
- **SC-002**: A luta contra o rival em Cherrygrove City e contra Falkner ocorrem a partir dos scripts originais e terminam com dinheiro e flags corretos.
- **SC-003**: Testes automatizados cobrem troca por desvantagem de tipo, uso de poção abaixo do limiar, bloqueio de captura, bloqueio de fuga e a fórmula de prêmio, todos passando.
- **SC-004**: Em testes com dois jogadores, 0 ataques de um jogador atingem os Pokémon da batalha do outro.
- **SC-005**: Nenhum treinador derrotado volta a desafiar o mesmo jogador.

## Assumptions

- A IA de combate (spec 019) e o interpretador de scripts (spec 020) estão disponíveis e são reutilizados.
- Dados de visão, times, itens, flags de IA, prêmios e músicas vêm da extração da ROM.
- Blackout, XP e dinheiro seguem as regras já definidas em specs anteriores.
- Fora do escopo: revanches por telefone, puzzles de ginásio, batalhas cooperativas contra treinadores, Elite Four e lendários.
