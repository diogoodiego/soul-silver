# Feature Specification: Combate em tempo real

**Feature Branch**: `013-realtime-combat`

**Created**: 2026-10-24

**Status**: Draft

**Input**: User description: "Combate em tempo real: o jogador controla diretamente o Pokémon em combate, usando 4 golpes por atalho, com hitboxes, dano da fórmula original, efetividade de tipos, status e cooldowns. Golpes são mapeados para arquétipos definidos em dados."

## Contexto

É a maior mudança em relação ao original e o que mais define a experiência. O combate deixa de ser
por turnos, mas preserva a identidade de Pokémon: tipos, stats, golpes conhecidos e a fórmula de
dano da Gen 4 (princípio I). Todo comportamento de golpe e status vem de dados (princípio III) e o
servidor decide todo acerto e dano (princípio IV).

Atores:

- **Jogador**: controla diretamente um Pokémon em combate.
- **Desenvolvedor**: ajusta golpes, status e limites editando dados; usa a arena de teste.

Termos:

- **Arquétipo**: forma de execução de um golpe (corpo a corpo, projétil, feixe, área ao redor de si,
  área num ponto mirado, investida, buff em si, debuff em alvo, efeito de campo). A lista é extensível.
- **Mapeamento de golpe**: liga um golpe original a um arquétipo com parâmetros (alcance, formato e
  tamanho da hitbox, tempo de conjuração, cooldown, efeitos).
- **Arquétipo genérico**: arquétipo padrão por categoria (físico, especial, status) usado por golpes
  sem mapeamento próprio.
- **Hitbox**: região do golpe que determina o acerto; substitui a precisão.
- **Cooldown**: tempo até o golpe poder ser usado de novo; substitui o PP.
- **Estágio de stat**: modificador de -6 a +6 nas regras originais (ex.: Swords Dance).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Lutar com o Pokémon por controle direto (Priority: P1)

O jogador move o Pokémon livremente e dispara cada um dos 4 golpes por um botão, mirando com o
mouse ou com o analógico direito. O golpe sai no arquétipo mapeado e acerta quem estiver na hitbox.
O dano segue a fórmula da Gen 4.

**Why this priority**: é o núcleo jogável; sem isso não existe combate.

**Independent Test**: na arena de teste, colocar dois Pokémon, disparar cada golpe mirando no alvo e
fora dele, e conferir que só acerta quando a hitbox cobre o alvo e que o HP cai pelo valor da fórmula.

**Acceptance Scenarios**:

1. **Given** um Pokémon com 4 golpes na arena, **When** o jogador aperta o atalho do golpe 2 mirando
   no alvo, **Then** o golpe 2 é executado conforme seu arquétipo e o alvo perde HP dentro da faixa
   da fórmula.
2. **Given** a mira apontada para longe do alvo, **When** o jogador dispara um projétil, **Then** o
   projétil não acerta e nenhum dano é aplicado.
3. **Given** um golpe em cooldown, **When** o jogador aperta o atalho, **Then** nada é executado e o
   HUD de depuração mostra o tempo restante.
4. **Given** um golpe sem mapeamento próprio, **When** é usado, **Then** executa o arquétipo genérico
   da sua categoria sem erro.
5. **Given** um cliente que reporta um acerto que o servidor não confirma, **When** o servidor
   processa, **Then** nenhum dano é aplicado.

---

### User Story 2 - Entender a efetividade na hora (Priority: P1)

Ao acertar, o jogador vê o número de dano, o alvo pisca e sofre knockback leve, e aparece o texto
"super efetivo", "pouco efetivo" ou "sem efeito" quando aplicável.

**Why this priority**: sem esse feedback, tipos perdem o sentido no tempo real.

**Independent Test**: na arena, usar um golpe de fogo contra um Pokémon de planta e um golpe normal
contra um fantasma, conferindo texto e dano.

**Acceptance Scenarios**:

1. **Given** um golpe de fogo e um alvo de planta, **When** acerta, **Then** aparece "super efetivo"
   e o dano é o dobro do mesmo golpe com efetividade neutra (mesmo fator aleatório e sem crítico).
2. **Given** um golpe normal e um alvo fantasma, **When** a hitbox cobre o alvo, **Then** aparece
   "sem efeito", o dano é 0 e não há knockback.
3. **Given** um acerto com efetividade 0,5× ou 0,25×, **Then** aparece "pouco efetivo".
4. **Given** um acerto crítico, **Then** o feedback indica o crítico.

---

### User Story 3 - Velocidade e peso dos golpes importam (Priority: P2)

Pokémon com Speed alta se movem mais rápido e têm cooldowns menores; golpes fortes e de pouco PP
demoram mais para voltar. Os efeitos de Speed ficam dentro de limites definidos em dados.

**Why this priority**: dá identidade aos stats no tempo real, mas o combate já funciona sem isso.

**Independent Test**: na arena, comparar dois Pokémon de Speed diferente usando o mesmo golpe e
medir velocidade de movimento e cooldown; comparar Tackle com Hyper Beam no mesmo Pokémon.

**Acceptance Scenarios**:

1. **Given** dois Pokémon com Speed diferente, **Then** o mais rápido tem velocidade de movimento e
   redução de cooldown maiores, ambas dentro dos limites mínimo e máximo dos dados.
2. **Given** dois golpes, um com mais poder e menos PP, **Then** o seu cooldown base é maior.

---

### User Story 4 - Status e mudanças de stats (Priority: P2)

Golpes podem aplicar status com duração em segundos: queimadura (dano contínuo e ataque reduzido),
veneno e veneno grave (dano contínuo, o grave crescente), paralisia (lentidão e chance de travar),
sono (imóvel por um tempo), congelamento (imóvel até descongelar) e confusão (chance de o golpe
sair na direção errada). Buffs e debuffs de stats duram até o Pokémon voltar para a Poké Ball.

**Why this priority**: preserva golpes de status e estratégia, depois do núcleo de dano.

**Independent Test**: na arena, aplicar cada status e conferir efeito e expiração no HUD; usar
Swords Dance e conferir que o dano físico seguinte segue o estágio +2.

**Acceptance Scenarios**:

1. **Given** um Pokémon queimado, **Then** perde HP periodicamente, causa menos dano físico e a
   queimadura some ao fim da duração dos dados.
2. **Given** um Pokémon dormindo ou congelado, **Then** não se move nem ataca até o status acabar.
3. **Given** um Pokémon confuso, **When** dispara um golpe, **Then** com a chance dos dados o golpe
   sai em direção diferente da mirada.
4. **Given** um Pokémon que usou Swords Dance, **Then** o estágio de ataque fica +2 até ele voltar
   para a Poké Ball (o recolhimento em si é do spec 14).
5. **Given** um Pokémon que já tem um status principal, **When** recebe outro status principal,
   **Then** o novo não é aplicado (regra original); confusão pode coexistir.

---

### User Story 5 - Ajustar golpes só com dados (Priority: P2)

O desenvolvedor muda alcance, hitbox, conjuração, cooldown ou efeitos de um golpe, ou cria um novo
arquétipo de parâmetros, editando dados, e vê o efeito na arena sem mudar código.

**Why this priority**: viabiliza o balanceamento contínuo exigido pelo princípio III.

**Independent Test**: alterar o alcance de Ember nos dados, reiniciar a arena e confirmar o novo
alcance.

**Acceptance Scenarios**:

1. **Given** um parâmetro de golpe alterado nos dados, **When** a arena é reiniciada, **Then** o
   golpe usa o novo valor.
2. **Given** dados de golpe inválidos (arquétipo inexistente, valor fora do formato), **When** o
   servidor carrega, **Then** recusa com mensagem que indica o golpe e o campo.

---

### User Story 6 - Arena de teste de desenvolvimento (Priority: P1)

O desenvolvedor abre uma arena onde escolhe dois Pokémon quaisquer (espécie, nível e golpes) para
lutar, com um HUD mínimo de depuração: HP, cooldowns e status de cada um.

**Why this priority**: é o meio de verificar todas as outras histórias antes dos specs 14 a 17.

**Independent Test**: abrir a arena, escolher Cyndaquil e Chikorita, e lutar.

**Acceptance Scenarios**:

1. **Given** a arena, **When** o desenvolvedor escolhe dois Pokémon, **Then** ambos aparecem e o
   HUD mostra HP, cooldowns e status de cada um.
2. **Given** a arena, **Then** o segundo Pokémon pode ser controlado por outro jogador ou ficar
   parado como alvo (a IA é do spec 15).

### Edge Cases

- HP chega a 0: o Pokémon para de agir e de receber dano; desmaio completo é do spec 14.
- Dois golpes acertam no mesmo instante: ambos são aplicados, na ordem decidida pelo servidor.
- Golpe com poder variável ou especial (OHKO, dano fixo, multi-hit): usa o parâmetro do mapeamento;
  sem mapeamento, o genérico da categoria com o poder base.
- Pokémon de jogadores diferentes fora do PvP: hitboxes de um não causam dano nem efeito no outro.
- Status termina no mesmo tick em que seria reaplicado: a nova aplicação vale normalmente.
- Mira sem dispositivo (sem mouse/analógico ativo): o golpe sai na direção em que o Pokémon olha.
- Estágios de stat no limite (+6/-6): novas mudanças na mesma direção não têm efeito.
- Cliente com latência: o servidor decide pelo seu estado; o cliente só exibe.

## Requirements *(mandatory)*

### Functional Requirements

**Controle**

- **FR-001**: O jogador MUST mover o Pokémon livremente em combate e disparar cada um dos 4 golpes
  por um atalho próprio, no teclado/mouse e no controle.
- **FR-002**: A mira MUST seguir o mouse ou o analógico direito; sem mira ativa, usa a direção em que
  o Pokémon olha.

**Arquétipos e mapeamento**

- **FR-003**: Arquétipos MUST ser definidos em dados e incluir: corpo a corpo, projétil, feixe, área
  ao redor de si, área num ponto mirado, investida, buff em si, debuff em alvo e efeito de campo.
  Novos arquétipos MUST poder ser adicionados por dados quando combinam comportamentos existentes.
- **FR-004**: Cada golpe mapeado MUST apontar para um arquétipo com parâmetros: alcance, formato e
  tamanho da hitbox, tempo de conjuração, cooldown e efeitos.
- **FR-005**: Todo golpe aprendível pelos Pokémon da Route 29, Route 30, Route 31 e pelos três
  iniciais (por nível, TM/HM, tutor, ovo) MUST ter mapeamento próprio.
- **FR-006**: Golpes sem mapeamento próprio MUST usar o arquétipo genérico da sua categoria (físico,
  especial ou status) e nunca causar erro.
- **FR-007**: Os dados de golpes, arquétipos e status MUST ser validados ao carregar; dados inválidos
  MUST ser recusados com mensagem que indica o item e o campo.

**Dano e acerto**

- **FR-008**: O dano MUST seguir a fórmula da Gen 4: nível, ataque e defesa (físico ou especial pela
  categoria do golpe), estágios de stat, STAB, efetividade de tipos, crítico e fator aleatório.
- **FR-009**: A tabela de tipos MUST ser a original da Gen 4, inclusive tipos duplos (efetividade
  multiplicada) e imunidades.
- **FR-010**: A precisão original MUST ser ignorada; o acerto depende só da hitbox cobrir o alvo.
- **FR-011**: O servidor MUST decidir todo acerto, dano, status e knockback; o cliente só envia
  intenções (mover, mirar, usar golpe N) e exibe o resultado.
- **FR-012**: Pokémon de jogadores diferentes MUST NOT se ferir nem aplicar efeitos fora do PvP
  (spec 25).

**Cooldown e Speed**

- **FR-013**: O cooldown base de cada golpe MUST derivar do poder e do PP originais (mais poder e
  menos PP resultam em cooldown maior); o mapeamento pode sobrescrever.
- **FR-014**: Speed MUST aumentar a velocidade de movimento e reduzir o cooldown, ambos limitados por
  mínimo e máximo definidos em dados.

**Status e stats**

- **FR-015**: Status MUST ter duração em segundos e efeitos definidos em dados: queimadura, veneno,
  veneno grave, paralisia, sono, congelamento e confusão, com os efeitos descritos na User Story 4.
- **FR-016**: Um Pokémon MUST ter no máximo um status principal; confusão MUST poder coexistir.
  Imunidades por tipo originais MUST valer (ex.: fogo não queima, veneno/aço não envenenam).
- **FR-017**: Mudanças de stats MUST seguir os estágios originais (-6 a +6) e durar até o Pokémon
  voltar para a Poké Ball.

**Feedback**

- **FR-018**: Cada acerto MUST gerar knockback leve, piscada no alvo e número de dano; acertos com
  efetividade diferente de 1× MUST mostrar "super efetivo", "pouco efetivo" ou "sem efeito"; críticos
  MUST ser indicados.

**Balanceamento e arena**

- **FR-019**: Todo valor que desvia do original (cooldowns derivados de PP, durações de status em
  segundos, limites de Speed, multiplicadores ajustados) MUST ser registrado em
  `docs/balance-log.md` com valor original, novo e motivo.
- **FR-020**: Uma arena de teste de desenvolvimento MUST permitir escolher dois Pokémon quaisquer
  (espécie, nível, golpes) e mostrar HUD de depuração com HP, cooldowns e status. A arena MUST NOT
  estar acessível em builds de produção.

### Key Entities

- **Arquétipo**: nome, comportamento (forma de execução), parâmetros aceitos e valores padrão.
- **Mapeamento de golpe**: golpe original, arquétipo, alcance, hitbox (formato e tamanho),
  conjuração, cooldown (derivado ou sobrescrito), efeitos (status, chance, mudança de stat, campo).
- **Definição de status**: tipo, duração, dano periódico, modificadores, chances (travar, confusão).
- **Limites de Speed**: mínimo e máximo de velocidade de movimento e de redução de cooldown.
- **Combatente**: Pokémon em combate com HP, stats, estágios, status, cooldowns, dono e posição.
- **Evento de acerto**: atacante, alvo, golpe, dano, efetividade, crítico, efeitos aplicados.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Testes cobrem a fórmula de dano e as 17×17 combinações da tabela de tipos; os
  resultados ficam dentro das faixas mínima e máxima do original para os mesmos dados.
- **SC-002**: 100% dos golpes aprendíveis pelos Pokémon da Route 29, 30, 31 e pelos iniciais têm
  mapeamento próprio, verificado por teste que cruza learnsets e mapeamentos.
- **SC-003**: Na arena, um golpe de fogo contra um Pokémon de planta mostra "super efetivo" e causa
  o dobro do dano neutro esperado.
- **SC-004**: Usar qualquer golpe da ROM sem mapeamento próprio não causa erro (testado sobre todos os
  golpes extraídos).
- **SC-005**: O feedback de acerto aparece para o jogador em até 150 ms após o acerto em LAN.
- **SC-006**: Mudar um parâmetro de golpe nos dados altera o comportamento na arena sem nenhuma
  alteração de código.
- **SC-007**: Cada desvio de número original introduzido por este spec tem linha em
  `docs/balance-log.md`.

## Assumptions

- Stats, tipos, golpes, learnsets e encontros vêm dos dados extraídos (spec 004 e 008).
- A arena entra como cena de desenvolvimento local, sobre o servidor e o renderizador existentes
  (specs 010 e 011); o segundo Pokémon é controlado por outro jogador ou fica parado.
- Fator aleatório e crítico usam o gerador determinístico do servidor, para testes reprodutíveis.
- Taxa de crítico segue os estágios da Gen 4 (base 1/16).
- "Efeito de campo" cobre clima e áreas persistentes (ex.: Sunny Day, Spikes) com duração em segundos.
- Golpes de dois turnos, recarga (Hyper Beam) e multi-hit são expressos pelos parâmetros de
  conjuração, cooldown e número de acertos do mapeamento.
- Habilidades (abilities) e itens segurados ficam fora, salvo imunidades de tipo; itens em combate
  são do spec 24.
- Fora do escopo: enviar/trocar/recolher e desmaio (spec 14), IA dos selvagens (spec 15), XP
  (spec 16), HUD final (spec 17), itens em combate (spec 24), PvP (spec 25).
