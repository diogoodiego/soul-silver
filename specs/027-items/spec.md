# Feature Specification: Itens

**Feature Branch**: `027-items`

**Created**: 2026-11-07

**Status**: Draft

**Input**: User description: "Itens: todos os bolsos da mochila, uso de itens no campo e em combate em tempo real, itens segurados, TMs e HMs, pedras de evolução, berries e apricorns, itens no chão e escondidos, e itens encontrados pelo companheiro."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Usar itens durante o combate (Priority: P1)

O jogador está numa luta e abre o seletor rápido de itens. Escolhe uma Potion, um item de status ou um item de batalha e o usa no Pokémon do companheiro. Usar o item é uma ação do treinador: leva um tempo, durante o qual o Pokémon pode ser atingido, e depois entra em recarga antes de outro item poder ser usado. O seletor funciona com gamepad sem tirar o controle do Pokémon.

**Why this priority**: Até aqui só Poké Balls e Potions funcionam. O uso em combate é o que dá estratégia aos itens e define como o resto (PP, berries, Repel) se encaixa no tempo real.

**Independent Test**: Numa luta no servidor sem interface, usar uma Potion com o Pokémon ferido e conferir tempo de uso, dano recebido durante o uso, cura e recarga.

**Acceptance Scenarios**:

1. **Given** uma Potion na mochila e o Pokémon ferido, **When** o jogador a usa em combate, **Then** a cura só acontece ao fim do tempo de uso e o item sai da mochila.
2. **Given** o uso em andamento, **When** um inimigo acerta o Pokémon, **Then** o dano é aplicado normalmente e o uso não é cancelado, salvo se o Pokémon desmaiar.
3. **Given** um item recém-usado, **When** o jogador tenta usar outro antes do fim da recarga, **Then** o uso é recusado.
4. **Given** um item que o jogador não tem, **When** o cliente pede o uso, **Then** o servidor recusa e a mochila não muda.
5. **Given** um item de status (como Antidote ou Full Heal), **When** usado num Pokémon com o status certo, **Then** o status é removido; num Pokémon sem o status, o uso é recusado sem gastar o item.
6. **Given** o seletor aberto com gamepad, **When** o jogador navega e confirma, **Then** o Pokémon continua respondendo aos controles de movimento e ataque.

---

### User Story 2 - Itens de PP reinterpretados para cooldown (Priority: P1)

Como PP virou cooldown, Ether, Elixir, PP Up e PP Max passam a agir sobre os cooldowns dos golpes. Ether e Elixir zeram ou encurtam a recarga dos golpes; PP Up e PP Max reduzem permanentemente a recarga do golpe escolhido, até o limite original de usos de PP Up. Cada reinterpretação fica registrada em `docs/balance-log.md`.

**Why this priority**: Sem isso quatro itens clássicos ficam sem efeito. É decisão de equilíbrio que precisa estar documentada.

**Independent Test**: Usar cada um dos quatro itens num Pokémon com golpes em recarga e conferir o novo estado dos cooldowns e a entrada correspondente no registro de equilíbrio.

**Acceptance Scenarios**:

1. **Given** um golpe em recarga, **When** o jogador usa Ether nele, **Then** a recarga é reduzida conforme o dado do item.
2. **Given** um Pokémon com golpes em recarga, **When** o jogador usa Elixir, **Then** o efeito do Ether vale para todos os golpes.
3. **Given** um golpe com menos de 3 PP Ups aplicados, **When** o jogador usa PP Up, **Then** a recarga base do golpe diminui e o contador sobe; com o limite atingido, o uso é recusado.
4. **Given** PP Max, **When** usado, **Then** o golpe chega direto ao limite de PP Ups.
5. **Given** os quatro itens, **When** o registro de equilíbrio é consultado, **Then** cada um tem a regra original, a reinterpretação e o motivo.

---

### User Story 3 - Itens segurados funcionam sozinhos (Priority: P1)

O jogador entrega um item a um Pokémon e ele passa a agir sem comando: berries de cura se consomem ao cruzar o limiar de HP, berries de status removem o status, e itens como Leftovers, Choice Band, Focus Sash e Quick Claw têm seus efeitos originais adaptados ao tempo real. Cada efeito é descrito em dados, como os arquétipos de golpe.

**Why this priority**: É a parte da estratégia que não depende de apertar nada e faz parte de quase toda luta de nível mais alto.

**Independent Test**: Numa luta no servidor sem interface, um Pokémon com Oran Berry cruza o limiar de HP e a berry é consumida sozinha, com a cura aplicada e o item removido.

**Acceptance Scenarios**:

1. **Given** um Pokémon segurando uma berry de cura, **When** o HP cruza o limiar durante a luta, **Then** a berry é consumida, o Pokémon é curado e o item some do Pokémon.
2. **Given** um Pokémon segurando uma berry de status, **When** recebe o status correspondente, **Then** a berry é consumida e o status removido.
3. **Given** um item segurado de efeito contínuo ou condicional, **When** a condição ocorre, **Then** o efeito acontece como descrito nos dados do item.
4. **Given** um item segurado sem efeito mapeado, **When** o relatório de cobertura roda, **Then** ele aparece na lista.
5. **Given** o jogador tenta dar, trocar ou tirar um item segurado, **When** o pedido chega, **Then** o servidor valida posse e Pokémon antes de aplicar.

---

### User Story 4 - Ensinar golpes e evoluir com pedras (Priority: P2)

O jogador usa uma TM ou HM num Pokémon compatível e escolhe qual golpe esquecer se ele já souber quatro. Usa uma pedra de evolução num Pokémon que evolui com ela e a evolução acontece. TMs são consumidas; HMs não.

**Why this priority**: Amplia as opções do time e destrava HMs do campo, mas não é necessária para o combate básico.

**Independent Test**: Para cada TM e HM, conferir a compatibilidade contra o learnset extraído; usar uma pedra num Pokémon compatível e num incompatível.

**Acceptance Scenarios**:

1. **Given** uma TM compatível com o learnset do Pokémon, **When** o jogador a usa, **Then** o Pokémon aprende o golpe, a TM é consumida e, se ele sabia quatro golpes, o jogador escolhe qual esquecer.
2. **Given** uma HM compatível, **When** usada, **Then** o golpe é aprendido e a HM permanece na mochila.
3. **Given** uma TM ou HM incompatível, **When** o jogador tenta usá-la, **Then** o uso é recusado sem gastar o item.
4. **Given** uma pedra de evolução e um Pokémon que evolui com ela, **When** usada, **Then** o Pokémon evolui conforme os dados extraídos e a pedra é consumida.
5. **Given** uma pedra num Pokémon que não evolui com ela, **When** usada, **Then** o uso é recusado sem gastar a pedra.

---

### User Story 5 - Colher berries e apricorns e levar ao Kurt (Priority: P2)

O jogador colhe berries e apricorns de árvores que seguem o ciclo original de crescimento: plantar, crescer em estágios, dar frutos e rebrotar. Leva apricorns ao Kurt, que os transforma em bolas especiais (Fast, Level, Lure, Heavy, Love, Friend, Moon) e as entrega no prazo original. Cada bola especial tem o modificador de captura original.

**Why this priority**: Fecha o ciclo de coleta e dá acesso às bolas especiais, mas depende de itens e relógio já existentes.

**Independent Test**: Com o relógio injetado, avançar uma árvore por todos os estágios e colher; entregar apricorns ao Kurt e conferir o prazo.

**Acceptance Scenarios**:

1. **Given** uma árvore com frutos, **When** o jogador a colhe, **Then** recebe a quantidade original e a árvore volta ao ciclo.
2. **Given** uma berry plantada, **When** o relógio avança pelos estágios originais, **Then** a árvore cresce e volta a dar frutos no prazo original.
3. **Given** apricorns na mochila, **When** o jogador os entrega ao Kurt, **Then** o Kurt aceita e promete a bola correspondente para o prazo original.
4. **Given** o prazo do Kurt cumprido, **When** o jogador volta, **Then** recebe a bola; antes do prazo, a bola não é entregue.
5. **Given** cada bola especial, **When** usada em captura, **Then** vale o modificador original dela.
6. **Given** as árvores de dois jogadores, **When** A colhe uma árvore, **Then** o estado de B não muda.

---

### User Story 6 - Itens no chão, escondidos e achados pelo companheiro (Priority: P2)

O jogador pega itens visíveis no chão, acha itens escondidos com a ajuda do Dowsing MCHN e recebe itens que o companheiro encontra em certos lugares, conforme as tabelas originais. Cada item pego é por jogador: o que A pega continua disponível para B.

**Why this priority**: Recompensa a exploração e faz parte do caminho até Violet City, mas o jogo funciona sem ela.

**Independent Test**: Dois jogadores na mesma sessão; A pega um item do chão e B ainda o encontra; a sonda acha os itens escondidos das rotas 29 a 31.

**Acceptance Scenarios**:

1. **Given** um item no chão, **When** o jogador interage, **Then** o item vai para o bolso certo e some só para ele.
2. **Given** os jogadores A e B, **When** A pega um item, **Then** o item continua disponível para B.
3. **Given** um item escondido e o Dowsing MCHN, **When** o jogador chega perto, **Then** o aparelho aponta a direção e a proximidade e o jogador pode pegá-lo.
4. **Given** um item escondido sem o Dowsing MCHN, **When** o jogador interage no ponto exato, **Then** ainda pode pegá-lo, como no original.
5. **Given** o companheiro num lugar com tabela de achados, **When** o intervalo original se cumpre, **Then** ele traz um item conforme a tabela do lugar.
6. **Given** a mochila cheia no bolso do item, **When** o jogador tenta pegá-lo, **Then** o item permanece no mundo e o jogador é avisado.

---

### User Story 7 - Repel e itens de campo (Priority: P3)

O jogador usa um Repel (Repel, Super Repel ou Max Repel). Pela duração original convertida para tempo, selvagens de nível menor que o do companheiro não se aproximam nem atacam, e a densidade de spawns perto do jogador cai. Itens de campo como Escape Rope, Berries curativas e itens de cura fora de combate funcionam no mapa.

**Why this priority**: Conveniência e completude; não bloqueia o caminho dourado.

**Independent Test**: Usar um Repel, conferir que um selvagem de nível menor não se aproxima, um de nível maior sim, e que o efeito acaba no prazo.

**Acceptance Scenarios**:

1. **Given** um Repel ativo, **When** um selvagem de nível menor que o do companheiro está por perto, **Then** ele não se aproxima nem ataca.
2. **Given** um Repel ativo, **When** um selvagem de nível igual ou maior aparece, **Then** ele age normalmente.
3. **Given** um Repel ativo, **When** os spawns são sorteados perto do jogador, **Then** a densidade é menor que sem Repel.
4. **Given** o fim da duração original convertida, **When** o tempo passa, **Then** o efeito termina e o jogador é avisado.
5. **Given** a mochila, **When** o jogador usa um item de campo permitido, **Then** o efeito vale fora de combate; itens só de combate são recusados no mapa.

---

### User Story 8 - Mochila completa e cobertura (Priority: P2)

A mochila tem todos os bolsos do HeartGold/SoulSilver (itens, medicina, Poké Balls, TMs e HMs, berries, correio, itens de batalha, itens-chave) com os limites originais de itens e de pilha. Correio e acessórios só são guardados. Um relatório de cobertura lista todo item sem efeito mapeado.

**Why this priority**: Toda a feature depende dos bolsos; o relatório garante que nada obtível até Violet City fica mudo.

**Independent Test**: Rodar o relatório de cobertura e conferir que nenhum item obtível até Violet City aparece sem efeito.

**Acceptance Scenarios**:

1. **Given** cada bolso, **When** o jogador o enche, **Then** o limite original de espécies e de quantidade por pilha é respeitado.
2. **Given** o relatório de cobertura, **When** roda, **Then** lista cada item sem efeito mapeado e sai com falha se algum item obtível até Violet City estiver na lista.
3. **Given** um item de correio ou acessório, **When** obtido, **Then** é guardado no bolso certo sem efeito de uso.

---

### Edge Cases

- Pokémon desmaia durante o tempo de uso de um item: o uso é cancelado e o item não é gasto.
- Dois pedidos de uso simultâneos do mesmo item de quantidade 1: só um é aceito.
- Berry segurada cruza o limiar com o HP já em zero: não é consumida.
- Item cuja cura excede o HP máximo: cura até o máximo, sem desperdício além do original.
- Pokémon com golpes em recarga recebe PP Up que já está no limite: recusado, sem gastar o item.
- TM de golpe que o Pokémon já sabe: recusada.
- Pedra usada num Pokémon que já evoluiu ou não evolui: recusada.
- Árvore colhida e relógio do host ajustado para trás: o ciclo não regride nem duplica frutos.
- Apricorns entregues ao Kurt quando ele já tem uma bola em produção: segue o comportamento original.
- Mochila cheia ao receber item do Kurt, do chão ou do companheiro: o item fica onde está e o jogador é avisado.
- Repel termina no meio de uma luta: selvagens já em combate seguem como estão.
- Jogador desconecta durante o uso: o item é gasto só se o efeito foi aplicado.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A mochila MUST ter todos os bolsos do HGSS, com os itens e os limites originais de espécies e de quantidade por pilha, vindos dos dados extraídos.
- **FR-002**: O uso de item em combate MUST ser uma ação do treinador, com tempo de uso e recarga definidos em dados, escolhida por um seletor rápido.
- **FR-003**: O Pokémon MUST poder ser atingido durante o tempo de uso, e o uso MUST ser cancelado sem gastar o item se ele desmaiar.
- **FR-004**: O seletor rápido MUST ser operável com gamepad sem tirar do jogador o controle do Pokémon.
- **FR-005**: Ether, Elixir, PP Up e PP Max MUST agir sobre os cooldowns dos golpes, e cada reinterpretação MUST ser registrada em `docs/balance-log.md`.
- **FR-006**: Repel, Super Repel e Max Repel MUST impedir que selvagens de nível menor que o do companheiro se aproximem ou ataquem, e MUST reduzir a densidade de spawns perto do jogador, pela duração original convertida para tempo.
- **FR-007**: Itens segurados MUST ter os efeitos originais adaptados ao tempo real, descritos em dados como os arquétipos de golpe, e MUST agir sem comando do jogador.
- **FR-008**: Berries seguradas MUST ser consumidas sozinhas ao cruzar o limiar de HP ou ao receber o status correspondente durante uma luta.
- **FR-009**: TMs e HMs MUST respeitar os learnsets extraídos; TMs MUST ser consumidas, HMs não.
- **FR-010**: Pedras de evolução MUST evoluir apenas os Pokémon que evoluem com elas segundo os dados extraídos, e MUST ser consumidas.
- **FR-011**: Árvores de berry e de apricorn MUST seguir o ciclo original de crescimento e de produção, medido pelo relógio da sessão.
- **FR-012**: O Kurt MUST transformar apricorns em bolas especiais com o prazo original, e cada bola MUST ter o modificador de captura original.
- **FR-013**: Itens no chão e itens escondidos MUST vir dos eventos extraídos, com flags por jogador (princípio VII), de modo que o que um jogador pega continue disponível para os outros.
- **FR-014**: O Dowsing MCHN MUST ajudar a achar itens escondidos, indicando direção e proximidade.
- **FR-015**: O companheiro MUST encontrar itens conforme as tabelas originais por lugar.
- **FR-016**: Toda alteração de itens (uso, entrega, troca de segurado, coleta, entrega do Kurt, achado do companheiro) MUST ser validada no servidor, que recusa o que o jogador não tem, o que é incompatível e o que excede limites.
- **FR-017**: Um relatório de cobertura MUST listar todo item sem efeito mapeado, no mesmo molde do relatório de golpes, e MUST falhar se algum item obtível até Violet City estiver sem efeito.
- **FR-018**: A mochila, os itens segurados, os estados de árvores e do Kurt e as coletas MUST ser salvos no progresso do jogador (princípios VII e VIII).
- **FR-019**: Os novos tipos de mensagem e de dados MUST ser versionados (princípio VI), com a versão do protocolo incrementada.
- **FR-020**: Dados de efeito, tempos de uso e recargas de itens MUST estar em arquivos de dados, não espalhados no código.

### Fora do escopo

- Correio e Acessórios além de guardá-los.
- Itens de troca (spec 028).
- Itens exclusivos do pós-jogo.

### Key Entities *(include if feature involves data)*

- **Item**: definição extraída com bolso, preço, limite de pilha e efeito mapeado.
- **Bolso**: categoria da mochila, com limite de espécies e de quantidade.
- **Mochila**: itens do jogador por bolso e quantidade; progresso por jogador.
- **Uso de item**: ação do treinador com alvo, tempo de uso e recarga.
- **Efeito de item**: descrição em dados do que o item faz (cura, status, batalha, PP, repelente, segurado, ensino, evolução).
- **Item segurado**: item ligado a um Pokémon, com gatilho e consumo.
- **Árvore de fruto**: berry ou apricorn com estágio e momento de plantio ou colheita.
- **Encomenda do Kurt**: apricorns entregues, bola prometida e prazo.
- **Bola especial**: bola com modificador de captura.
- **Item de mundo**: item no chão ou escondido, com flag de coleta por jogador.
- **Achado do companheiro**: tabela de itens por lugar e intervalo.
- **Repelente ativo**: efeito com nível-limite e duração restante.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos testes de uso de item sem posse, incompatíveis ou acima dos limites, o servidor recusa e a mochila fica idêntica.
- **SC-002**: Usar uma Potion em combate respeita o tempo de uso: a cura nunca ocorre antes do fim, e o Pokémon sofre dano durante o uso.
- **SC-003**: Cada efeito de item segurado mapeado e cada reinterpretação de PP tem ao menos um teste passando.
- **SC-004**: Cada bola especial tem o modificador original de captura (todas as bolas conferidas).
- **SC-005**: O que um jogador coleta no mundo ou nas árvores não altera o estado de nenhum outro jogador (0 vazamentos nos cenários multijogador).
- **SC-006**: O relatório de cobertura não lista nenhum item obtível até Violet City.
- **SC-007**: A sonda encontra com o Dowsing MCHN todos os itens escondidos das rotas 29 a 31 presentes nos eventos extraídos.
- **SC-008**: Todos os casos das camadas 1 e 2 passam na integração contínua.
- **SC-009**: As 6 capturas da camada 4 mostram o comportamento esperado.
- **SC-010**: No teste manual, o jogador usa o seletor rápido com gamepad sem perder o controle do Pokémon.

## Como testar *(mandatory)*

| Camada | Casos de teste | Comando |
|--------|----------------|---------|
| 1. Unidade (vitest com fixtures sintéticos; CI) | Um teste por efeito de item segurado mapeado e por reinterpretação de PP (Ether, Elixir, PP Up, PP Max); modificador de captura de cada bola especial; ciclo das árvores e prazo do Kurt com relógio injetado; compatibilidade de TM e HM com o learnset; evolução por pedra; limites dos bolsos; Repel por nível | `npx vitest run` |
| 2. Servidor sem interface (`packages/server/test/harness.ts`, 2 a 4 jogadores; CI) | Usar Potion em combate respeita o tempo de uso e o Pokémon pode ser atingido; servidor recusa usar item que o jogador não tem; berry segurada consumida sozinha ao cruzar o limiar de HP durante a luta; item do chão pego por A continua disponível para B | `npx vitest run` |
| 3. ROM real (só local, nunca na CI) | Ao fim do caminho dourado, cada item da mochila tem um cenário de uso que funciona; a sonda encontra, com o Dowsing, os itens escondidos reais das rotas 29 a 31 conforme os eventos extraídos; o relatório de cobertura não tem item obtível até Violet City sem efeito | `npm run golden` e `npm run items:coverage` |
| 4. App (driver da skill `run-soulsilver`) | Capturas: 01 seletor rápido de itens em combate; 02 berry consumida, com o número de cura na tela; 03 TM sendo ensinado; 04 evolução por pedra; 05 Dowsing apontando um item; 06 Kurt recebendo apricorns | `node .claude/skills/run-soulsilver/driver.mjs [passos]` |
| 5. Manual | O seletor rápido é usável em combate com gamepad sem perder o controle do Pokémon | Não há |

**Conclusão**: as camadas 1 e 2 passam na integração contínua; a camada 3 passa localmente, com o
relatório (incluindo o de cobertura) anexado ao `tasks.md`; as 6 capturas da camada 4 estão salvas
em `.evidence/027/`, pasta fora do git.

## Assumptions

- Os dados de itens, bolsos, limites, preços, TMs e HMs, pedras, berries e apricorns, tabelas de achados do companheiro e itens do mundo estão na ROM; o que faltar é incluído na extração.
- Poké Balls, Potions e o armazenamento de itens (specs anteriores, incluindo economia e PC) são a base; este spec completa o que falta.
- O tempo de uso e a recarga de cada item são decisões de equilíbrio guardadas em dados, ajustáveis sem mudar código, e registradas em `docs/balance-log.md` quando reinterpretam o original.
- A duração do Repel e os ciclos de árvores e do Kurt são os originais convertidos para tempo real pela mesma regra de conversão dos specs anteriores, sobre o relógio da sessão (spec 026).
- O Dowsing MCHN é o item-chave original; sua indicação é visual no mundo, sem exigir som.
- Itens segurados usam o mesmo formato de dados dos arquétipos de golpe (spec 025 e anteriores) para que o relatório de cobertura funcione igual.
- Estado de mochila, árvores, Kurt e coletas é por jogador (princípio VII) e vai para o save do jogador (princípio VIII).
- A ordem e o comportamento de eventos de itens seguem o detonado do usuário, como nos specs anteriores.
