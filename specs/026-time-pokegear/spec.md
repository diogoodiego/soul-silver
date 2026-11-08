# Feature Specification: Tempo e Pokégear

**Feature Branch**: `026-time-pokegear`

**Created**: 2026-11-07

**Status**: Draft

**Input**: User description: "Tempo e Pokégear: o ciclo de dia e noite com efeito visual nos mapas, os eventos por horário e dia da semana, e o Pokégear com mapa, telefone, rádio e relógio."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver o dia passar no mapa (Priority: P1)

O jogador anda por New Bark Town. De manhã o mapa tem um tom claro e quente, de dia aparece com as cores normais, e à noite escurece. A mudança entre as faixas é gradual, sem salto. Ao entrar numa casa à noite, o interior aparece com as cores normais. Todos os jogadores da sessão veem a mesma hora, que vem do relógio do PC do host.

**Why this priority**: É a base do resto. A faixa do dia já escolhe as tabelas de spawn, e os eventos e as ligações dependem do mesmo relógio.

**Independent Test**: Fixar o relógio da sessão em manhã, dia e noite por comando de desenvolvimento e comparar a tonalidade do mesmo ponto externo e de um interior.

**Acceptance Scenarios**:

1. **Given** o relógio da sessão em cada hora de 0 a 23, **When** a faixa é consultada, **Then** ela é manhã, dia ou noite conforme as faixas originais.
2. **Given** um mapa externo, **When** o relógio cruza o limite entre duas faixas, **Then** a tonalidade muda aos poucos, sem salto visível.
3. **Given** um mapa interior à noite, **When** o jogador entra, **Then** não há tonalidade.
4. **Given** dois jogadores na mesma sessão, **When** o relógio passa de dia para noite, **Then** os dois passam para a faixa da noite e as tabelas de spawn da noite valem para os dois.
5. **Given** um comando de desenvolvimento que fixa ou avança o relógio, **When** é usado, **Then** a hora muda para toda a sessão; em build de produção o comando não existe.

---

### User Story 2 - Eventos por dia da semana e horário (Priority: P1)

Alguns NPCs só aparecem em certos dias da semana ou horários, como nos scripts originais. O jogador encontra o NPC no dia certo e não o encontra nos outros dias.

**Why this priority**: É conteúdo do caminho até Violet City e precisa estar certo para o caminho dourado.

**Independent Test**: Para cada evento por dia da semana até Violet City encontrado nos dados, fixar o dia certo e um dia errado e conferir que o NPC aparece só no certo.

**Acceptance Scenarios**:

1. **Given** um evento marcado para um dia da semana, **When** o relógio está nesse dia, **Then** o NPC aparece e o script roda.
2. **Given** o mesmo evento, **When** o relógio está em qualquer dos outros 6 dias, **Then** o NPC não aparece.
3. **Given** um evento por horário, **When** o relógio está fora do horário, **Then** o evento não acontece.

---

### User Story 3 - Usar o Pokégear (Priority: P2)

O jogador abre o Pokégear e navega entre quatro abas. No mapa vê a região, a própria posição, os lugares já visitados e a posição dos outros jogadores da sessão. No telefone vê os contatos registrados e liga para eles, ouvindo os textos originais. No rádio sintoniza canais e lê os textos originais; alguns canais mudam a densidade de spawns enquanto estão ligados. No relógio vê a hora e o dia da semana.

**Why this priority**: É a ferramenta central do jogador, mas o mundo funciona sem ela.

**Independent Test**: Abrir cada aba e conferir o conteúdo contra os dados extraídos e o estado do jogador.

**Acceptance Scenarios**:

1. **Given** o jogador abre a aba de mapa, **When** ela aparece, **Then** mostra a posição dele, os lugares visitados e a posição dos outros jogadores da sessão.
2. **Given** contatos registrados, **When** o jogador liga para um, **Then** ouve o texto original daquele contato para a hora e a situação.
3. **Given** um canal de rádio, **When** o jogador o sintoniza, **Then** lê os textos originais do canal, legíveis e na ordem.
4. **Given** um canal com efeito no jogo ligado, **When** o jogador está num mapa com spawns, **Then** a densidade de spawns muda conforme o canal, e volta ao normal ao desligar.
5. **Given** a aba de relógio, **When** aparece, **Then** mostra a hora e o dia da semana da sessão.

---

### User Story 4 - Receber ligações e aceitar revanches (Priority: P2)

Depois de registrar o número de um treinador, o jogador recebe ligações dele com os textos originais, incluindo pedidos de revanche e avisos de enxame. Aceitar uma revanche faz o treinador desafiar de novo com o time de revanche extraído. Ligações que chegam durante combate, cutscene ou menu esperam o jogador ficar livre. A ligação do Prof. Elm depois do Mr. Pokémon passa a chegar pelo telefone.

**Why this priority**: Fecha o ciclo do telefone e é o que a extensão do caminho dourado verifica com o Joey.

**Independent Test**: Registrar o Joey, avançar o relógio, receber a ligação de revanche e vencer o time de revanche.

**Acceptance Scenarios**:

1. **Given** o Joey registrado depois da batalha na Route 30, **When** o relógio avança até a ligação de revanche, **Then** o jogador recebe a ligação com o texto extraído.
2. **Given** uma revanche aceita, **When** o jogador volta ao treinador, **Then** ele desafia com o time de revanche extraído.
3. **Given** os jogadores A e B, **When** A aceita a revanche do Joey, **Then** a revanche vale só para A.
4. **Given** uma ligação que chega durante combate, **When** o combate termina, **Then** a ligação é entregue; o mesmo vale para cutscene e menu.
5. **Given** o jogador sai da casa do Mr. Pokémon, **When** o script do Prof. Elm dispara, **Then** a ligação chega pela tela de chamada do telefone, não por caixa de texto.
6. **Given** um aviso de enxame, **When** a ligação chega, **Then** o texto original do aviso aparece; o enxame em si fica fora do escopo.

---

### Edge Cases

- Relógio do host muda durante a sessão (fuso, horário de verão, ajuste manual): a faixa acompanha a nova hora, sem quebrar eventos em curso.
- Virada da meia-noite e do domingo para segunda durante a sessão.
- Duas ligações chegam enquanto o jogador está ocupado: são entregues uma de cada vez, na ordem.
- Jogador desconecta com ligação pendente: a ligação não se perde do progresso dele ou é descartada conforme o original (ligações aleatórias podem ser descartadas; as de história não).
- Jogador entra num interior no meio de uma transição de tonalidade.
- Comando de relógio enviado por um cliente que não é o host, ou em build de produção: recusado.
- Contato sem texto para a situação atual: cai no texto genérico original do contato.
- Rádio ligado ao trocar de mapa ou fechar o Pokégear.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O horário da sessão MUST vir do relógio do PC do host e MUST ser o mesmo para todos os jogadores da sessão.
- **FR-002**: As faixas manhã, dia e noite MUST seguir os limites originais vindos dos dados, não valores fixos espalhados.
- **FR-003**: O relógio MUST ser injetável no servidor, para testes e para comandos de desenvolvimento.
- **FR-004**: Mapas externos MUST receber tonalidade por faixa do dia, com transição gradual e contínua entre as faixas; interiores e cavernas MUST não mudar.
- **FR-005**: A troca de faixa MUST trocar as tabelas de spawn em uso para todos os jogadores da sessão.
- **FR-006**: Eventos por dia da semana e por horário MUST seguir os scripts e dados originais.
- **FR-007**: O Pokégear MUST ter as abas mapa, telefone, rádio e relógio.
- **FR-008**: A aba de mapa MUST mostrar a posição do jogador, os lugares visitados por ele e a posição dos outros jogadores da sessão.
- **FR-009**: A aba de telefone MUST listar os contatos registrados pelo jogador e permitir ligar para eles, com os scripts e textos originais.
- **FR-010**: O sistema MUST entregar ligações recebidas com os scripts e textos originais, incluindo pedidos de revanche e avisos de enxame.
- **FR-011**: Ligações que chegam durante combate, cutscene ou menu MUST esperar até o jogador ficar livre, e MUST ser entregues em ordem.
- **FR-012**: Aceitar uma revanche MUST reativar o treinador com o time de revanche extraído; a flag de revanche MUST ser por jogador (princípio VII).
- **FR-013**: A ligação do Prof. Elm depois do Mr. Pokémon MUST chegar pelo telefone, substituindo o atalho de caixa de texto.
- **FR-014**: A aba de rádio MUST oferecer os canais com os textos originais; canais com efeito no jogo MUST alterar a densidade de spawns enquanto ligados, já que não há encontros aleatórios.
- **FR-015**: A aba de relógio MUST mostrar a hora e o dia da semana da sessão.
- **FR-016**: Em build de desenvolvimento, o sistema MUST oferecer um comando para fixar ou avançar o relógio da sessão; em build de produção o comando MUST estar indisponível.
- **FR-017**: O servidor MUST validar ligações feitas e aceites de revanche; pedidos para contatos não registrados MUST ser recusados.
- **FR-018**: Contatos registrados, revanches e ligações pendentes de história MUST ser salvos no progresso do jogador.
- **FR-019**: Os novos tipos de mensagem e dados MUST ser versionados (princípio VI), com a versão do protocolo incrementada.

### Fora do escopo

- Os sons de Hoenn e Sinnoh do rádio.
- Enxames além do aviso por telefone (o spawn do enxame em si).
- Pokéwalker.

### Key Entities *(include if feature involves data)*

- **Relógio da sessão**: hora e dia da semana compartilhados pela sessão; vem do host ou de um valor fixado em desenvolvimento.
- **Faixa do dia**: manhã, dia ou noite, com limites originais.
- **Tonalidade**: cor aplicada a mapas externos como função contínua da hora.
- **Evento temporal**: NPC ou script condicionado a dia da semana ou horário.
- **Contato**: treinador ou personagem registrado pelo jogador, com seus textos de ligação.
- **Ligação**: recebida ou feita, com remetente, script e texto; pode ficar pendente enquanto o jogador está ocupado.
- **Revanche**: estado por jogador de um treinador, com o time de revanche extraído.
- **Canal de rádio**: frequência, textos originais e efeito opcional na densidade de spawns.
- **Lugar visitado**: área já visitada pelo jogador, mostrada no mapa.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: As 24 horas dão a faixa original correta (24 de 24), e a tonalidade não tem salto em nenhuma transição.
- **SC-002**: Cada evento por dia da semana até Violet City aparece no dia certo e em 0 dos dias errados testados.
- **SC-003**: 100% das ligações que chegam durante combate, cutscene ou menu são entregues só depois que o jogador fica livre.
- **SC-004**: A revanche aceita por um jogador não altera o treinador para nenhum outro jogador (0 vazamentos nos cenários multijogador).
- **SC-005**: Todos os casos das camadas 1 e 2 passam na integração contínua.
- **SC-006**: A extensão do caminho dourado passa com a revanche do Joey, a ligação do Prof. Elm pelo telefone e os eventos por dia da semana do trecho.
- **SC-007**: As 9 capturas da camada 4 mostram o comportamento esperado.
- **SC-008**: Um canal de rádio lido no teste manual tem textos legíveis e na ordem original.

## Como testar *(mandatory)*

| Camada | Casos de teste | Comando |
|--------|----------------|---------|
| 1. Unidade (vitest com fixtures sintéticos; CI) | Faixa do dia para cada hora de 0 a 23; tonalidade como função da hora, contínua nas transições; condições de eventos por dia da semana para os 7 dias; efeito de cada canal do rádio na densidade de spawns | `npx vitest run` |
| 2. Servidor sem interface (`packages/server/test/harness.ts`, 2 a 4 jogadores, relógio injetado; CI) | Relógio de dia para noite muda faixa e tabelas de spawn para todos os jogadores. Ligação durante combate entregue só depois do fim; idem cutscene e menu. Revanche aceita: treinador desafia com o time de revanche, flag por jogador | `npx vitest run` |
| 3. ROM real (só local, nunca na CI) | Extensão do caminho dourado: depois do marco do Joey na Route 30 (página 4 do detonado), registra o número, avança o relógio, recebe a ligação de revanche com o texto extraído e vence o time de revanche extraído. Ligação do Prof. Elm depois do Mr. Pokémon chega pelo telefone novo, não por atalho. Para cada evento por dia da semana até Violet City nos dados, fixa o dia certo e um errado e confere que o NPC aparece só no certo | `npm run golden` |
| 4. App (driver da skill `run-soulsilver`) | Capturas: 01 a 03 mesmo ponto de New Bark de manhã, de dia e de noite; 04 interior à noite, sem tonalidade; 05 a 08 abas mapa, telefone, rádio e relógio do Pokégear; 09 ligação recebida | `node .claude/skills/run-soulsilver/driver.mjs [passos]` |
| 5. Manual | Ler um canal de rádio e confirmar que os textos são legíveis e na ordem | Não há |

**Conclusão**: as camadas 1 e 2 passam na integração contínua; a camada 3 passa localmente, com o
relatório anexado ao `tasks.md`; as 9 capturas da camada 4 estão salvas em `.evidence/026/`, pasta
fora do git.

## Assumptions

- As faixas do dia já existem nas regras de spawn (spec 015) e são a fonte única; a tonalidade e os eventos usam as mesmas.
- O interpretador de scripts (spec 020) já lê o dia da semana do host; este spec liga isso ao relógio injetável da sessão e troca os atalhos de telefone (sem número registrado, ligação do Elm em caixa de texto) pelo telefone real.
- Os textos de ligação, a tabela de contatos, os times de revanche e os textos do rádio estão nos dados da ROM; o que faltar é incluído na extração.
- "Ocupado" é combate, cutscene ou menu aberto; o próprio Pokégear aberto conta como menu, exceto a tela de chamada.
- A tonalidade usa a área do mapa já extraída (externo, interior, caverna) para decidir onde se aplica.
- As faixas de horário seguem o original: manhã das 4h às 10h, dia das 10h às 20h, noite das 20h às 4h.
- Lugares visitados e contatos registrados são progresso por jogador (princípio VII) e vão para o save do jogador (princípio VIII).
- Os comandos de desenvolvimento seguem o mesmo mecanismo dos specs anteriores e ficam fora da build de produção.
