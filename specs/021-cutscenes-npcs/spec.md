# Feature Specification: Cutscenes e NPCs

**Feature Branch**: `021-cutscenes-npcs`

**Created**: 2026-10-26

**Status**: Draft

**Input**: User description: "Cutscenes e NPCs: NPCs com seus padrões de movimento no mapa, movimento scriptado durante eventos, controle de câmera e o estado "ocupado" do jogador em cutscene, adaptados ao mundo compartilhado."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - NPCs vivos no mapa (Priority: P1)

O jogador vê os NPCs dos mapas parados, olhando em volta, vagando por uma área ou andando por um caminho fixo, como no jogo original, e não consegue atravessá-los.

**Why this priority**: Sem NPCs com comportamento o mundo parece vazio e as cutscenes não têm atores.

**Independent Test**: Entrar em New Bark Town e Cherrygrove City e conferir que cada NPC tem o padrão do original, é visível e bloqueia a passagem.

**Acceptance Scenarios**:

1. **Given** um NPC do tipo parado, **When** o jogador o observa, **Then** ele permanece na posição e direção originais.
2. **Given** um NPC que olha em direções, **When** o tempo passa, **Then** ele muda de direção sem sair do lugar, no ritmo do original.
3. **Given** um NPC que vaga em área, **When** o tempo passa, **Then** ele anda apenas dentro da área definida, sem atravessar paredes, outros NPCs ou jogadores.
4. **Given** um NPC de caminho fixo, **When** o tempo passa, **Then** ele percorre o caminho em ciclo e espera se algo estiver no caminho.

---

### User Story 2 - Assistir a cutscenes com movimento e câmera (Priority: P1)

Quando um evento de história dispara, o jogador assiste sem controlar nada: personagens andam, viram, esperam, pulam, aparecem e somem, e a câmera se move, trava num alvo, volta ao jogador e treme, como no original. A introdução com o Prof. Oak roda após a criação do save, com o nome e o personagem já escolhidos.

**Why this priority**: É o núcleo da história: introdução, laboratório do Prof. Elm, rival e entrega do ovo.

**Independent Test**: Jogar da introdução à entrega do ovo ao Mr. Pokémon e comparar lado a lado com o original.

**Acceptance Scenarios**:

1. **Given** um evento com movimento scriptado, **When** executa, **Then** cada personagem cumpre sua sequência de passos, viradas, esperas, saltos, aparições e sumiços na ordem e no tempo do original.
2. **Given** um evento com comandos de câmera, **When** executa, **Then** a câmera se move, trava, volta ao jogador e treme como no original.
3. **Given** uma cutscene em andamento, **When** o jogador aperta botões de movimento ou interação, **Then** nada acontece, exceto avançar texto.
4. **Given** um novo save recém-criado, **When** o jogo começa, **Then** a introdução do Prof. Oak roda usando nome e personagem escolhidos no menu, sem perguntá-los de novo.
5. **Given** o jogador com companheiro, **When** o script envolve o companheiro, **Then** ele participa; **When** não envolve, **Then** fica parado durante a cutscene.
6. **Given** a opção de acelerar texto das cutscenes, **When** ativada, **Then** o texto avança conforme a velocidade de texto das Configurações.

---

### User Story 3 - Cutscene de um amigo não afeta o meu jogo (Priority: P1)

Em grupo, o jogador vê um amigo que está em cutscene marcado como "ocupado", enquanto continua jogando normalmente. A cutscene do amigo não move NPCs, câmera nem nada no jogo dele.

**Why this priority**: É o princípio de progresso individual em mundo compartilhado; sem isso o modo cooperativo quebra.

**Independent Test**: Dois jogadores lado a lado; um dispara a cutscene do rival e o outro continua andando, vendo o primeiro como "ocupado".

**Acceptance Scenarios**:

1. **Given** dois jogadores no mesmo mapa, **When** um entra em cutscene, **Then** o outro continua com controle total e vê o primeiro como "ocupado".
2. **Given** um NPC que sai do caminho para o jogador A após um evento, **When** o jogador B, que não viveu o evento, chega ao local, **Then** o NPC continua bloqueando para B.
3. **Given** a cutscene de A termina, **When** o estado "ocupado" some, **Then** os outros jogadores o veem normal de novo.

---

### User Story 4 - Segurança durante a cutscene (Priority: P2)

O jogador em cutscene não pode ser atingido nem interagir com nada. Pokémon selvagens que o perseguiam desistem.

**Why this priority**: Evita que a cutscene seja interrompida ou o jogador perca progresso enquanto não tem controle.

**Independent Test**: Disparar uma cutscene com um selvagem perseguindo o jogador e conferir que ele desiste e não causa dano.

**Acceptance Scenarios**:

1. **Given** um selvagem perseguindo o jogador, **When** a cutscene começa, **Then** o selvagem desiste da perseguição.
2. **Given** o jogador em cutscene, **When** ataques ou outros jogadores o alcançam, **Then** ele não sofre dano nem é empurrado.
3. **Given** o jogador em cutscene, **When** outro jogador tenta interagir com ele, **Then** nada ocorre.

### Edge Cases

- Jogador desconecta no meio da cutscene: o estado "ocupado" é removido e, ao reconectar, o evento não deixa o jogador travado.
- Dois jogadores disparam cutscenes ao mesmo tempo no mesmo mapa: cada uma roda isolada, sem interferência.
- Um NPC de caminho fixo ou vagante é bloqueado por um jogador: espera, sem atravessá-lo.
- A cutscene termina com um NPC em nova posição permanente: a posição vale para aquele jogador, inclusive após salvar e recarregar.
- Um comando de movimento ou câmera não suportado: a cutscene encerra com segurança, libera o jogador e registra o comando.
- Jogador troca de mapa no meio de uma cutscene (warp scriptado): a cutscene segue no novo mapa conforme o original.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Os NPCs MUST seguir os tipos de movimento extraídos do original: parado, olhando em direções, vagando em área e caminho fixo.
- **FR-002**: Os NPCs MUST colidir com o mundo e com jogadores, conforme o original.
- **FR-003**: O sistema MUST executar os comandos de movimento scriptado: sequência de passos, virar, esperar, pular, aparecer e sumir, como no original.
- **FR-004**: O sistema MUST executar os comandos de câmera: mover, travar em alvo, voltar ao jogador e tremer, como no original.
- **FR-005**: A cutscene MUST rodar no cliente de quem a disparou, sem afetar a visão dos demais jogadores.
- **FR-006**: O servidor MUST saber que o jogador está em cutscene e MUST mostrá-lo aos outros jogadores como "ocupado".
- **FR-007**: O companheiro do jogador MUST participar da cutscene quando o script o envolve e MUST ficar parado quando não.
- **FR-008**: A posição permanente de um NPC alterada por evento MUST ser determinada pelas flags e variáveis do jogador, nunca por estado compartilhado.
- **FR-009**: Durante a cutscene o jogador MUST ser inatingível e MUST NOT interagir com nada.
- **FR-010**: Pokémon selvagens que perseguiam o jogador ao início da cutscene MUST desistir.
- **FR-011**: A cutscene de introdução (Prof. Oak) MUST rodar após a criação do save, usando o nome e o personagem escolhidos no menu.
- **FR-012**: O sistema MUST oferecer opção de acelerar o texto das cutscenes, respeitando a velocidade de texto das Configurações.
- **FR-013**: Um comando de movimento ou câmera não suportado MUST encerrar a cutscene com segurança, liberar o jogador e ser registrado.
- **FR-014**: Pular cutscenes NÃO faz parte deste escopo.

### Key Entities

- **NPC**: personagem do mapa com tipo de movimento, posição, direção e visibilidade dependentes das flags do jogador que o vê.
- **Padrão de movimento**: parado, olhando em direções, vagando em área ou caminho fixo, com parâmetros do original.
- **Cutscene**: sequência de movimento, câmera, texto e espera executada no cliente de um jogador.
- **Estado "ocupado"**: marca visível aos outros jogadores enquanto alguém está em cutscene.
- **Posição permanente de NPC**: nova posição decorrente de evento, derivada das flags do jogador.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A introdução, o laboratório do Prof. Elm, o encontro com o rival e a entrega do ovo ao Mr. Pokémon acontecem com os movimentos e a câmera do original, sem diferença perceptível numa comparação lado a lado.
- **SC-002**: Enquanto um jogador assiste a uma cutscene, outro jogador ao lado continua jogando sem interrupção e o vê como "ocupado" em 100% dos casos testados.
- **SC-003**: Um NPC que sai do caminho para um jogador continua bloqueando para outro que ainda não viveu o evento em 100% dos casos testados.
- **SC-004**: 100% dos NPCs de New Bark Town até Cherrygrove City apresentam o padrão de movimento do original e bloqueiam a passagem.
- **SC-005**: Em 100% dos testes, um selvagem que perseguia o jogador desiste ao início da cutscene e nenhum dano é recebido durante ela.

## Assumptions

- Os tipos de movimento dos NPCs, os scripts de eventos e as sequências de movimento e câmera já foram extraídos da ROM.
- O interpretador de scripts (spec 020) já existe e fornece os pontos de ligação para movimento e câmera.
- A criação do save já guarda nome e personagem do jogador.
- Batalhas iniciadas por cutscenes (spec de treinadores) e animações especiais de lendários estão fora do escopo.
- Os princípios I (fidelidade ao original), IV (servidor autoritativo) e VII (progresso individual em mundo compartilhado) da constituição se aplicam.
