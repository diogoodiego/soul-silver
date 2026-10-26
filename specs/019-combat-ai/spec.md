# Feature Specification: IA de combate dos Pokémon

**Feature Branch**: `019-combat-ai`

**Created**: 2026-10-25

**Status**: Draft

**Input**: User description: "IA de combate dos Pokémon: o controlador que faz um Pokémon não controlado por jogador perceber, decidir e lutar em tempo real. Nesta etapa ele é usado pelos selvagens. Ele é construído de forma genérica, para que o spec de batalhas contra treinadores o reutilize acrescentando apenas troca de Pokémon, uso de itens e a linha de visão dos treinadores NPC."

## Contexto

Com selvagens visíveis e combate em tempo real (specs 13 a 15), a IA é quem torna cada luta interessante.
Ela precisa ser justa (o jogador lê e reage ao que ela faz), coerente com a identidade de cada espécie
(tipos, golpes, temperamento) e barata o bastante para várias lutas simultâneas com 4 jogadores. O
comportamento é parametrizado em dados (princípio III), roda no servidor (princípio IV) e é construído
de forma reutilizável para os treinadores, evitando uma segunda IA.

Atores:

- **Jogador**: enfrenta selvagens controlados pela IA.
- **Jogadores em grupo**: até 4, compartilhando o mesmo selvagem como adversário.
- **Desenvolvedor**: ajusta perfis e depura o comportamento.
- **Desenvolvedor do spec de treinadores**: reutiliza o controlador.

Termos:

- **Controlador**: componente que percebe, decide e age por um Pokémon sem jogador.
- **Perfil de habilidade**: conjunto nomeado de parâmetros que define o quão bem a IA luta.
- **Temperamento**: passivo, arisco, agressivo ou territorial (definidos no spec 15).
- **Zona de origem**: região onde o selvagem nasceu; **raio máximo** é o quanto ele pode se afastar dela.
- **Tabela de ameaça**: pontuação por adversário que decide o alvo.
- **Preparação visível**: tempo de conjuração do arquétipo do golpe, mostrado antes do efeito.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Selvagem que percebe e luta (Priority: P1)

Um selvagem agressivo nota o jogador, mostra um "!" sobre a cabeça, vem na direção dele e luta usando
apenas os golpes que conhece.

**Why this priority**: é o ciclo percepção, decisão e ação; sem ele não há IA.

**Independent Test**: em cenário sem interface, colocar um selvagem agressivo e um jogador ao alcance de
visão e verificar a sequência Ocioso, Alerta, Aproximação, Combate e golpes só do conjunto do selvagem.

**Acceptance Scenarios**:

1. **Given** um selvagem agressivo ocioso e um jogador dentro do cone de visão sem obstáculo, **When** o
   selvagem o percebe, **Then** mostra o "!" e passa a se aproximar e atacar.
2. **Given** um selvagem atrás de uma parede ou árvore, **When** o jogador está dentro do alcance mas sem
   linha de visão, **Then** o selvagem não o percebe pela visão.
3. **Given** um jogador fora da visão que corre ou usa golpes dentro do raio de audição, **When** o som é
   ouvido, **Then** o selvagem olha na direção do som sem saber a posição exata.
4. **Given** um selvagem que perdeu o alvo de vista, **When** a memória ainda é válida, **Then** ele vai
   até a última posição vista, procura e só então desiste.
5. **Given** qualquer momento da luta, **When** o selvagem age, **Then** só usa golpes sem cooldown e dentro
   das regras de movimento, conjuração e status do jogador.

---

### User Story 2 - Ataques legíveis e escolha de golpe coerente (Priority: P1)

O jogador percebe cada ataque pela preparação visível e vê o selvagem escolher golpes que fazem sentido
contra o seu Pokémon.

**Why this priority**: a justiça da luta depende de poder reagir; a escolha de golpe dá identidade às espécies.

**Independent Test**: cenários sem interface com tipos conhecidos (Ember contra planta) e verificação de
que todo golpe passa pela preparação do arquétipo.

**Acceptance Scenarios**:

1. **Given** um Pokémon de perfil forte com Ember contra um alvo de planta, **When** decide em muitas
   rodadas, **Then** escolhe Ember na maioria delas.
2. **Given** um golpe que não afeta o alvo (imunidade) e perfil com conhecimento de tipos, **When** pontua,
   **Then** o golpe recebe pontuação mínima.
3. **Given** o alvo já com status, **When** a IA avalia golpes de status, **Then** não os prioriza.
4. **Given** HP baixo, **When** a IA tem golpe de cura pronto, **Then** a utilidade dele sobe.
5. **Given** qualquer golpe da IA, **When** é usado, **Then** a preparação visível do arquétipo aparece
   antes do efeito, sem exceção.
6. **Given** perfis fraco e forte, **When** escolhem golpes em muitas rodadas, **Then** o fraco varia mais e
   o forte escolhe quase sempre o melhor.

---

### User Story 3 - Dificuldade por faixa de nível (Priority: P1)

Selvagens de rotas iniciais são fáceis e os de áreas avançadas lutam melhor.

**Why this priority**: define a curva de dificuldade do jogo.

**Independent Test**: simular 100 lutas do inicial no nível 5, controlado por um bot de referência, contra
selvagens da Route 29 e medir as vitórias.

**Acceptance Scenarios**:

1. **Given** um selvagem de rota inicial, **When** o perfil é aplicado, **Then** tem reação lenta, mira
   imprecisa e quase nenhuma esquiva.
2. **Given** a tabela de faixas de nível em dados, **When** o nível do selvagem muda de faixa, **Then** o
   perfil muda sem alteração de código.
3. **Given** 100 lutas simuladas contra selvagens da Route 29, **When** terminam, **Then** o inicial vence
   pelo menos 90%.

---

### User Story 4 - Temperamento e fuga (Priority: P2)

Cada temperamento reage de um jeito ao jogador, e um selvagem ferido às vezes foge conforme o temperamento.

**Why this priority**: dá personalidade às espécies; depende do ciclo básico.

**Independent Test**: cenários por temperamento e por limiar de HP.

**Acceptance Scenarios**:

1. **Given** um selvagem passivo, **When** vê um jogador, **Then** o ignora; **When** é atacado, **Then**
   foge ou revida conforme o peso do perfil.
2. **Given** um selvagem arisco, **When** vê um jogador, **Then** foge e só luta se estiver encurralado.
3. **Given** um territorial, **When** um jogador entra no raio próximo da zona, **Then** o ataca; **When**
   o jogador sai do raio, **Then** para de perseguir.
4. **Given** um selvagem passivo com HP abaixo do limiar de fuga, **When** decide, **Then** foge.
5. **Given** um selvagem puxado além do raio máximo da zona, **When** ultrapassa o limite, **Then** entra
   em Retorno, volta à zona e ignora provocações por um tempo curto.
6. **Given** um selvagem que escapou de uma Poké Ball, **When** o escape ocorre, **Then** fica agressivo por
   um tempo, qualquer que seja o temperamento.
7. **Given** um selvagem em Fuga sem saída, **When** fica encurralado, **Then** volta a lutar.
8. **Given** um selvagem dormindo, congelado, paralisado travado ou em recuo, **When** incapacitado, **Then**
   não decide nada até se recuperar.

---

### User Story 5 - Alvo estável em grupo (Priority: P2)

Em grupo, o selvagem escolhe quem atacar de forma compreensível, sem trocar de alvo o tempo todo.

**Why this priority**: sem isso, lutas com 4 jogadores ficam confusas.

**Independent Test**: simular 4 adversários com ameaça variando e contar trocas de alvo.

**Acceptance Scenarios**:

1. **Given** adversários com ameaça próxima da do alvo atual, **When** a ameaça oscila abaixo da margem,
   **Then** o alvo não muda.
2. **Given** outro adversário que supera o atual pela margem do perfil, **When** a IA reavalia, **Then**
   troca de alvo.
3. **Given** dano recebido, proximidade e quem atacou primeiro, **When** a ameaça é atualizada, **Then**
   todos contribuem conforme os pesos em dados.

---

### User Story 6 - Depuração visível (Priority: P2)

O desenvolvedor vê na tela o estado, o alvo e o raciocínio de cada IA.

**Why this priority**: ajustar perfis sem ver o que a IA pensa é impraticável.

**Independent Test**: ativar a sobreposição durante uma luta e conferir cada elemento contra o estado interno.

**Acceptance Scenarios**:

1. **Given** a sobreposição ativa, **When** há IAs ativas, **Then** cada uma mostra estado, alvo, cone de
   visão, última posição lembrada, raio da zona e pontuações dos golpes da última decisão, em tempo real.
2. **Given** uma sessão gravada, **When** é reproduzida duas vezes, **Then** as duas reproduções geram as
   mesmas decisões.

---

### User Story 7 - Controlador reutilizável (Priority: P3)

O desenvolvedor do spec de treinadores usa o mesmo controlador, trocando o perfil e ligando as decisões de
troca de Pokémon e uso de item.

**Why this priority**: evita uma segunda IA, mas só gera valor no spec de treinadores.

**Independent Test**: instanciar o controlador com um perfil que não é de selvagem e verificar que os pontos
de decisão existem e não fazem nada.

**Acceptance Scenarios**:

1. **Given** um perfil novo em dados, **When** o controlador o recebe, **Then** funciona sem alterar código.
2. **Given** os pontos de decisão de troca e item, **When** chamados nesta etapa, **Then** não têm efeito.
3. **Given** o componente de linha de visão, **When** usado fora da percepção de Pokémon, **Then** responde
   por si só se um ponto enxerga outro.

### Edge Cases

- Alvo morre, desconecta ou sai do mapa no meio da luta: a IA descarta o alvo e a memória dele.
- Todos os adversários fora do alcance de ativação: a IA fica dormente sem custo de processamento.
- Nenhum golpe pronto: a IA se posiciona ou reposiciona em vez de agir.
- Todos os golpes imunes ou de pontuação mínima: a IA usa o melhor disponível ou espera.
- Encurralado em Fuga ou Reposicionamento: a IA volta a lutar.
- Dois adversários empatados em ameaça: o desempate é determinístico pela semente.
- Selvagem em Retorno é atacado: ignora a provocação pelo tempo curto definido.
- Terreno bloqueia o caminho (água, ressalto, borda): a IA contorna ou desiste, sem violar a colisão.
- Perfil com valor inválido ou ausente: rejeitado na carga dos dados com erro claro.
- Jogador entra ou sai da sessão durante a luta: tabela de ameaça e memória se ajustam.

## Requirements *(mandatory)*

### Functional Requirements

**Princípio geral**

- **FR-001**: A IA MUST produzir apenas os comandos de input que um jogador produziria (mover, mirar, usar
  golpe N, recolher), sujeita às mesmas regras de cooldown, conjuração, hitbox, velocidade e status.
- **FR-002**: A IA MUST usar só informação que um jogador teria (o que vê, ouve e lembra); não MUST conhecer
  cooldowns do adversário nem posições nunca vistas.
- **FR-003**: Perfis, temperamentos e pesos de decisão MUST estar em dados, sem constantes de comportamento no código.
- **FR-004**: A IA MUST usar o gerador aleatório com semente do servidor, de modo que sessões gravadas
  reproduzam as mesmas decisões.

**Percepção**

- **FR-005**: A visão MUST ser um cone com alcance e ângulo do perfil, bloqueada pelos obstáculos da grade de colisão.
- **FR-006**: A audição MUST ser por raio, com correr e usar golpes fazendo mais ruído que andar; ouvir faz a
  IA olhar na direção do som sem localizar a posição exata.
- **FR-007**: A IA MUST guardar a última posição vista de cada alvo por um tempo do perfil, ir até ela e
  procurar antes de desistir.
- **FR-008**: O componente de linha de visão MUST ser independente da IA de combate, para reuso.

**Decisão**

- **FR-009**: A IA MUST ter os estados Ocioso, Alerta, Aproximação, Combate, Reposicionamento, Fuga, Retorno e
  Incapacitado, com as transições descritas nas histórias.
- **FR-010**: Ocioso MUST vagar dentro da zona de origem evitando água, ressaltos e bordas, com paradas,
  olhares e animações de espera.
- **FR-011**: Alerta MUST mostrar o balão de "!" e decidir entre aproximar, observar ou fugir, conforme o temperamento.
- **FR-012**: Os temperamentos passivo, arisco, agressivo e territorial MUST definir as transições conforme as
  histórias.
- **FR-013**: O limiar de fuga por HP MUST vir do perfil e do temperamento, e abaixo dele a IA pode trocar
  Combate por Fuga.
- **FR-014**: Após escapar de uma Poké Ball, o selvagem MUST ficar agressivo por um tempo em dados, independentemente do temperamento.
- **FR-015**: Em Retorno (além do raio máximo ou alvo perdido), a IA MUST voltar à zona e ignorar provocações
  por um tempo curto.
- **FR-016**: Em Incapacitado a IA MUST não decidir nada até se recuperar.

**Alvo e golpe**

- **FR-017**: Cada IA MUST manter uma tabela de ameaça por adversário, alimentada por dano recebido,
  proximidade e quem atacou primeiro.
- **FR-018**: A troca de alvo MUST ocorrer só quando outro adversário superar o atual pela margem do perfil.
- **FR-019**: A cada intervalo de decisão do perfil (não a cada tick), cada golpe pronto MUST receber pontuação
  de dano esperado, chance de acertar e utilidade.
- **FR-020**: A utilidade MUST seguir as regras: status só em alvo sem status; buffs no começo da luta ou em
  segurança; cura com HP baixo; imunidade com pontuação mínima conforme o conhecimento de tipos do perfil.
- **FR-021**: A escolha final MUST ser aleatória ponderada pelas pontuações, com a temperatura do perfil.

**Ação**

- **FR-022**: O movimento MUST ser em 8 direções, com as mesmas regras de um Pokémon de jogador.
- **FR-023**: A distância preferida MUST depender dos golpes disponíveis: mais golpes corpo a corpo aproximam,
  mais golpes à distância mantêm distância e movem lateralmente.
- **FR-024**: A mira MUST ter erro angular e tempo de reação do perfil, e perfis avançados MUST antecipar o
  movimento do alvo.
- **FR-025**: A esquiva de golpes em preparação MUST usar chance e tempo de reação do perfil.
- **FR-026**: Todo golpe da IA MUST exibir a preparação visível do arquétipo antes de sair; nenhum golpe sai sem aviso.

**Perfis**

- **FR-027**: Um perfil MUST conter tempo de reação, erro de mira, antecipação, conhecimento de tipos, chance
  de esquiva, intervalo de decisão, temperatura, alcance de visão, alcance de audição e limiar de fuga.
- **FR-028**: Os selvagens MUST receber o perfil por faixa de nível, numa tabela em dados.
- **FR-029**: O formato do perfil MUST comportar o mapeamento futuro das flags de IA originais dos treinadores,
  sem fazê-lo nesta etapa.
- **FR-030**: O controlador MUST expor pontos de decisão para trocar de Pokémon e usar item, sem efeito nesta etapa.

**Desempenho e depuração**

- **FR-031**: IAs longe de todos os jogadores MUST ficar dormentes, sem gastar processamento.
- **FR-032**: Percepção e decisão MUST rodar em intervalos e de forma escalonada entre as IAs.
- **FR-033**: Uma sobreposição de desenvolvimento MUST mostrar, por IA, estado, alvo, cone de visão, última
  posição lembrada, raio da zona e pontuações da última decisão.
- **FR-034**: As decisões MUST poder ser registradas em log para análise de sessões gravadas.

### Key Entities

- **Controlador de IA**: estado atual, alvo, memória, tabela de ameaça e relógios de decisão de um Pokémon sem jogador.
- **Perfil de habilidade**: parâmetros nomeados de habilidade (FR-027).
- **Tabela de perfis por nível**: associa faixas de nível a perfis para selvagens.
- **Temperamento**: regras de transição e pesos (limiar de fuga, peso de revide, raio de tolerância).
- **Memória de alvo**: última posição vista de um adversário e quanto tempo ainda vale.
- **Tabela de ameaça**: pontuação por adversário.
- **Registro de decisão**: estado, alvo, pontuações e golpe escolhido, com o instante da decisão.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em cenários sem interface, um Pokémon de perfil forte com Ember contra um alvo de planta
  escolhe Ember em mais de 50% das decisões.
- **SC-002**: Em 100% dos cenários com parede entre o selvagem e o jogador, o selvagem não percebe o jogador pela visão.
- **SC-003**: Um selvagem passivo com HP abaixo do limiar foge em 100% dos cenários testados.
- **SC-004**: Um territorial para de perseguir ao sair do raio e um selvagem puxado além do raio máximo volta
  à zona, em 100% dos cenários testados.
- **SC-005**: Em todas as lutas simuladas, a IA usa 0 golpes em cooldown e 0 golpes sem preparação visível.
- **SC-006**: Em 100 lutas simuladas do inicial no nível 5 (bot de referência) contra selvagens da Route 29, o
  inicial vence pelo menos 90%.
- **SC-007**: Com 30 IAs ativas e 4 jogadores, o tick permanece dentro do orçamento do servidor, sem lentidão
  perceptível para os jogadores.
- **SC-008**: Duas reproduções da mesma sessão gravada geram sequências de decisões idênticas.
- **SC-009**: Em grupo de 4, o selvagem não troca de alvo enquanto a diferença de ameaça estiver abaixo da margem do perfil.
- **SC-010**: A sobreposição de depuração mostra estado, alvo e pontuações de qualquer IA ativa em tempo real.

## Assumptions

- Depende do combate em tempo real (spec 13), das regras de companheiro (spec 14) e dos selvagens e captura
  (spec 15), que definem arquétipos, cooldowns, tempos de conjuração, temperamentos e escape de Poké Ball.
- Os dados de tipos, golpes e estatísticas vêm da extração de dados do jogo (spec 4).
- O servidor autoritativo roda a IA; o cliente só exibe, incluindo o "!" e a sobreposição de depuração.
- A sobreposição de depuração e o log de decisões são ferramentas de desenvolvimento, desligadas por padrão e fora da experiência do jogador.
- O orçamento do tick do servidor é o definido pelos specs anteriores; este spec só exige não estourá-lo.
- Os valores de perfis, pesos, margens e tempos serão calibrados em dados e registrados no log de balanceamento.
- Fora do escopo: batalhas contra treinadores, linha de visão de NPCs treinadores, troca de Pokémon e uso de
  itens pela IA, mapeamento das flags de IA originais, IA de lendários e chefes, grupos e bandos de
  selvagens, e comportamentos na água (spec de golpes de campo).
