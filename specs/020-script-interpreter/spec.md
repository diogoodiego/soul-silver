# Feature Specification: Interpretador de scripts

**Feature Branch**: `020-script-interpreter`

**Created**: 2026-10-26

**Status**: Draft

**Input**: User description: "Interpretador de scripts: executa os scripts de evento extraídos da ROM no servidor, por jogador, com flags e variáveis individuais. É o motor que faz os triggers da história funcionarem como no original."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Eventos de história como no original (Priority: P1)

O jogador fala com NPCs, lê placas, pisa em gatilhos e entra em mapas, e vê acontecer o mesmo que no jogo original: diálogos, escolhas, itens recebidos, Pokémon recebidos, transições e músicas, na mesma ordem e com os mesmos textos.

**Why this priority**: Sem isso nenhum evento da história funciona; é o motor de toda a progressão.

**Independent Test**: Jogar da introdução até a chegada a Violet City e conferir que cada evento ocorre na ordem e com os textos do original, sem comando faltante no log.

**Acceptance Scenarios**:

1. **Given** um jogador diante de um NPC com script, **When** interage, **Then** o script executa e o cliente apresenta os diálogos e escolhas pedidos, com o jogador travado até o fim.
2. **Given** um jogador sobre um gatilho de posição, **When** pisa nele e a condição das flags é satisfeita, **Then** o script executa conforme o original.
3. **Given** um jogador que entra em um mapa com script de entrada, **When** a entrada termina, **Then** o script de entrada executa e os scripts de mapa por condição passam a ser avaliados.
4. **Given** um script que pede nome ou gênero do jogador na introdução, **When** executa, **Then** usa os valores escolhidos na criação do save, sem perguntar de novo.
5. **Given** um comando bloqueante (mensagem, escolha, movimento, espera, fade), **When** executado, **Then** o script desse jogador suspende até o cliente confirmar; comandos não bloqueantes seguem no mesmo tick.

---

### User Story 2 - Progresso independente por jogador (Priority: P1)

Em grupo, cada jogador tem suas próprias flags e variáveis. O que um faz na história não altera a história dos outros, e NPCs e eventos são mostrados conforme o progresso de cada um.

**Why this priority**: É requisito do modo cooperativo e dos princípios de save por jogador e de filtragem no servidor.

**Independent Test**: Dois jogadores na mesma sessão em pontos diferentes da história veem NPCs e eventos coerentes com o próprio progresso.

**Acceptance Scenarios**:

1. **Given** dois jogadores no mesmo mapa, **When** um conclui um evento que remove um NPC, **Then** o NPC continua visível e interativo para o outro.
2. **Given** um jogador com flags alteradas por scripts, **When** salva e recarrega, **Then** flags e variáveis são restauradas.

---

### User Story 3 - Comandos faltantes não travam o jogo (Priority: P2)

O desenvolvedor implementa os comandos por prioridade do relatório de cobertura. Um comando ainda não implementado encerra o script daquele jogador com segurança, destrava o jogador e é registrado num log de comandos faltantes.

**Why this priority**: Permite entrega incremental sem risco de soft-lock.

**Independent Test**: Injetar um comando não implementado num script sintético: o script termina, o jogador é destravado e o comando aparece no log.

**Acceptance Scenarios**:

1. **Given** um script com comando não implementado, **When** a execução o alcança, **Then** o script encerra, o jogador é destravado e o comando (com script e posição) é logado.
2. **Given** o relatório de cobertura, **When** a etapa termina, **Then** todos os comandos usados da introdução até Violet City estão implementados.

---

### User Story 4 - Depuração de scripts (Priority: P3)

O desenvolvedor acompanha o script em execução de um jogador: comando atual, flags e variáveis, e pode alterar flags para testar eventos.

**Why this priority**: Ferramenta de apoio; não afeta o jogador final.

**Independent Test**: Com o depurador aberto, executar um script e ver o comando atual avançar; alterar uma flag e ver o efeito no evento seguinte.

**Acceptance Scenarios**:

1. **Given** um script em execução, **When** o desenvolvedor abre o depurador, **Then** vê o script, o comando atual, flags e variáveis do jogador.
2. **Given** o depurador aberto, **When** altera uma flag, **Then** o novo valor vale para os próximos eventos desse jogador.

### Edge Cases

- Jogador desconecta com script suspenso: o script é descartado sem deixar estado inconsistente; ao reconectar, não fica travado.
- Cliente nunca confirma um comando bloqueante: o script não bloqueia outros jogadores nem o servidor.
- Dois jogadores executam o mesmo script ao mesmo tempo: execuções independentes, sem interferência.
- Script com laço infinito ou chamadas recursivas profundas: é interrompido por limite seguro e registrado.
- Jogador dispara um segundo gatilho enquanto um script roda: não inicia execução concorrente para o mesmo jogador.
- Salto ou chamada para destino inexistente: encerra com segurança e é registrado.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O servidor MUST executar os scripts de evento extraídos da ROM; o cliente apenas apresenta diálogos, escolhas, transições e movimentos.
- **FR-002**: Cada jogador MUST ter flags e variáveis próprias, incluídas no save.
- **FR-003**: O sistema MUST cobrir os contextos: interação com NPC, interação com placa/objeto, gatilho de posição, script ao entrar no mapa e scripts de mapa disparados por condição.
- **FR-004**: Comandos bloqueantes MUST suspender o script do jogador até confirmação do cliente; não bloqueantes MUST continuar no mesmo tick.
- **FR-005**: O sistema MUST implementar os grupos: fluxo (saltos, chamadas, comparações, fim), flags e variáveis, mensagens com variáveis e escolha sim/não, dar/tirar itens e dinheiro, dar Pokémon (incluindo o inicial), cura da equipe, warp, fade, espera, música e efeito sonoro, travar/liberar jogador.
- **FR-006**: O sistema MUST expor pontos de ligação para movimento e câmera, início de batalha contra treinador e contra Pokémon fixo, lojas e PC, sem implementar essas lógicas.
- **FR-007**: A implementação MUST seguir a prioridade do relatório de cobertura, começando por todos os comandos usados da introdução até Violet City.
- **FR-008**: Um comando não implementado MUST encerrar o script do jogador com segurança, destravá-lo e ser registrado no log de comandos faltantes.
- **FR-009**: Nome e gênero pedidos pelos scripts na introdução MUST usar os valores da criação do save, sem nova pergunta.
- **FR-010**: O servidor MUST filtrar NPCs e eventos conforme as flags de cada jogador.
- **FR-011**: Um depurador de desenvolvimento MUST mostrar o script em execução, o comando atual, flags e variáveis de um jogador e permitir alterar flags.
- **FR-012**: O sistema MUST impedir mais de um script simultâneo por jogador e proteger contra execução sem fim.
- **FR-013**: Os testes MUST usar scripts sintéticos cobrindo cada grupo de comandos.

### Key Entities

- **Script de evento**: sequência de comandos extraída da ROM, associada a NPC, placa/objeto, gatilho, entrada de mapa ou condição de mapa.
- **Execução de script**: estado de um script em andamento para um jogador (posição atual, pilha de chamadas, suspensão por comando bloqueante).
- **Flags e variáveis do jogador**: estado de história individual, persistido no save.
- **Log de comandos faltantes**: registro de comandos não implementados encontrados, com script e posição.
- **Relatório de cobertura**: lista de comandos usados por região da história, que guia a prioridade.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Da introdução até a chegada a Violet City, 100% dos eventos ocorrem na ordem e com os textos do original, com zero comandos faltantes no log.
- **SC-002**: Dois jogadores na mesma sessão em pontos diferentes da história veem 100% dos NPCs e eventos coerentes com o próprio progresso.
- **SC-003**: Um comando faltante injetado encerra o script, destrava o jogador em até 1 segundo e aparece no log em 100% dos casos testados.
- **SC-004**: Todo grupo de comandos desta etapa tem ao menos um teste com script sintético aprovado.
- **SC-005**: Um desenvolvedor identifica o comando atual e as flags de um jogador em menos de 10 segundos pelo depurador.

## Assumptions

- Os scripts e o relatório de cobertura já são produzidos pela extração da ROM.
- A criação do save já guarda nome e gênero do jogador.
- Movimento scriptado de NPCs e câmera, lógica de batalha contra treinadores, lojas e PC, e comandos usados só depois de Violet City estão fora do escopo (specs próprios).
- Os princípios I (fidelidade ao original), IV (servidor autoritativo) e VII (estado por jogador no save) da constituição se aplicam.
