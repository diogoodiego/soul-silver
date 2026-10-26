# Feature Specification: Interface básica, menu inicial e controles

**Feature Branch**: `017-ui-menus-controls`

**Created**: 2026-10-25

**Status**: Draft

**Input**: User description: "Interface básica, menu inicial e controles: a tela de título, o menu inicial, os menus e o HUD essenciais sobre o jogo, e o mapeamento de controles para teclado, mouse e gamepad."

## Contexto

O jogo não deve começar direto no mapa: precisa de uma tela de título e de um menu que leve a cada
modo de jogo. A fatia jogável também precisa de equipe, mochila, Pokédex, diálogos e um HUD de combate
legível. Como o mundo é compartilhado e em tempo real (princípio VII), abrir um menu nunca pausa o
jogo, e a interface deixa isso claro. Toda ação que muda estado (reordenar equipe, usar item) é um
pedido ao servidor, que decide (princípio IV).

Atores:

- **Jogador**: navega pelos menus e joga com teclado e mouse ou com gamepad.
- **Outros jogadores da sessão**: veem quando o jogador está "ocupado" num menu.

Termos:

- **Menu completo**: equipe, mochila, Pokédex, configurações e o menu de pausa que leva a eles.
- **Dispositivo ativo**: o último dispositivo (teclado/mouse ou gamepad) que gerou entrada; define os ícones de botão exibidos.
- **Ação**: comando lógico (confirmar, cancelar, mover, menu, golpe 1–4…) ligado a teclas e botões.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Título e menu principal (Priority: P1)

Ao abrir o app com os assets prontos, o jogador vê a tela de título com a arte original, a versão do
app e "pressione qualquer botão". Qualquer tecla, clique ou botão leva ao menu principal: Jogar,
Configurações, Sobre e Sair.

**Why this priority**: É a porta de entrada do jogo; sem ela nada mais é alcançável.

**Independent Test**: Abrir o app com assets extraídos, pressionar um botão e navegar pelas quatro opções.

**Acceptance Scenarios**:

1. **Given** assets prontos, **When** o app abre, **Then** a primeira tela é o título, com arte original, versão e "pressione qualquer botão".
2. **Given** assets ausentes, **When** o app abre, **Then** a extração (spec 3) roda antes e só depois aparece o título.
3. **Given** a tela de título, **When** o jogador pressiona qualquer tecla, clique ou botão do gamepad, **Then** chega ao menu principal.
4. **Given** uma atualização já baixada (spec 2), **When** o menu principal aparece, **Then** ele avisa e oferece reiniciar para aplicar.
5. **Given** a opção Sobre, **When** escolhida, **Then** mostra versão, créditos e o aviso de projeto de fã sem afiliação com a Nintendo.
6. **Given** a opção Sair, **When** escolhida, **Then** o app fecha.

---

### User Story 2 - Escolher save e modo de jogo (Priority: P1)

Em Jogar, o jogador escolhe um dos 3 slots de save (nome, tempo de jogo, insígnias) ou cria um novo
jogo (nome e personagem), depois escolhe Sozinho, Hospedar ou Entrar; em Entrar, escolhe uma partida
da lista da LAN ou digita um IP. Este fluxo substitui a tela provisória do spec 12, com a mesma lógica.

**Why this priority**: Liga o menu ao jogo; é o caminho de toda sessão.

**Independent Test**: Continuar um save em Sozinho e chegar ao mapa em até 4 escolhas a partir do título.

**Acceptance Scenarios**:

1. **Given** saves existentes, **When** o jogador abre Jogar, **Then** vê os 3 slots com nome, tempo de jogo e insígnias, e slots vazios marcados como "novo jogo".
2. **Given** um slot vazio, **When** escolhido, **Then** o jogador informa nome (até o limite do jogo) e escolhe o personagem, e o save é criado.
3. **Given** um save escolhido, **When** o jogador escolhe Sozinho, **Then** entra no mapa onde salvou.
4. **Given** Hospedar, **When** escolhido, **Then** a sessão LAN é aberta como no spec 12 e o jogador entra no mapa.
5. **Given** Entrar, **When** escolhido, **Then** aparece a lista de partidas descobertas e um campo de IP; escolher uma ou digitar um IP válido conecta, e uma falha mostra a mensagem e volta à lista.
6. **Given** qualquer passo do fluxo, **When** o jogador cancela, **Then** volta ao passo anterior.

---

### User Story 3 - HUD de combate (Priority: P1)

Durante o combate o jogador vê HP, nível e status do Pokémon controlado; os 4 golpes com a cor do
tipo e o cooldown; a barra de HP sobre o alvo selvagem; e um resumo da equipe.

**Why this priority**: Sem informação legível o combate em tempo real não é jogável.

**Independent Test**: Entrar em combate em 1280×720 e 1920×1080 e conferir que todos os elementos aparecem e se atualizam.

**Acceptance Scenarios**:

1. **Given** combate ativo, **When** o Pokémon controlado sofre dano ou muda de status, **Then** HP e status no HUD refletem o estado do servidor.
2. **Given** um golpe usado, **When** ele entra em cooldown, **Then** o botão mostra o tempo restante e fica indisponível até zerar.
3. **Given** um selvagem em combate, **When** recebe dano, **Then** a barra de HP sobre ele diminui.
4. **Given** o resumo da equipe, **When** um membro desmaia, **Then** ele aparece como desmaiado.
5. **Given** o dispositivo ativo, **When** muda entre teclado e gamepad, **Then** os ícones dos golpes mostram as teclas ou botões correspondentes.

---

### User Story 4 - Diálogos com sim ou não (Priority: P1)

O jogador lê textos do catálogo (spec 5) com variáveis, avança e responde perguntas de sim ou não.

**Why this priority**: Base do interpretador de scripts (spec 19) e de toda interação com NPCs.

**Independent Test**: Exibir um diálogo com o nome do jogador e uma pergunta, responder as duas opções e conferir o resultado.

**Acceptance Scenarios**:

1. **Given** um texto com a variável de nome do jogador, **When** exibido, **Then** o nome aparece substituído.
2. **Given** o texto sendo escrito, **When** o jogador confirma, **Then** o texto completa na hora; ao confirmar de novo, avança.
3. **Given** uma pergunta, **When** o jogador escolhe Sim ou Não, **Then** a resposta escolhida é entregue a quem abriu o diálogo; cancelar equivale a Não.
4. **Given** a velocidade do texto nas configurações, **When** alterada, **Then** os próximos diálogos usam a nova velocidade.

---

### User Story 5 - Equipe, mochila e Pokédex (Priority: P2)

O jogador abre o menu e vê a equipe (até 6, com stats, golpes, natureza, habilidade e XP) e a
reordena; usa Poké Balls e Potions da mochila; consulta a Pokédex de vistos e capturados.

**Why this priority**: Necessário para a fatia jogável, mas o combate e a navegação funcionam sem ele.

**Independent Test**: Reordenar a equipe, usar uma Potion fora do combate e abrir a entrada de uma espécie capturada.

**Acceptance Scenarios**:

1. **Given** a equipe, **When** o jogador move um membro para outra posição, **Then** a nova ordem é confirmada pelo servidor e persiste no save.
2. **Given** um membro selecionado, **When** o jogador abre o resumo, **Then** vê stats, golpes, natureza, habilidade e XP até o próximo nível.
3. **Given** a mochila, **When** aberta, **Then** mostra os bolsos do original com seus itens e quantidades.
4. **Given** uma Potion e um Pokémon ferido, **When** usada, **Then** o HP sobe conforme o item e a quantidade cai em 1.
5. **Given** um item que ainda não funciona (spec 24), **When** selecionado, **Then** aparece como indisponível e não é consumido.
6. **Given** a Pokédex, **When** aberta, **Then** lista as espécies vistas e capturadas, e uma capturada mostra a entrada do catálogo de textos; uma só vista mostra apenas nome e imagem.

---

### User Story 6 - Menus não pausam o mundo (Priority: P2)

Abrir um menu no jogo não pausa nada. Os outros jogadores veem o jogador como "ocupado". Durante o
combate, menus completos ficam bloqueados.

**Why this priority**: Regra do mundo compartilhado; evita abuso e confusão.

**Independent Test**: Com dois jogadores, abrir a mochila num e ver o indicador "ocupado" no outro, enquanto selvagens continuam se movendo.

**Acceptance Scenarios**:

1. **Given** um menu aberto, **When** o tempo passa, **Then** NPCs, selvagens e outros jogadores continuam se movendo e o menu indica que o jogo não está pausado.
2. **Given** um jogador num menu, **When** outro jogador o vê, **Then** ele aparece com o indicador "ocupado", que some ao fechar o menu.
3. **Given** combate ativo, **When** o jogador tenta abrir um menu completo, **Then** o menu não abre e o jogador vê o motivo.
4. **Given** um menu aberto, **When** um selvagem inicia combate com o jogador, **Then** o menu fecha e o HUD de combate aparece.

---

### User Story 7 - Controles e configurações (Priority: P2)

O jogador joga só com gamepad ou só com teclado e mouse, remapeia teclas e ajusta janela, tela cheia,
velocidade do texto e escala da interface.

**Why this priority**: Acessibilidade e conforto; os padrões já permitem jogar.

**Independent Test**: Remapear uma ação, reiniciar o app e confirmar que o novo mapeamento persiste e funciona.

**Acceptance Scenarios**:

1. **Given** um gamepad padrão Xbox, **When** conectado, **Then** todas as ações funcionam com o layout padrão sem configuração.
2. **Given** a tela de controles, **When** o jogador escolhe uma ação e pressiona uma tecla nova, **Then** a ação passa a usar essa tecla.
3. **Given** uma tecla já usada por outra ação, **When** atribuída, **Then** as duas ações trocam de tecla e o jogador é avisado.
4. **Given** "restaurar padrões", **When** escolhido, **Then** o mapeamento volta ao original.
5. **Given** alterações de janela, tela cheia, velocidade do texto ou escala, **When** aplicadas, **Then** têm efeito imediato e persistem entre execuções.

---

### Edge Cases

- Gamepad desconectado no meio do jogo: o dispositivo ativo volta para teclado e mouse sem travar a interface.
- Arte de título ausente nos assets extraídos de uma versão anterior: o extrator gera a etapa que falta antes de mostrar o título.
- Conexão em Entrar falha ou o host some: mensagem clara e retorno à lista de partidas.
- IP digitado inválido: o campo rejeita antes de tentar conectar.
- Slot de save corrompido: aparece como ilegível e não pode ser carregado, mas pode ser sobrescrito com confirmação.
- Equipe com 1 Pokémon: reordenar não está disponível.
- Pedido ao servidor (usar item, reordenar) recusado ou sem resposta: a interface volta ao estado anterior e informa.
- Remapear para uma tecla reservada (ex.: tecla de sistema): recusado.
- Escala da interface máxima em 1280×720: nenhum elemento do HUD fica cortado.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A tela de título MUST ser a primeira tela após a extração de assets e mostrar a arte de título original, a versão do app e "pressione qualquer botão".
- **FR-002**: Se a arte de título não estiver entre os assets extraídos, o extrator MUST passar a extraí-la, sem que a arte seja distribuída com o app (princípio II).
- **FR-003**: O menu principal MUST oferecer Jogar, Configurações, Sobre e Sair, e MUST avisar de atualização baixada com opção de reiniciar.
- **FR-004**: O fluxo Jogar MUST ter os passos save → modo → (em Entrar) partida/IP, reaproveitando a lógica de sessões e saves do spec 12 e substituindo sua tela provisória.
- **FR-005**: A seleção de save MUST mostrar 3 slots com nome, tempo de jogo e insígnias, e permitir criar novo jogo com nome e personagem.
- **FR-006**: A tela Sobre MUST mostrar versão, créditos e o aviso de projeto de fã sem afiliação com a Nintendo.
- **FR-007**: O HUD de combate MUST mostrar HP, nível e status do Pokémon controlado; os 4 golpes com cor do tipo e cooldown; HP do alvo selvagem; e resumo da equipe.
- **FR-008**: A tela de equipe MUST listar até 6 membros, mostrar o resumo (stats, golpes, natureza, habilidade, XP) e permitir reordenar.
- **FR-009**: A mochila MUST ter os bolsos do original; nesta etapa só Poké Balls e Potions MUST funcionar, os demais aparecem como indisponíveis.
- **FR-010**: A Pokédex MUST listar vistos e capturados, com a entrada de cada espécie capturada vinda do catálogo de textos.
- **FR-011**: A caixa de diálogo MUST usar o catálogo de textos com variáveis, suportar avanço, completar o texto ao confirmar, escolha sim/não e velocidade configurável, e MUST expor a resposta a quem abriu o diálogo.
- **FR-012**: Menus dentro do jogo MUST NOT pausar a simulação; o estado "ocupado" MUST ser enviado ao servidor e mostrado aos outros jogadores.
- **FR-013**: Menus completos MUST ficar bloqueados durante combate, e um combate iniciado com menu aberto MUST fechá-lo.
- **FR-014**: Configurações MUST incluir tamanho da janela, tela cheia, velocidade do texto, escala da interface e controles, e MUST persistir entre execuções.
- **FR-015**: Todas as ações MUST ser remapeáveis no teclado, com troca em caso de conflito e opção de restaurar padrões.
- **FR-016**: O gamepad MUST funcionar com o layout padrão Xbox sem configuração.
- **FR-017**: Os ícones de botão MUST seguir o dispositivo ativo automaticamente.
- **FR-018**: Todas as telas, do título ao combate, MUST ser operáveis só com gamepad e só com teclado e mouse.
- **FR-019**: Todos os textos da interface MUST passar pela estrutura de i18n.
- **FR-020**: Ações que mudam estado (reordenar, usar item) MUST ser pedidos ao servidor; a interface só mostra o resultado confirmado.

### Key Entities

- **Slot de save (resumo)**: índice 1–3, nome do jogador, tempo de jogo, insígnias, estado (vazio, válido, ilegível).
- **Configurações**: janela, tela cheia, velocidade do texto, escala da interface, mapeamento de controles.
- **Mapeamento de controles**: ação → tecla(s) e botão do gamepad.
- **Pedido de diálogo**: chave do catálogo, variáveis, tipo (texto ou sim/não) e resposta.
- **Estado de presença**: livre, ocupado em menu, em combate.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Com assets prontos, o app abre na tela de título, e quem continua um save jogando sozinho chega ao mapa em no máximo 4 escolhas.
- **SC-002**: 100% das telas, do título ao combate, são percorridas do início ao fim só com gamepad e só com teclado e mouse.
- **SC-003**: Em 1280×720 e 1920×1080, todos os elementos do HUD de combate ficam visíveis, sem cortes nem sobreposição, em todas as escalas de interface.
- **SC-004**: Um diálogo com o nome do jogador e uma pergunta sim/não exibe o nome correto e devolve a resposta escolhida em 100% dos testes.
- **SC-005**: O indicador "ocupado" aparece para os outros jogadores em até 1 segundo após abrir um menu e some em até 1 segundo após fechá-lo.
- **SC-006**: Remapeamentos e configurações persistem após reiniciar o app em 100% dos casos.

## Assumptions

- Os bolsos da mochila e os nomes dos itens vêm dos dados extraídos (spec 4); textos de espécie, do catálogo (spec 5).
- A escolha de personagem no novo jogo oferece os dois protagonistas do original.
- Cancelar uma pergunta sim/não equivale a Não, como no original.
- A velocidade do texto tem três níveis (lenta, média, rápida), como no original.
- O mouse opera menus por clique; no mapa e no combate, o mouse segue as regras já definidas nos specs 11 e 13.
- Configurações ficam no PC do jogador, junto às preferências do app (princípio VIII), não no save.
- Usar Poké Ball fora de combate não é permitido; dentro do combate segue o spec 15.

## Fora do escopo

Música e efeitos sonoros (spec 18), lojas, PC e Centro Pokémon (spec 21), Pokégear (spec 23), telas
de troca e PvP (spec 25), demais itens da mochila (spec 24), interpretador de scripts (spec 19) e a
introdução do Prof. Oak (Marco 3).
