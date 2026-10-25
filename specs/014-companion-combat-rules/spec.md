# Feature Specification: Pokémon companheiro e regras do combate no mundo

**Feature Branch**: `014-companion-combat-rules`

**Created**: 2026-10-25

**Status**: Draft

**Input**: User description: "Pokémon companheiro e regras do combate no mundo: o primeiro Pokémon da equipe anda atrás do treinador como no HGSS, e é ele quem entra em combate quando o jogador assume o controle. Este spec também define o que acontece ao redor da luta: onde fica o treinador, troca de Pokémon, desmaio, fuga e derrota total (blackout)."

## Contexto

No HGSS o Pokémon que anda com o jogador é uma das marcas do jogo, e no original ele entra na batalha
pelo lado, sem sair da Poké Ball. Isso encaixa no combate em tempo real (spec 13): o companheiro dá
um passo à frente e o jogador passa a controlá-lo. Sem tela de batalha, também é preciso ter regras
claras de como a luta começa, termina e o que se perde na derrota. Regras e limites ficam em dados
(princípio III) e o servidor decide posição, rastro e estado de combate (princípio IV).

Atores:

- **Jogador**: anda com o treinador, interage com o companheiro e luta controlando o Pokémon.
- **Outros jogadores**: veem companheiros e o estado de combate dos demais.

Termos:

- **Companheiro**: o primeiro Pokémon não desmaiado da equipe, que segue o treinador.
- **Rastro**: sequência das posições recentes do treinador que o companheiro percorre.
- **Pokémon grande**: Pokémon cujo sprite de overworld (spec 7) é classificado como grande.
- **Local restrito**: local listado em dados onde nenhum companheiro pode seguir.
- **Raio de combate**: distância máxima, definida em dados, entre o Pokémon controlado e o treinador.
- **Seletor rápido**: único menu disponível em combate, usado para trocar de Pokémon.
- **Blackout**: derrota com todos os Pokémon da equipe desmaiados.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Companheiro segue o treinador (Priority: P1)

O primeiro Pokémon da equipe anda atrás do treinador pelo mapa, pula ressaltos, atravessa warps e
entra e sai de prédios com ele. Pokémon grandes voltam para a bola em prédios e locais restritos.

**Why this priority**: é a base de tudo; o combate começa a partir do companheiro.

**Independent Test**: andar de New Bark Town até Cherrygrove City entrando e saindo de todos os
prédios e conferir que o companheiro segue sem ficar preso nem atravessar obstáculos.

**Acceptance Scenarios**:

1. **Given** um treinador andando, **When** ele para, **Then** o companheiro para a uma distância fixa
   atrás dele, virado para a direção do último movimento.
2. **Given** o treinador pula um ressalto, **When** o companheiro chega ao ressalto pelo rastro,
   **Then** ele pula logo depois.
3. **Given** o treinador atravessa um warp, **When** chega ao destino, **Then** o companheiro aparece
   atrás dele no destino.
4. **Given** um Onix na frente da equipe, **When** o treinador entra no Centro Pokémon, **Then** o
   Onix volta para a bola, e **When** sai, **Then** reaparece atrás do treinador.
5. **Given** o companheiro ficou longe demais do treinador por qualquer motivo, **When** o servidor
   detecta, **Then** ele reaparece atrás do treinador.
6. **Given** o companheiro desmaia ou a equipe é reordenada, **When** a mudança acontece, **Then** o
   novo primeiro Pokémon não desmaiado passa a ser o companheiro.
7. **Given** dois jogadores no mesmo mapa, **When** se movem, **Then** cada um vê o companheiro do
   outro, e companheiros não bloqueiam jogadores nem uns aos outros.

---

### User Story 2 - Assumir o controle em combate (Priority: P1)

O jogador aperta o botão de combate, o companheiro dá um passo à frente e o controle passa para ele,
com movimento em 8 direções e mira independente. O treinador fica parado e intocável. O botão de
recolher devolve o Pokémon para trás do treinador.

**Why this priority**: liga o mundo ao combate do spec 13; sem isso não se luta no overworld.

**Independent Test**: apertar o botão de combate, medir o tempo até controlar o Pokémon, tentar sair
do raio de combate e recolher.

**Acceptance Scenarios**:

1. **Given** um companheiro seguindo, **When** o jogador aperta combate, **Then** em menos de meio
   segundo o Pokémon dá um passo à frente e responde ao controle, sem arremesso de Poké Ball.
2. **Given** o companheiro está na bola (ex.: Pokémon grande num prédio), **When** o jogador aperta
   combate, **Then** o Pokémon sai da bola e assume o controle.
3. **Given** um Pokémon em combate, **When** o jogador tenta ir além do raio de combate, **Then** ele
   é contido na borda do raio.
4. **Given** um Pokémon em combate, **When** um golpe atinge a posição do treinador, **Then** o
   treinador não sofre nada.
5. **Given** um Pokémon em combate, **When** o jogador aperta recolher, **Then** o Pokémon volta para
   trás do treinador como companheiro e o controle volta ao treinador.
6. **Given** um jogador em combate, **When** outro jogador o observa, **Then** vê que ele está em
   combate.

---

### User Story 3 - Trocar, desmaiar, fugir e blackout (Priority: P2)

O jogador troca de Pokémon pelo seletor rápido. Quando um Pokémon desmaia, ele escolhe o próximo ou
foge. Se todos desmaiarem, ocorre blackout com perda de dinheiro da Gen 4.

**Why this priority**: fecha o ciclo da luta; sem isso o combate não tem fim definido.

**Independent Test**: trocar de Pokémon em combate, deixar um desmaiar, fugir de um selvagem
agressivo e perder com toda a equipe, conferindo local de reaparição e dinheiro perdido.

**Acceptance Scenarios**:

1. **Given** um Pokémon em combate, **When** o jogador escolhe outro no seletor rápido, **Then** o
   novo sai da Poké Ball com uma breve animação, durante a qual pode ser atingido, e a troca entra em
   cooldown; a ordem da equipe não muda.
2. **Given** a troca em cooldown, **When** o jogador tenta trocar, **Then** nada acontece.
3. **Given** um Pokémon em combate, **When** seu HP chega a zero, **Then** ele volta sozinho para a
   bola e o jogador escolhe o próximo ou recolhe para fugir.
4. **Given** o jogador recolheu e se afasta, **When** um selvagem agressivo o persegue, **Then** o
   selvagem desiste ao passar do limite de perseguição.
5. **Given** todos os Pokémon desmaiados, **When** o último desmaia, **Then** o jogador reaparece no
   último Centro Pokémon visitado (ou em casa, se não visitou nenhum) e perde dinheiro pela regra da
   Gen 4.
6. **Given** o combate terminou, **When** termina, **Then** os XP são distribuídos (spec 16), e não
   antes.

---

### User Story 4 - Interagir com o companheiro (Priority: P3)

Uma tecla dedicada faz treinador e companheiro se virarem um para o outro; o companheiro mostra um
balão de emoção e uma reação do catálogo de textos.

**Why this priority**: dá vida ao companheiro, mas o jogo funciona sem ela.

**Independent Test**: apertar a tecla em cidade, rota, caverna e interior, de dia e de noite, e
conferir que a reação vem do catálogo e muda conforme o lugar e o horário.

**Acceptance Scenarios**:

1. **Given** um companheiro seguindo, **When** o jogador aperta a tecla de interação, **Then** os dois
   se viram um para o outro, aparece um balão de emoção e uma reação na caixa de diálogo.
2. **Given** lugares ou horários diferentes, **When** o jogador interage, **Then** a reação escolhida
   segue as regras em dados (amizade, tipo de lugar, horário).
3. **Given** combate, cutscene ou menu aberto, **When** o jogador aperta a tecla, **Then** nada
   acontece.
4. **Given** o jogador remapeou a tecla, **When** aperta a nova tecla ou o botão do gamepad, **Then**
   a interação acontece.

---

### Edge Cases

- Equipe com todos desmaiados fora de combate: não há companheiro; o botão de combate não faz nada.
- Companheiro desmaia por fora do combate (ex.: veneno no overworld, se existir): o próximo assume.
- Treinador gira no lugar sem andar: o companheiro não se move.
- Warp para local restrito: o companheiro some e volta sozinho ao sair.
- Botão de combate em local restrito: o Pokémon sai da bola mesmo assim, como na Story 2 cenário 2.
- Troca para um Pokémon desmaiado: não aparece como opção no seletor.
- Jogador desconecta em combate: o combate termina e o Pokémon volta a ser companheiro ao reconectar.
- Dinheiro menor que a perda calculada: o jogador fica com zero.
- Reação sem regra que combine: usa uma reação genérica do catálogo.
- Desmaio do último Pokémon durante a animação de troca: conta como blackout.

## Requirements *(mandatory)*

### Functional Requirements

**Companheiro**

- **FR-001**: O companheiro DEVE ser o primeiro Pokémon não desmaiado da equipe e mudar quando ele
  desmaiar ou a equipe for reordenada.
- **FR-002**: O companheiro DEVE seguir o rastro das posições recentes do treinador a uma distância
  fixa, olhando para a direção em que se move, e parar quando o treinador para.
- **FR-003**: O companheiro DEVE pular ressaltos logo depois do treinador e atravessar warps com ele,
  aparecendo atrás do treinador no destino.
- **FR-004**: O companheiro NÃO DEVE ficar preso em paredes nem atravessar obstáculos; se ficar longe
  demais do treinador, DEVE reaparecer atrás dele.
- **FR-005**: O treinador DEVE continuar se movendo em 4 direções, como no spec 11.
- **FR-006**: Pokémon grandes, pela classificação do sprite de overworld do spec 7, DEVEM voltar para
  a bola ao entrar em prédios; nenhum companheiro DEVE seguir em locais restritos listados em dados.
  Ao sair, o companheiro DEVE voltar sozinho.
- **FR-007**: Todos os jogadores DEVEM ver os companheiros uns dos outros; companheiros NÃO DEVEM
  colidir com jogadores nem entre si.
- **FR-008**: O servidor DEVE calcular o rastro e a posição do companheiro como faz com qualquer outra
  entidade.

**Interação**

- **FR-009**: Uma tecla dedicada e remapeável, com um botão padrão no gamepad, DEVE fazer treinador e
  companheiro se virarem um para o outro, com balão de emoção e reação na caixa de diálogo.
- **FR-010**: Os textos das reações DEVEM vir do catálogo do spec 5; as regras de escolha DEVEM ficar
  em dados e considerar amizade, tipo de lugar (cidade, rota, caverna, interior) e horário, podendo
  receber novos critérios depois.
- **FR-011**: A interação NÃO DEVE funcionar durante combate, cutscenes ou com menus abertos.

**Combate**

- **FR-012**: O botão de combate DEVE fazer o companheiro dar um passo à frente e passar o controle
  para ele, sem arremesso de Poké Ball; se ele estiver na bola, DEVE sair da bola.
- **FR-013**: Em combate, o Pokémon controlado DEVE se mover em 8 direções com mira independente do
  movimento (spec 13).
- **FR-014**: Durante o combate, o treinador DEVE ficar parado onde estava e NÃO DEVE poder ser
  atingido.
- **FR-015**: O Pokémon controlado NUNCA DEVE passar do raio de combate em relação ao treinador,
  definido em dados; o servidor DEVE contê-lo na borda.
- **FR-016**: A câmera DEVE seguir o Pokémon enquanto ele estiver em combate e voltar ao treinador ao
  recolher.
- **FR-017**: O botão de recolher DEVE devolver o Pokémon para trás do treinador como companheiro e o
  controle ao treinador.
- **FR-018**: A troca pelo seletor rápido DEVE trazer o novo Pokémon pela Poké Ball com uma breve
  animação, durante a qual ele pode ser atingido, seguida de um cooldown de troca definido em dados.
  A troca NÃO DEVE reordenar a equipe.
- **FR-019**: Ao desmaiar, o Pokémon DEVE voltar sozinho para a bola e o jogador DEVE escolher o
  próximo Pokémon ou recolher para fugir.
- **FR-020**: Selvagens agressivos DEVEM perseguir o jogador que fugiu até um limite definido em
  dados e depois desistir.
- **FR-021**: No blackout, o jogador DEVE reaparecer no último Centro Pokémon visitado, ou em casa se
  não visitou nenhum, e perder dinheiro pela regra da Gen 4: maior nível da equipe × valor base por
  número de insígnias (0: 8, 1: 16, 2: 24, 3: 36, 4: 48, 5: 64, 6: 80, 7: 100, 8+: 120), limitado ao
  dinheiro que tem.
- **FR-022**: Os outros jogadores DEVEM ver quando alguém está em combate.
- **FR-023**: Os XP só DEVEM ser distribuídos quando o combate termina (spec 16).
- **FR-024**: Nenhum menu completo DEVE abrir durante o combate; só o seletor rápido de troca.
- **FR-025**: O último Centro Pokémon visitado DEVE ser salvo para uso no blackout.

### Key Entities

- **Companheiro**: Pokémon da equipe que segue; estado (seguindo, na bola, em combate), posição,
  direção.
- **Rastro**: posições recentes do treinador com o tipo de passo (normal, ressalto, warp).
- **Regras de companheiro (dados)**: distância de seguimento, distância de reaparição, classificação
  de tamanho, lista de locais restritos.
- **Regra de reação (dados)**: condições (amizade, tipo de lugar, horário), emoção e texto do catálogo.
- **Regras de combate no mundo (dados)**: raio de combate, duração da animação de troca, cooldown de
  troca, limite de perseguição, tabela de perda de dinheiro.
- **Estado de combate do jogador**: em combate ou não, Pokémon ativo, cooldown de troca.
- **Ponto de reaparição**: último Centro Pokémon visitado ou casa.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O companheiro acompanha o treinador de New Bark Town até Cherrygrove City, entrando e
  saindo de todos os prédios, sem ficar preso e sem atravessar obstáculos.
- **SC-002**: Um Onix na frente da equipe volta para a bola ao entrar no Centro Pokémon e reaparece
  ao sair.
- **SC-003**: A tecla de interação mostra uma reação do catálogo que muda conforme o lugar e o horário.
- **SC-004**: Do botão de combate até o controle do Pokémon passam menos de meio segundo.
- **SC-005**: Os testes cobrem o rastro do companheiro, a troca de companheiro ao desmaiar, a troca em
  combate, o blackout e a regra de perda de dinheiro.
- **SC-006**: O Pokémon controlado nunca passa do raio de combate em 100% dos testes, incluindo
  tentativas deliberadas de sair.

## Assumptions

- "Prédio" é qualquer mapa interior pelos cabeçalhos de mapa do spec 6; cavernas não são prédios.
- A classificação de tamanho usa as dimensões do frame do sprite de overworld (spec 7): maior que o
  frame padrão de 32×32 conta como grande.
- O horário vem do relógio do jogo já usado pelo mundo; os tipos de lugar vêm dos cabeçalhos de mapa.
- Valores padrão em dados: distância de seguimento de 1 tile, reaparição acima de 3 tiles, raio de
  combate de 6 tiles, cooldown de troca de 3 s, animação de troca de 0,5 s, perseguição até 10 tiles.
- A perda de dinheiro usa a regra de DPPt/HGSS (maior nível × base por insígnias), não a metade do
  dinheiro das gerações anteriores.
- Sem Centro visitado, o reaparecimento é na casa do jogador em New Bark Town.
- O combate termina quando o jogador recolhe, quando não há inimigos ativos por perto ou no blackout.
- Fora do escopo: itens pelo caminho (spec 24), bola na bicicleta e no surf, bônus de pesca por
  amizade (spec 22), reações especiais (Marco 4), batalhas contra treinadores (spec 20), itens em
  combate (spec 24) e PvP (spec 25).
