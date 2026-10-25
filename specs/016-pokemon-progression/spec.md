# Feature Specification: Progressão dos Pokémon

**Feature Branch**: `016-pokemon-progression`

**Created**: 2026-10-25

**Status**: Draft

**Input**: User description: "Progressão dos Pokémon: experiência, EVs, subida de nível, aprendizado de golpes e evolução por nível, adaptados ao combate em tempo real."

## Contexto

A progressão dá sentido a lutar e capturar. Pelo princípio I, fórmulas, curvas de crescimento,
learnsets e evoluções vêm do original e dos dados já extraídos (spec 4). Como o combate é em tempo
real (specs 13 e 14), nenhum momento de decisão pode interrompê-lo: tudo que exige escolha entra numa
fila e é resolvido quando o combate termina. O servidor calcula XP, EVs, stats e evoluções
(princípio IV).

Atores:

- **Jogador**: luta, vê seus Pokémon crescerem e decide golpes e evoluções.
- **Outros jogadores da sessão**: veem o resultado (espécie e nível atualizados), não as telas de decisão.

Termos:

- **Participante**: cada Pokémon do jogador que entrou em campo durante o combate e não está desmaiado quando o oponente cai.
- **Fila de progressão**: lista ordenada, por Pokémon, de subidas de nível, golpes novos e evoluções pendentes.
- **Fim do combate**: o momento em que o combate deixa de estar ativo (vitória, captura, fuga ou derrota).
- **Amizade**: valor de 0 a 255 por Pokémon, com as regras de ganho e perda do original.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - XP e subida de nível depois da luta (Priority: P1)

Ao derrotar um Pokémon, cada participante recebe XP pela fórmula da Gen 4 e os EVs da espécie
derrotada. Se passar do limite da curva de crescimento, sobe de nível e tem os stats recalculados.
A subida de nível é mostrada quando o combate termina.

**Why this priority**: É o núcleo da progressão; sem ela lutar não tem recompensa.

**Independent Test**: Vencer um selvagem com um Pokémon perto de subir de nível e conferir XP, nível e stats contra valores de referência.

**Acceptance Scenarios**:

1. **Given** um Pokémon que participou, **When** um selvagem é derrotado, **Then** ele recebe a XP da fórmula Gen 4 (sem bônus de treinador) e os EVs da espécie derrotada.
2. **Given** dois participantes, **When** o oponente desmaia, **Then** a XP é dividida entre eles, como no original.
3. **Given** a XP ultrapassa o limite do próximo nível, **When** o combate termina, **Then** o jogador vê a subida de nível com o ganho de cada stat.
4. **Given** XP suficiente para vários níveis, **When** o combate termina, **Then** cada nível é resolvido em ordem, com seus golpes e a checagem de evolução.
5. **Given** um oponente de treinador, **When** derrotado, **Then** aplica-se o bônus de treinador de 1,5×.

---

### User Story 2 - Aprender um quinto golpe (Priority: P1)

Quando um nível traz um golpe novo e o Pokémon já tem 4, o jogador escolhe, depois do combate, qual
esquecer ou se desiste de aprender.

**Why this priority**: Decisão central do original e principal exemplo da regra de não interromper o combate.

**Independent Test**: Levar um Pokémon com 4 golpes a um nível do learnset e resolver a escolha nas duas direções.

**Acceptance Scenarios**:

1. **Given** menos de 4 golpes, **When** o nível traz um golpe novo, **Then** ele é aprendido sem pergunta e anunciado.
2. **Given** 4 golpes, **When** o combate termina, **Then** abre a escolha com os 4 golpes atuais e o novo.
3. **Given** a escolha aberta, **When** o jogador escolhe um golpe, **Then** ele é substituído pelo novo com PP cheio.
4. **Given** a escolha aberta, **When** o jogador desiste, **Then** os golpes ficam como estão e o golpe novo não é aprendido.
5. **Given** um golpe que o Pokémon já conhece, **When** o nível o traria, **Then** nada acontece.

---

### User Story 3 - Evolução por nível cancelável (Priority: P1)

Ao atingir o nível de evolução, depois do combate, toca a animação de evolução, que o jogador pode
cancelar como no original.

**Why this priority**: É o momento mais marcante da progressão e um critério de sucesso explícito.

**Independent Test**: Um Cyndaquil nível 13 vence uma luta, chega ao 14 e evolui para Quilava; repetindo e cancelando, continua Cyndaquil.

**Acceptance Scenarios**:

1. **Given** um Cyndaquil que chega ao nível 14 numa luta, **When** o combate termina, **Then** a animação de evolução começa e, ao fim, ele é um Quilava com stats recalculados.
2. **Given** a animação em andamento, **When** o jogador cancela, **Then** ele continua Cyndaquil e a evolução é oferecida de novo no próximo nível ganho.
3. **Given** a evolução concluída, **When** a nova espécie aprende um golpe naquele nível, **Then** ele entra no fluxo da história 2.
4. **Given** uma espécie que evolui por pedra, troca, amizade ou horário, **When** sobe de nível, **Then** nenhuma evolução é disparada.

---

### User Story 4 - Amizade registrada (Priority: P3)

A amizade de cada Pokémon muda pelas regras originais já cobertas por este spec, para que a evolução
por amizade (spec futuro) encontre valores corretos.

**Why this priority**: Não tem efeito visível agora, mas evita perda de progresso depois.

**Independent Test**: Subir de nível e desmaiar um Pokémon e conferir a amizade contra a tabela original.

**Acceptance Scenarios**:

1. **Given** um Pokémon, **When** sobe de nível, **Then** a amizade aumenta conforme a faixa original (0–99, 100–199, 200–255).
2. **Given** um Pokémon, **When** desmaia, **Then** a amizade diminui como no original.
3. **Given** um Pokémon capturado ou recebido, **When** entra na equipe, **Then** a amizade inicial é a amizade base da espécie.

---

### Edge Cases

- Pokémon no nível 100 não recebe XP, mas ainda recebe EVs.
- EVs param em 255 por stat e 510 no total.
- Participante que desmaiou antes de o oponente cair não recebe XP nem EVs daquele oponente.
- Derrota ou fuga: XP e EVs ganhos durante o combate continuam valendo e a fila é resolvida mesmo assim.
- Desconexão ou fechamento do jogo com fila pendente: XP, nível e stats já estão salvos; golpes e evoluções pendentes são oferecidos de novo ao voltar.
- O jogador não consegue iniciar outro combate antes de resolver a fila.
- Pokémon que passa do nível de evolução numa só luta evolui uma vez, depois de resolver os níveis.
- Ao evoluir, o HP atual sobe na mesma quantidade que o HP máximo, como no original.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE calcular a XP pela fórmula da Gen 4: experiência base da espécie derrotada, nível do derrotado, bônus de treinador (1,5×) e divisão entre participantes.
- **FR-002**: Participante DEVE ser todo Pokémon do jogador que entrou em campo no combate e não está desmaiado quando o oponente cai.
- **FR-003**: O sistema DEVE aplicar os EVs da espécie derrotada a cada participante, com limites de 255 por stat e 510 no total.
- **FR-004**: O nível DEVE seguir a curva de crescimento extraída de cada espécie (as 6 curvas do original), até o nível 100.
- **FR-005**: Os stats DEVEM ser recalculados a cada subida de nível e evolução com base, IVs, EVs, nível e natureza, pela fórmula original.
- **FR-006**: XP e EVs DEVEM ser creditados pelo servidor quando o oponente cai; subidas de nível, golpes novos e evoluções DEVEM entrar na fila de progressão.
- **FR-007**: A fila de progressão DEVE ser resolvida só depois do fim do combate; nenhuma tela de decisão ou animação de progressão PODE aparecer com o combate ativo.
- **FR-008**: Golpes novos DEVEM vir do learnset por nível extraído; com menos de 4 golpes são aprendidos direto, com 4 o jogador escolhe qual esquecer ou não aprender.
- **FR-009**: A evolução por nível DEVE usar os dados de evolução extraídos, ter animação e poder ser cancelada; se cancelada, DEVE ser oferecida de novo no próximo nível ganho.
- **FR-010**: Métodos de evolução que não são por nível NÃO DEVEM disparar evolução neste spec, e seus dados DEVEM ser preservados sem alteração.
- **FR-011**: A amizade DEVE ser guardada por Pokémon (0–255), começar na amizade base da espécie e mudar por subida de nível e desmaio conforme o original.
- **FR-012**: XP, nível, EVs, stats, golpes, espécie, amizade e a fila pendente DEVEM ser persistidos no save, com migração dos saves existentes.
- **FR-013**: Os outros jogadores da sessão DEVEM ver a espécie e o nível atualizados depois da resolução.
- **FR-014**: Todas as fórmulas (XP, curvas, stats, EVs, amizade) DEVEM ter testes com valores de referência conhecidos do original.

### Key Entities

- **Progresso do Pokémon**: XP total, nível, EVs por stat, IVs, natureza, amizade, golpes com PP.
- **Fila de progressão**: itens pendentes por Pokémon (subida de nível com ganhos de stats, golpe novo, evolução), em ordem.
- **Escolha de golpe**: Pokémon, golpe novo, golpes atuais e resposta (esquecer um ou não aprender).
- **Evolução pendente**: espécie de origem, espécie de destino e estado (oferecida, concluída, cancelada).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Os testes da fórmula de XP (selvagem e treinador, de 1 a 6 participantes) batem 100% com valores de referência da Gen 4.
- **SC-002**: As 6 curvas de crescimento batem com a tabela original nos níveis 1, 2, 50 e 100, e em todos os níveis para pelo menos uma curva.
- **SC-003**: O recálculo de stats bate com valores de referência para pelo menos 3 espécies com IVs, EVs e naturezas diferentes.
- **SC-004**: Um Cyndaquil que chega ao nível 14 vira Quilava depois do combate, e cancelar mantém Cyndaquil, em 100% das execuções do teste.
- **SC-005**: Em todos os testes de combate, nenhuma tela de decisão ou animação de progressão aparece com o combate ativo.
- **SC-006**: Um save reaberto com fila pendente oferece de novo todas as escolhas pendentes, sem perder XP nem EVs.

## Assumptions

- Os dados do spec 4 já trazem experiência base, EVs concedidos, curva de crescimento, amizade base, learnset por nível e evoluções de cada espécie.
- O combate dos specs 13 e 14 já sabe quais Pokémon entraram em campo e quando cada oponente cai.
- A ordem de resolução segue o original: Pokémon na ordem da equipe, nível a nível, golpes antes da evolução.
- O bônus de 1,5× para Pokémon de outro treinador fica para o spec de troca (25).
- Ganho de amizade por passos, itens e vitaminas fica para os specs que introduzem essas ações.

## Fora do escopo

- Rare Candy e itens de EV (spec 24).
- Evolução por troca (spec 25).
- Evolução por pedra, amizade, horário e demais métodos.
- Exp. Share, Lucky Egg, Pokérus e reaprendizado de golpes.
