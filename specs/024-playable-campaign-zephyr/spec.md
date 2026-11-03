# Feature Specification: Campanha jogável até a Insígnia Zephyr

**Feature Branch**: `024-playable-campaign-zephyr`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "Campanha jogável da introdução à Insígnia Zephyr: corrigir o estado inicial do jogo novo para que a história progrida com os dados reais da ROM, e criar uma verificação de ponta a ponta com a ROM real."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Jogo novo começa como o original (Priority: P1)

O jogador cria um jogo novo informando apenas nome e personagem. Ele começa no quarto de casa, desce, fala com a mãe e a história segue a partir daí: New Bark Town reage ao andamento da história, e o jogador avança de evento em evento, na ordem do jogo original, até receber a Insígnia Zephyr.

**Why this priority**: hoje a história não anda. Sem isso, nenhum conteúdo posterior pode ser construído.

**Independent Test**: criar um jogo novo, verificar o mapa e a posição iniciais, descer, concluir a cena da mãe e verificar que os eventos de New Bark Town passam a disparar.

**Acceptance Scenarios**:

1. **Given** a criação de um save novo, **When** o jogador informa nome e personagem, **Then** o jogo começa no quarto do jogador, na posição inicial do original, sem pedir Pokémon inicial.
2. **Given** o jogador no térreo no início da história, **When** ele entra na sala, **Then** a cena da mãe acontece e, ao terminar, os eventos de New Bark Town que dependem dela passam a disparar.
3. **Given** um jogo novo, **When** o jogador segue a história, **Then** os eventos ocorrem na ordem dos primeiros capítulos do jogo original (Elm, Cherrygrove, rival, Violet City, Sprout Tower, Falkner) sem travar.

---

### User Story 2 - Escolher o inicial no laboratório (Priority: P1)

O jogador recebe seu Pokémon inicial no laboratório do Prof. Elm, pela cena original, e isso fica registrado na história.

**Why this priority**: é o primeiro marco da história e destrava os seguintes.

**Independent Test**: no laboratório com a história no ponto correto, concluir a cena e verificar que o inicial está no time e o marco registrado.

**Acceptance Scenarios**:

1. **Given** um jogo novo sem inicial, **When** o jogador chega ao laboratório e conclui a cena do Prof. Elm, **Then** ele escolhe e recebe o Pokémon e a história registra que o inicial foi recebido.
2. **Given** um jogo novo, **When** o jogador ainda não visitou o laboratório, **Then** seu time está vazio.

---

### User Story 3 - Cada personagem em um único lugar (Priority: P1)

Em qualquer momento da história, cada personagem aparece uma só vez no mapa, na versão correta para aquele momento (rival, mãe e demais personagens com versões futuras ficam ocultos até a hora certa).

**Why this priority**: personagens duplicados quebram a imersão e escondem erros de estado.

**Independent Test**: em cada marco da história, listar os personagens visíveis do mapa atual e verificar que nenhum aparece em duplicidade.

**Acceptance Scenarios**:

1. **Given** um jogo novo, **When** o jogador visita New Bark Town e a casa, **Then** a mãe, o rival e os demais personagens aparecem uma única vez, no estado correto.
2. **Given** qualquer marco da campanha, **When** o jogador entra num mapa, **Then** nenhum personagem aparece em dois lugares.

---

### User Story 4 - Nome do rival (Priority: P2)

O jogador dá nome ao rival quando a história pede, e esse nome aparece nas mensagens seguintes e é guardado no save.

**Why this priority**: necessário para a luta contra o rival e para os diálogos, mas depende do fluxo base.

**Independent Test**: chegar ao ponto de nomear o rival, digitar um nome e verificar o nome nos diálogos e após salvar e carregar.

**Acceptance Scenarios**:

1. **Given** a cena que pede o nome do rival, **When** o jogador informa um nome, **Then** ele é guardado e usado nas mensagens seguintes.
2. **Given** um save com rival nomeado, **When** o jogo é salvo e carregado, **Then** o nome é preservado.

---

### User Story 5 - Diagnóstico de eventos que não disparam (Priority: P2)

Um desenvolvedor abre o depurador e vê, para o mapa atual: os objetos com a condição de esconder e se estão visíveis; os scripts de mapa e gatilhos com a condição de cada um e se está satisfeita agora; e o histórico recente de mudanças de flags e variáveis, com o script responsável.

**Why this priority**: reduz drasticamente o tempo de investigar travas de história.

**Independent Test**: abrir o depurador num mapa com gatilhos e verificar que as três listas aparecem e refletem o estado real.

**Acceptance Scenarios**:

1. **Given** o mapa atual, **When** o desenvolvedor abre o depurador, **Then** vê cada objeto com sua flag de esconder e visibilidade atual.
2. **Given** o mapa atual, **When** abre o depurador, **Then** vê cada script de mapa e gatilho com sua condição e se ela é verdadeira agora.
3. **Given** um script que alterou uma flag ou variável, **When** o desenvolvedor consulta o histórico, **Then** a mudança aparece com o script que a fez.

---

### User Story 6 - Verificação de caminho dourado com a ROM real (Priority: P2)

Um desenvolvedor roda localmente uma verificação automática que percorre a campanha com a ROM real e confere os dez marcos, falhando com um relatório útil se a história travar.

**Why this priority**: impede regressões da progressão, mas só faz sentido depois da história andar.

**Independent Test**: rodar a verificação localmente com a ROM; ela deve passar do marco 1 ao 10. Quebrar de propósito um evento deve fazê-la falhar indicando o marco.

**Acceptance Scenarios**:

1. **Given** a ROM real do desenvolvedor, **When** a verificação roda, **Then** ela alcança os marcos: (1) jogo novo no quarto; (2) cena da mãe; (3) inicial recebido; (4) Running Shoes em Cherrygrove; (5) Mystery Egg e Pokédex; (6) rival vencido e nome definido; (7) ovo entregue ao Prof. Elm; (8) Poké Balls do tutorial de captura; (9) Sprout Tower concluída; (10) Falkner derrotado e Insígnia Zephyr.
2. **Given** qualquer marco, **When** é conferido, **Then** nenhum personagem do mapa atual está duplicado.
3. **Given** uma falha, **When** o relatório é emitido, **Then** mostra o marco alcançado, o último script executado, a posição, as condições dos scripts de mapa e gatilhos e as flags relevantes.
4. **Given** o ambiente de integração contínua sem ROM, **When** os testes automáticos rodam, **Then** a verificação não é executada.

---

### User Story 7 - Saves antigos (Priority: P3)

Ao carregar um save criado antes desta correção, o jogador é avisado de que a história está desatualizada e escolhe entre recomeçar a história no mesmo slot ou continuar sem garantia de progressão.

**Why this priority**: protege saves existentes sem bloquear o valor principal.

**Independent Test**: carregar um save antigo e verificar o aviso e as duas opções.

**Acceptance Scenarios**:

1. **Given** um save anterior à correção, **When** é carregado, **Then** é marcado como "história desatualizada" e as duas opções são oferecidas.
2. **Given** a escolha de recomeçar, **When** confirmada, **Then** a história reinicia no mesmo slot com o estado inicial correto.
3. **Given** a escolha de continuar, **When** confirmada, **Then** o save carrega sem alterações de história.

---

### Edge Cases

- Jogador sai de casa sem concluir a cena da mãe: o jogo não deve liberar eventos que dependem dela.
- Jogador salva no meio de uma cena e carrega depois: o estado de personagens e marcos permanece coerente.
- Nome do rival vazio ou longo demais: segue as mesmas regras de nome do jogador (limite e validação).
- ROM ausente ou diferente da esperada ao rodar a verificação: falha com mensagem clara, sem marcos parciais enganosos.
- Comando de script ainda não suportado durante a campanha: é registrado no log de comandos faltantes, que deve ficar vazio ao fim do trecho.
- Save antigo já com inicial recebido: a opção "continuar" preserva o time.

### Como testar (complemento: verificação real dos specs 020 a 023)

Os specs 020 a 023 só foram verificados com fixtures sintéticos. O caminho dourado deste spec passa a verificá-los também com a ROM real.

**Camada 3: novos checks no caminho dourado**

- **Lutas**: a sonda resolve todas as lutas (rival, treinadores das rotas 29 a 31, Sprout Tower, Falkner) com o bot de referência do spec 019. Atalhos que pulem o script de batalha são proibidos: o script MUST receber o fim da luta como no jogo. Depois de cada luta, confere: flag de treinador derrotado ligada, prêmio em dinheiro igual à fórmula, e o treinador não desafia de novo quando a sonda passa na frente dele outra vez.
- **Loja (023)**: em Cherrygrove, confere que o estoque oferecido é o extraído para aquele momento da história, compra 1 Potion e vende 1, e confere dinheiro e mochila.
- **Centro Pokémon (023)**: reduz o HP da equipe por comando de desenvolvimento, fala com a enfermeira de Cherrygrove e confere HP máximo, status limpo e ponto de retorno em Cherrygrove.
- **PC (023)**: depois do tutorial de captura, a sonda captura um selvagem, deposita no PC, retira e confere a equipe.
- **Isolamento (020)**: um segundo jogador entra na mesma sessão e fica parado em New Bark Town. Em cada marco, confere que os NPCs que ele vê correspondem às flags dele, não às do primeiro jogador.
- **Comandos faltantes**: ao fim, o log de comandos faltantes do caminho principal MUST estar vazio. O relatório lista os do caminho opcional separadamente.

**Camada 4: roteiro no app**

O driver executa o trecho com teleportes de desenvolvimento entre as cenas e salva em `.evidence/024/`:
01-quarto, 02-cena-mae, 03-new-bark-sem-duplicados, 04-escolha-inicial, 05-amiga-porta-lab, 06-guia-cherrygrove, 07-mr-pokemon, 08-luta-rival, 09-loja, 10-centro, 11-pc, 12-tutorial-captura, 13-sprout-tower, 14-falkner, 15-insignia.
Em cada captura, o overlay F3 mostra o mapa e a posição. O agente confere cada captura contra a descrição da página correspondente do detonado e registra o resultado no `walkthrough.md`.

**Manual**

Um humano joga o trecho inteiro sem comandos de desenvolvimento e anota qualquer divergência no `walkthrough.md`.

**Definição de pronto**

- Todas as linhas do `walkthrough.md` com situação "Verificado no app".
- Caminho dourado do marco 1 ao 10, com os novos checks, passando localmente e com o relatório anexado ao `tasks.md`.
- As 15 capturas em `.evidence/024/`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O jogo novo MUST começar no mapa e na posição iniciais do original (quarto do jogador), obtidos dos dados extraídos ou do código do jogo, e não por heurística.
- **FR-002**: O jogo novo MUST aplicar as flags e variáveis iniciais exatamente como o original; o extrator MUST obter esses valores da ROM, e a origem exata MUST ser registrada na pesquisa do plano.
- **FR-003**: A criação do save MUST pedir apenas nome e personagem, sem Pokémon inicial.
- **FR-004**: O Pokémon inicial MUST ser dado pela cena do laboratório do Prof. Elm, que MUST registrar o marco na história.
- **FR-005**: O save MUST guardar o nome do rival; a cena de nomear MUST pedi-lo ao jogador pela interface de texto existente e as mensagens MUST usá-lo.
- **FR-006**: O jogo MUST suportar os comandos de mensagem externa (incluindo a tabela de mensagens externas extraída da ROM), música temporária e o comando de script restante do trecho.
- **FR-007**: O log de comandos faltantes MUST terminar vazio ao fim do trecho até Violet City e Falkner.
- **FR-008**: Em qualquer momento da campanha, nenhum personagem MUST aparecer duplicado no mapa atual.
- **FR-009**: Saves anteriores MUST ser migrados e marcados como "história desatualizada", oferecendo recomeçar a história no mesmo slot ou continuar sem garantia.
- **FR-010**: O depurador de scripts MUST listar objetos do mapa atual com flag de esconder e visibilidade; scripts de mapa e gatilhos com condição e estado atual; e o histórico das últimas mudanças de flags e variáveis com o script autor.
- **FR-011**: MUST existir uma verificação de caminho dourado, local e fora da integração contínua, que use a ROM real, percorra a campanha por inputs e teleportes scriptados e confira os dez marcos pelas flags e variáveis do jogador.
- **FR-012**: A verificação MUST conferir a ausência de duplicados em cada marco e MUST emitir relatório com o marco alcançado e, em falha, último script, posição, condições dos scripts de mapa e gatilhos e flags relevantes.
- **FR-013**: Conteúdo após a Insígnia Zephyr e novas funcionalidades de economia estão fora do escopo; o caminho dourado só verifica as do spec 023 (loja, centro, PC) com a ROM real.

### Key Entities

- **Estado inicial de jogo novo**: mapa, posição e conjunto de flags e variáveis do início do original.
- **Progresso de história**: flags e variáveis do jogador que marcam os eventos concluídos.
- **Nome do rival**: texto guardado no save.
- **Marca de história desatualizada**: indicador no save de que o estado de história é anterior à correção.
- **Marco da campanha**: um dos dez pontos verificados, com sua condição de flags/variáveis.
- **Relatório de verificação**: resultado com marco alcançado e dados de diagnóstico em caso de falha.
- **Histórico de mudanças de estado**: registro recente de alterações de flags/variáveis com o script responsável.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um jogador humano começa um jogo novo e chega à Insígnia Zephyr apenas jogando, com os eventos na ordem das páginas 1 a 6 do detonado de referência.
- **SC-002**: A verificação de caminho dourado passa dos marcos 1 ao 10 com a ROM real, em 100% das execuções sem alterações.
- **SC-003**: Em 100% dos marcos, nenhum personagem aparece em dois lugares ao mesmo tempo.
- **SC-004**: O log de comandos faltantes termina vazio ao fim do trecho.
- **SC-005**: Um desenvolvedor identifica por que um evento não disparou em menos de 2 minutos usando apenas o depurador.
- **SC-006**: 100% dos saves anteriores carregam exibindo o aviso e as duas opções, sem perda de dados.

## Assumptions

- A ROM real fica no PC do desenvolvedor e nunca é distribuída nem usada na integração contínua.
- O detonado de referência é a ordem canônica dos eventos; a decompilação pret/pokeheartgold serve de referência para localizar rotinas do jogo.
- O interpretador de scripts, scripts de mapa, gatilhos e filtro de visibilidade existentes estão corretos; a falha é do estado inicial e dos comandos faltantes.
- Nomear o rival segue as mesmas regras de validação do nome do jogador.
- Os saves existentes são poucos e locais; a migração não precisa tentar reparar a história automaticamente.
