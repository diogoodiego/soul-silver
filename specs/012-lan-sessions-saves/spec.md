# Feature Specification: LAN, sessões e saves

**Feature Branch**: `012-lan-sessions-saves`

**Created**: 2026-10-24

**Status**: Draft

**Input**: User description: "LAN, sessões e saves: o fluxo completo de começar a jogar. Inclui novo jogo e continuar, hospedar, encontrar e entrar em partidas na LAN, jogar sozinho, e salvar e carregar o progresso de cada jogador."

## Contexto

O jogo existe para ser jogado com amigos na mesma rede, sem digitar IP. Esta feature liga o menu
inicial ao servidor autoritativo (feature 010) e ao mundo jogável (feature 011): escolher ou criar
um save, abrir ou encontrar uma partida e entrar nela. Pelo princípio VIII, o save pertence ao
jogador e fica no PC dele, mas é validado pelo host durante a partida.

Atores:

- **Jogador**: qualquer pessoa usando o app; escolhe ou cria o save.
- **Host**: jogador que abre a partida; o PC dele roda o servidor autoritativo.
- **Convidado**: jogador que entra na partida de outro host.

Termos:

- **Save**: o progresso de um jogador (nome, personagem, posição, e o estado de jogo que existir),
  guardado no PC dele, com `schemaVersion`.
- **Slot**: uma das 3 posições de save no menu Continuar.
- **Backup**: a cópia do save imediatamente anterior à última gravação bem-sucedida.
- **Partida anunciada**: sessão hospedada que aparece na lista de descoberta da LAN.
- **Sessão solo**: sessão local, com o mesmo servidor, que não é anunciada nem aceita conexões de
  outros PCs.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Novo jogo e continuar (Priority: P1)

O jogador abre o app e vê o menu inicial: Novo jogo, Continuar, Hospedar, Entrar e Jogar sozinho.
Em Novo jogo, escolhe um slot, digita o nome e escolhe o personagem; o save é criado. Em
Continuar, vê os até 3 saves existentes (nome, personagem, local, tempo de jogo, data) e escolhe um.

**Why this priority**: sem save não há como entrar em nenhuma sessão; é a base de todo o resto.

**Independent Test**: criar um save, fechar o app, reabrir e vê-lo em Continuar com os mesmos dados.

**Acceptance Scenarios**:

1. **Given** nenhum save, **When** o jogador cria um novo jogo com nome "Gold" e o personagem
   masculino, **Then** o slot escolhido passa a mostrar "Gold" em Continuar.
2. **Given** os 3 slots ocupados, **When** o jogador escolhe Novo jogo, **Then** o app pede qual
   slot sobrescrever e exige confirmação antes de apagar o save existente.
3. **Given** um nome vazio ou acima do limite de caracteres, **When** o jogador confirma, **Then**
   o app recusa e diz o motivo.
4. **Given** nenhum save selecionado, **When** o jogador escolhe Hospedar, Entrar ou Jogar sozinho,
   **Then** o app pede primeiro que ele escolha ou crie um save.

---

### User Story 2 - Jogar sozinho (Priority: P1)

O jogador escolhe Jogar sozinho e entra direto no mundo com o save escolhido, numa sessão local que
usa o mesmo servidor do multiplayer e que ninguém na rede vê.

**Why this priority**: é o caminho mais curto até jogar e exercita o fluxo de save sem rede.

**Independent Test**: iniciar uma sessão solo num PC e confirmar que outro PC na mesma rede não a
vê na lista nem consegue conectar a ela por IP.

**Acceptance Scenarios**:

1. **Given** um save escolhido, **When** o jogador escolhe Jogar sozinho, **Then** entra no mundo na
   posição salva.
2. **Given** uma sessão solo ativa, **When** outro PC da rede abre Entrar ou tenta o IP do PC,
   **Then** a sessão não aparece e a conexão é recusada.

---

### User Story 3 - Progresso salvo e protegido (Priority: P1)

O progresso é salvo sem que o jogador precise lembrar: o host envia o estado atualizado
periodicamente e em eventos importantes, e o PC do jogador grava de forma atômica, mantendo o
backup anterior. Se o save atual estiver corrompido, o app oferece restaurar o backup.

**Why this priority**: perder progresso é a pior falha possível para o jogador.

**Independent Test**: jogar, encerrar o processo à força durante a gravação, e confirmar que o save
abre (atual ou backup); corromper o arquivo à mão e confirmar que o app detecta e restaura o backup.

**Acceptance Scenarios**:

1. **Given** um jogador em sessão, **When** passa o intervalo de salvamento ou ocorre um evento
   importante (ex.: troca de mapa por warp, saída da sessão), **Then** o save no PC dele é
   atualizado.
2. **Given** o app é encerrado no meio de uma gravação, **When** o jogador reabre, **Then** o save
   está íntegro na versão anterior ou na nova, nunca parcial.
3. **Given** o save atual corrompido e um backup íntegro, **When** o jogador abre Continuar,
   **Then** o slot aparece marcado como corrompido e o app oferece restaurar o backup; ao aceitar, o
   jogo continua a partir do backup.
4. **Given** save e backup ambos corrompidos, **When** o jogador abre Continuar, **Then** o slot
   aparece como irrecuperável, sem travar o app, e o arquivo não é apagado automaticamente.
5. **Given** um save de `schemaVersion` antiga, **When** é carregado, **Then** é migrado para a
   versão atual antes de usar; um save de versão mais nova que o app é recusado com o motivo.

---

### User Story 4 - Hospedar e ser encontrado na LAN (Priority: P2)

O host escolhe Hospedar e a partida abre com um clique. Os amigos na mesma rede veem a partida
aparecer na lista em poucos segundos, com nome do host, número de jogadores e versão. Na primeira
vez que hospeda, o app explica o aviso de firewall do Windows antes de ele aparecer.

**Why this priority**: é o motivo do jogo existir, mas depende de save (US1) e do fluxo de sessão.

**Independent Test**: hospedar num PC e ver a partida em Entrar noutros PCs da mesma rede em até 5
segundos.

**Acceptance Scenarios**:

1. **Given** um save escolhido, **When** o jogador clica em Hospedar pela primeira vez, **Then** vê
   uma explicação do aviso de firewall e só depois a partida é aberta.
2. **Given** uma partida hospedada, **When** outro PC da rede abre Entrar, **Then** a partida
   aparece em até 5 segundos com nome do host, jogadores atuais/máximo e versão.
3. **Given** uma partida de versão diferente, **When** aparece na lista, **Then** aparece
   desabilitada com o motivo (ex.: "versão 0.4.0, a sua é 0.5.0").
4. **Given** uma partida cheia (4 jogadores), **When** aparece na lista, **Then** aparece
   desabilitada com o motivo "cheia".
5. **Given** o host fecha a partida, **When** passam alguns segundos, **Then** ela some da lista dos
   outros PCs.

---

### User Story 5 - Entrar numa partida, com validação do save (Priority: P2)

O convidado escolhe uma partida da lista ou digita um IP (quando a descoberta não funciona, como em
VPN de LAN virtual). Ao entrar, o save dele é enviado ao host, que o valida (forma e coerência)
antes de aceitar. Um save inválido é recusado com o motivo.

**Why this priority**: completa o multiplayer e aplica o modelo de confiança.

**Independent Test**: entrar por lista e por IP; editar um save à mão com nível 500 e confirmar a
recusa com motivo.

**Acceptance Scenarios**:

1. **Given** uma partida na lista, **When** o convidado a escolhe, **Then** entra no mundo do host
   com o próprio save.
2. **Given** a descoberta não funciona, **When** o convidado digita o IP do host, **Then** conecta
   como se tivesse escolhido da lista.
3. **Given** um save com valores impossíveis (ex.: nível 500) ou forma inválida, **When** o
   convidado tenta entrar, **Then** o host recusa e o convidado vê o motivo.
4. **Given** já existe um jogador "Gold" na sessão, **When** outro jogador chamado "Gold" tenta
   entrar, **Then** é recusado com o motivo "nome já em uso nesta sessão".
5. **Given** um IP inválido ou sem partida, **When** o convidado tenta conectar, **Then** vê um erro
   claro em poucos segundos, sem travar o menu.

---

### User Story 6 - Queda e fim da sessão sem perder progresso (Priority: P2)

Um convidado que cai consegue voltar sem perder progresso. Se o host fecha, todos recebem o último
estado salvo antes de a sessão acabar.

**Why this priority**: redes domésticas caem; sem isso a sessão multiplayer não é confiável.

**Independent Test**: desligar a rede de um convidado, religar e reconectar, e conferir que a
posição e o progresso são os de antes da queda; fechar o host e conferir que todos os saves foram
atualizados.

**Acceptance Scenarios**:

1. **Given** um convidado em sessão, **When** a rede dele cai e volta, **Then** ele pode reconectar
   à mesma partida e continua com o progresso que tinha no momento da queda.
2. **Given** a sessão ativa, **When** o host a encerra pelo menu ou fecha o app normalmente,
   **Then** cada convidado recebe e grava o estado final antes de ser desconectado, e volta ao menu
   com aviso.
3. **Given** o host cai sem aviso (crash), **When** o convidado perde a conexão, **Then** mantém o
   último save gravado e volta ao menu com aviso.

---

### User Story 7 - Exportar e importar save (Priority: P3)

O jogador exporta um save para um arquivo escolhido e importa um arquivo de save para um slot.

**Why this priority**: útil para backup manual e para levar o save a outro PC, mas não bloqueia jogar.

**Independent Test**: exportar num PC, importar noutro e continuar o jogo.

**Acceptance Scenarios**:

1. **Given** um save num slot, **When** o jogador exporta, **Then** um arquivo é gravado no local
   escolhido.
2. **Given** um arquivo de save válido, **When** o jogador importa para um slot, **Then** o slot
   passa a mostrar esse save (com confirmação se for sobrescrever).
3. **Given** um arquivo inválido ou corrompido, **When** o jogador importa, **Then** o app recusa
   com o motivo e não altera o slot.

---

### Edge Cases

- Dois hosts na mesma rede com o mesmo nome: ambos aparecem, distinguíveis (ex.: pelo endereço).
- Vários adaptadores de rede (Wi-Fi, cabo, VPN virtual): a descoberta funciona no adaptador da LAN;
  a conexão por IP cobre os demais.
- Firewall recusado pelo usuário: o host continua jogando, e o app explica que outros PCs talvez
  não consigam entrar e como liberar depois.
- Porta de rede já em uso no host: o app avisa com mensagem clara em vez de falhar em silêncio.
- O mesmo save entrando duas vezes na mesma sessão (dois PCs com cópia importada): o segundo é
  recusado pela regra de nome único.
- Convidado reconecta depois que o host já fechou a sessão: vê "partida não encontrada" e mantém o
  último save gravado.
- Disco cheio ou sem permissão ao gravar: o save atual e o backup ficam intactos e o jogador é
  avisado.
- Save importado de versão mais nova que o app: recusado com o motivo.
- Host como jogador: o save do host segue as mesmas regras de gravação dos convidados.

## Requirements *(mandatory)*

### Functional Requirements

**Menu e saves**

- **FR-001**: O menu inicial MUST oferecer Novo jogo, Continuar, Hospedar, Entrar e Jogar sozinho.
- **FR-002**: O app MUST manter até 3 slots de save, cada um mostrando nome, personagem, local
  atual, tempo de jogo e data da última gravação.
- **FR-003**: Novo jogo MUST pedir nome (não vazio, até o limite de caracteres de nome do jogo) e
  personagem (masculino ou feminino), e MUST exigir confirmação para sobrescrever um slot ocupado.
- **FR-004**: Hospedar, Entrar e Jogar sozinho MUST exigir um save escolhido.
- **FR-005**: O save MUST ter `schemaVersion`; ao carregar, saves antigos MUST ser migrados
  passo a passo até a versão atual, e saves de versão mais nova que o app MUST ser recusados com o
  motivo. O mecanismo de migração MUST existir e ser testado mesmo sem nenhuma migração real.

**Gravação e recuperação**

- **FR-006**: O host MUST enviar a cada jogador o estado atualizado dele periodicamente (no máximo a
  cada 60 segundos de jogo) e em eventos importantes (warp/troca de mapa, entrada e saída da sessão).
- **FR-007**: O cliente MUST gravar o save de forma atômica (uma gravação interrompida nunca deixa
  um save parcial) e MUST manter o save anterior como backup.
- **FR-008**: Ao listar ou carregar um save, o app MUST detectar corrupção (arquivo ilegível ou
  inválido no schema) e, havendo backup íntegro, MUST oferecer restaurá-lo.
- **FR-009**: O app MUST NOT apagar automaticamente um save ou backup corrompido.
- **FR-010**: Falha ao gravar (disco cheio, sem permissão) MUST deixar save e backup intactos e
  avisar o jogador.
- **FR-011**: O jogador MUST poder exportar um save para um arquivo e importar um arquivo para um
  slot; a importação MUST validar o arquivo (incluindo migração) antes de alterar o slot.

**Sessões**

- **FR-012**: Jogar sozinho MUST criar uma sessão local com o mesmo servidor do multiplayer, que
  MUST NOT ser anunciada e MUST NOT aceitar conexões de outros PCs.
- **FR-013**: Hospedar MUST abrir uma partida anunciada com um clique, para até 4 jogadores
  (incluindo o host).
- **FR-014**: Na primeira vez que o jogador hospeda, o app MUST explicar o aviso de firewall do
  Windows antes de ele aparecer; nas vezes seguintes, não.
- **FR-015**: A partida anunciada MUST informar nome do host, jogadores atuais e máximo e versão
  do jogo; deve aparecer na lista dos outros PCs da LAN em até 5 segundos e sumir em poucos segundos
  depois de fechada.
- **FR-016**: Partidas de versão incompatível ou cheias MUST aparecer desabilitadas na lista, com
  o motivo.
- **FR-017**: Entrar MUST permitir conexão manual por IP (com porta opcional), com erro claro se não
  houver partida no endereço.
- **FR-018**: Ao entrar, o cliente MUST enviar o save ao host, que MUST validar forma e coerência
  (ex.: níveis, quantidades e identificadores dentro dos limites do jogo) antes de aceitar; save
  inválido MUST ser recusado com motivo legível para o convidado.
- **FR-019**: Nomes de jogador MUST ser únicos na sessão (sem diferenciar maiúsculas e minúsculas);
  um nome repetido MUST ser recusado com o motivo.
- **FR-020**: Um convidado que perde a conexão MUST poder reconectar à mesma partida e continuar
  com o progresso que o host tinha dele no momento da queda; o lugar dele fica reservado por pelo
  menos 2 minutos.
- **FR-021**: Ao encerrar a sessão normalmente, o host MUST enviar a cada jogador o estado final e
  aguardar a confirmação de gravação (com limite de tempo) antes de desconectar.
- **FR-022**: Ao perder o host, o convidado MUST voltar ao menu com aviso, mantendo o último save
  gravado.

### Key Entities

- **Save**: `schemaVersion`, nome do jogador, personagem, mapa e posição, tempo de jogo, data da
  última gravação, e o estado de progresso que as features seguintes acrescentarem (flags, equipe,
  itens).
- **Slot**: posição 1–3 com o save atual e o backup.
- **Anúncio de partida**: nome do host, jogadores atuais/máximo, versão do jogo, endereço.
- **Sessão**: tipo (solo ou anunciada), host, jogadores conectados com seus nomes, lugares
  reservados de quem caiu.
- **Recusa**: motivo legível de por que um save, nome, versão ou entrada foi recusado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Quatro PCs na mesma rede veem a partida do host em até 5 segundos e os três
  convidados conseguem entrar.
- **SC-002**: Derrubar a rede de um convidado por até 1 minuto e reconectar mantém 100% do
  progresso dele no momento da queda.
- **SC-003**: Um save corrompido de propósito é detectado em 100% dos casos testados, e restaurar o
  backup permite continuar o jogo.
- **SC-004**: Um save editado com valores impossíveis (ex.: nível 500) é recusado pelo host, com o
  motivo mostrado ao convidado.
- **SC-005**: Encerrar o app à força durante a gravação nunca deixa um slot sem save íntegro
  (atual ou backup).
- **SC-006**: Do app aberto até estar jogando sozinho com um save existente: no máximo 3 ações.
- **SC-007**: Uma sessão solo nunca aparece na lista de outro PC da rede.

## Assumptions

- O limite de nome é o já definido no jogo (`PLAYER_NAME_MAX`, como no original).
- "Personagem" nesta feature é escolher entre o protagonista masculino e o feminino.
- Um novo jogo começa no ponto inicial do mundo da feature 011 (quarto do jogador em New Bark Town);
  a introdução do Prof. Oak e a escolha do inicial ficam para o Marco 3.
- O save inclui hoje o que já existe (identidade, posição); campos de flags, equipe e itens entram
  nas features que os criam, via migração.
- A validação de coerência cobre os campos que o save tiver; "nível 500" vira teste real quando
  equipe existir, e até lá a regra é testada com os campos atuais e um campo de nível de teste.
- O host joga com o próprio save, gravado diretamente no PC dele pelo mesmo caminho.
- Versão compatível significa a mesma versão de protocolo (feature 010); o auto-update (feature 002)
  mantém todos na mesma versão.
- A descoberta usa apenas a LAN local; jogo pela internet está fora do escopo.
- Fora do escopo: introdução do Prof. Oak e escolha do inicial (Marco 3), troca e PvP (spec 25),
  jogo pela internet, senha de partida, expulsar jogadores.
