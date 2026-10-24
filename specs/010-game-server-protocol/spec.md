# Feature Specification: Servidor de jogo e protocolo

**Feature Branch**: `010-game-server-protocol`

**Created**: 2026-10-24

**Status**: Draft

**Input**: User description: "Servidor de jogo e protocolo: o núcleo da simulação autoritativa. Inclui o ciclo de vida da sessão, o loop de tick, o modelo de entidades e o protocolo versionado entre cliente e servidor. Todo o resto do Marco 2 roda em cima dele."

## Contexto

O princípio IV define o servidor como única fonte de verdade, com tick fixo de 20 Hz e simulação
testável sem a pilha gráfica. Combate em tempo real exige que inputs, estado e correções circulem
de forma previsível. Esta feature entrega essa base para que as features seguintes do Marco 2 não
reinventem sincronização. Jogar sozinho usa o mesmo servidor local.

Atores:

- **Jogador**: controla um personagem e vê os outros jogadores da mesma área.
- **Desenvolvedor**: roda partidas simuladas em teste automatizado e reproduz sessões gravadas.

Termos:

- **Sessão**: uma partida em andamento, com 1 a 4 jogadores.
- **Tick**: um passo fixo da simulação; 20 por segundo.
- **Entidade**: qualquer coisa simulada no mundo (jogador, Pokémon, projétil, selvagem, futuramente NPC).
- **Área**: a região do mundo (mapa) onde uma entidade está.
- **Snapshot / delta**: estado completo das entidades relevantes / só o que mudou desde o último estado confirmado pelo cliente.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Partida simulada com clientes falsos (Priority: P1)

Como desenvolvedor, quero subir uma sessão e conectar até 4 clientes falsos que enviam inputs, num
teste automatizado sem abrir o app, e verificar o estado resultante.

**Why this priority**: é a base de tudo. Sem sessão, tick, entidades e protocolo funcionando em
teste, nenhuma outra história pode ser verificada.

**Independent Test**: um teste cria a sessão, conecta 4 clientes, envia inputs de movimento por N
ticks e confere posições e tempos de tick.

**Acceptance Scenarios**:

1. **Given** uma sessão criada, **When** 4 clientes completam o handshake, **Then** cada um recebe um identificador de jogador e o estado inicial da sua área.
2. **Given** uma sessão com 4 jogadores, **When** um quinto cliente tenta entrar, **Then** a entrada é recusada com motivo "sessão cheia".
3. **Given** um jogador na sessão, **When** ele sai ou a conexão cai, **Then** a entidade dele é removida e os outros clientes da área são informados.
4. **Given** uma sessão em andamento, **When** ela é encerrada, **Then** todos os clientes recebem aviso de encerramento e o loop de tick para.
5. **Given** um cliente com versão de protocolo diferente, **When** ele faz o handshake, **Then** a conexão é recusada com mensagem que informa as duas versões.
6. **Given** um cliente que envia mensagem malformada, **When** ela chega, **Then** é descartada e registrada, e o servidor e os outros clientes seguem normalmente.

---

### User Story 2 - Resposta imediata ao controle (Priority: P1)

Como jogador, quero que meu personagem responda aos controles na hora, mesmo com o servidor
confirmando tudo.

**Why this priority**: sem isso o jogo parece travado em qualquer latência.

**Independent Test**: um cliente simulado com latência artificial aplica um input e confere que a
posição prevista muda no quadro seguinte; depois força uma divergência e confere a correção suave.

**Acceptance Scenarios**:

1. **Given** latência de 100 ms, **When** o jogador aperta uma direção, **Then** o próprio personagem se move no quadro seguinte, sem esperar a resposta.
2. **Given** o servidor confirma um estado igual ao previsto, **When** a confirmação chega, **Then** não há nenhuma correção visível.
3. **Given** o servidor discorda da previsão (ex.: colisão que o cliente não previu), **When** a confirmação chega, **Then** o cliente reaplica os inputs ainda não confirmados sobre o estado do servidor e converge suavemente, sem teleporte, salvo divergência grande.

---

### User Story 3 - Outros jogadores se movendo suavemente (Priority: P2)

Como jogador, quero ver os outros jogadores se movendo de forma suave, sem saltos.

**Why this priority**: necessário para multiplayer agradável, mas o jogo funciona sozinho sem isso.

**Independent Test**: um cliente recebe estados a 20 Hz com jitter simulado e o teste confere que a
posição exibida de uma entidade remota varia continuamente entre estados.

**Acceptance Scenarios**:

1. **Given** dois jogadores na mesma área, **When** um se move, **Then** o outro o vê interpolado entre estados recebidos, sem saltos.
2. **Given** jogadores em áreas diferentes, **When** um se move, **Then** o outro não recebe dados dessa entidade.
3. **Given** um jogador entra na área de outro, **When** isso acontece, **Then** o cliente recebe a entidade completa; ao sair, recebe a remoção.

---

### User Story 4 - Gravar e reproduzir sessões (Priority: P3)

Como desenvolvedor, quero gravar os inputs de uma sessão e reproduzi-la depois para investigar bugs.

**Why this priority**: ferramenta de depuração; valiosa, mas não bloqueia jogar.

**Independent Test**: um teste grava uma sessão com 4 clientes, reproduz a gravação sem clientes e
compara o estado final.

**Acceptance Scenarios**:

1. **Given** uma sessão gravada (semente, entradas, saídas e inputs por tick), **When** é reproduzida, **Then** o estado final é idêntico ao original.
2. **Given** uma gravação de versão de protocolo diferente, **When** se tenta reproduzi-la, **Then** a reprodução é recusada com mensagem clara.

---

### Edge Cases

- Inputs fora de ordem, duplicados ou com número já processado: duplicados e antigos são ignorados; os fora de ordem são processados por número.
- Cliente envia inputs em excesso (mais de um por tick, sustentado): o excedente é descartado e registrado, sem afetar outros jogadores.
- Cliente para de responder sem fechar a conexão: após o tempo limite, é tratado como saída.
- Tick atrasa (máquina lenta): o servidor não acumula ticks atrasados indefinidamente e registra o atraso no painel de depuração.
- Último jogador sai: a sessão é encerrada.
- O host sai: a sessão é encerrada para todos.
- Divergência muito grande entre previsão e servidor: o cliente aplica o estado do servidor de imediato em vez de suavizar.
- Mensagem bem formada mas inesperada no estado atual (ex.: input antes do handshake): descartada e registrada.

## Requirements *(mandatory)*

### Functional Requirements

**Sessão**

- **FR-001**: O sistema MUST permitir criar uma sessão, aceitar entrada e saída de jogadores e encerrá-la.
- **FR-002**: Uma sessão MUST ter de 1 a 4 jogadores; entradas além de 4 MUST ser recusadas com motivo.
- **FR-003**: Ao encerrar, o sistema MUST avisar todos os clientes e parar a simulação.
- **FR-004**: Clientes inativos além do tempo limite MUST ser tratados como saída.

**Tick**

- **FR-005**: A simulação MUST avançar em tick fixo de 20 Hz, independente da taxa de quadros dos clientes.
- **FR-006**: O tempo de cada tick MUST ser medido e exposto num painel de depuração (último, média e pior recente).
- **FR-007**: A simulação MUST rodar sem render, rede real ou Electron, permitindo testes em processo.

**Entidades**

- **FR-008**: O modelo de entidades MUST representar jogadores, Pokémon, projéteis e selvagens, e MUST aceitar novos tipos (ex.: NPCs) sem mudar o formato de transporte do estado.
- **FR-009**: Toda entidade MUST ter identificador estável na sessão, tipo, área e posição.

**Protocolo e sincronização**

- **FR-010**: O handshake MUST conferir a versão do protocolo; versões diferentes MUST ser recusadas com mensagem que informa a versão esperada e a recebida.
- **FR-011**: Clientes MUST enviar inputs numerados em sequência; o servidor MUST processar cada número no máximo uma vez.
- **FR-012**: O servidor MUST enviar o estado após cada tick, informando o último input processado daquele cliente.
- **FR-013**: O estado MUST ser incremental (só o que mudou) quando o cliente tem um estado base confirmado, e completo caso contrário.
- **FR-014**: O servidor MUST enviar a cada cliente apenas entidades relevantes para ele. O filtro MUST ser um ponto único, por ora considerando só a área, e preparado para incluir as flags do jogador (princípio VII).
- **FR-015**: Todas as mensagens MUST ser definidas no pacote compartilhado e validadas ao chegar, nos dois sentidos.
- **FR-016**: Mensagens malformadas ou inesperadas MUST ser descartadas e registradas, sem derrubar o servidor nem afetar outros clientes.

**Cliente**

- **FR-017**: O cliente MUST prever o movimento do próprio personagem a partir dos inputs locais, exibindo-o no quadro seguinte ao input.
- **FR-018**: Ao receber estado do servidor, o cliente MUST reconciliar: partir do estado confirmado, reaplicar os inputs não confirmados e corrigir suavemente a diferença visível; acima de um limite, aplicar de imediato.
- **FR-019**: O cliente MUST interpolar entidades remotas entre estados recebidos.
- **FR-020**: Previsão, reconciliação e interpolação MUST ser testáveis sem render.

**Determinismo e reprodução**

- **FR-021**: Toda aleatoriedade da simulação MUST vir de um gerador com semente definida na criação da sessão.
- **FR-022**: O sistema MUST gravar uma sessão (versão do protocolo, semente, entradas, saídas e inputs por tick) e reproduzi-la sem clientes, chegando ao mesmo estado.

### Key Entities

- **Sessão**: semente, jogadores (1–4), tick atual, estado (aberta, encerrada).
- **Jogador**: identificador, conexão, entidade controlada, último input processado, área atual.
- **Entidade**: identificador, tipo, área, posição, direção e dados do tipo.
- **Input**: número de sequência, jogador, conteúdo (direção, ações).
- **Mensagem**: tipo e conteúdo validado; o handshake carrega a versão do protocolo.
- **Gravação**: versão, semente e eventos por tick (entradas, saídas, inputs).
- **Métricas de tick**: duração do último tick, média e pior numa janela recente.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Com 4 clientes simulados se movendo continuamente, cada tick leva menos de 10 ms num PC modesto (pior caso em 1 minuto de sessão).
- **SC-002**: Em teste, uma sessão gravada e reproduzida chega a estado final idêntico ao original em 100% das execuções.
- **SC-003**: O movimento do próprio jogador aparece no quadro seguinte ao input, sem esperar o servidor, com qualquer latência simulada.
- **SC-004**: Um cliente de versão diferente é recusado em 100% das tentativas, com a mensagem de versão.
- **SC-005**: Com 1.000 mensagens malformadas enviadas durante uma sessão, o servidor segue rodando e os outros clientes não percebem diferença.
- **SC-006**: Entidades remotas se movem sem saltos visíveis com até 100 ms de latência e jitter moderado.
- **SC-007**: Nenhum cliente recebe dados de entidades de outra área.

## Assumptions

- Descoberta na LAN, menus de hospedar e entrar e saves ficam na feature 12; render na 11; combate na 13.
- Aqui o movimento é o único comportamento simulado de fato, sobre a colisão dos mapas da feature 006.
- "PC modesto" = notebook de entrada de cerca de 5 anos.
- O host é um dos jogadores; se ele sai, a sessão encerra.
- Tempo limite de inatividade padrão: 10 segundos.
- A versão do protocolo usa a constante já existente no pacote compartilhado.
- Testes usam tempo simulado (ticks avançados manualmente) para serem determinísticos.
