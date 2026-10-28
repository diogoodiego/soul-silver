# Feature Specification: Economia, Centro Pokémon e PC

**Feature Branch**: `023-economy-center-pc`

**Created**: 2026-10-27

**Status**: Draft

**Input**: User description: "Economia, Centro Pokémon e PC: dinheiro, lojas Poké Mart com os estoques originais, compra e venda, cura no Centro Pokémon e o sistema de PC para armazenar Pokémon e itens."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Comprar e vender na loja (Priority: P1)

O jogador fala com o atendente de um Poké Mart, vê os produtos e preços daquela cidade, escolhe a quantidade, vê o total e confirma. Também pode vender itens da mochila pelo preço de venda original.

**Why this priority**: sem dinheiro e loja não há como repor poções e Poké Bolas; é o serviço mais usado da jornada.

**Independent Test**: abrir a loja de Cherrygrove City com dinheiro conhecido, comprar 3 Poké Bolas, conferir dinheiro e mochila; vender 1 item e conferir o ganho.

**Acceptance Scenarios**:

1. **Given** o jogador na loja de Cherrygrove City, **When** abre a tela de compra, **Then** vê os mesmos produtos e preços do original.
2. **Given** dinheiro suficiente, **When** escolhe quantidade e confirma, **Then** o dinheiro é debitado pelo total e os itens entram na mochila.
3. **Given** dinheiro insuficiente, **When** tenta confirmar, **Then** a compra é recusada e nada muda.
4. **Given** um item da mochila, **When** o jogador o vende, **Then** recebe a metade do preço de compra original e o item sai da mochila.
5. **Given** o jogador sem o item (ou com quantidade menor), **When** tenta vendê-lo, **Then** a venda é recusada.
6. **Given** um item cujo estoque depende do progresso (ex.: mais produtos após certa insígnia), **When** o jogador abre a loja antes e depois do marco, **Then** a lista reflete o progresso dele.
7. **Given** dinheiro no limite original, **When** o jogador vende algo, **Then** o dinheiro fica limitado ao teto.

---

### User Story 2 - Curar no Centro Pokémon (Priority: P1)

O jogador fala com a enfermeira; o script original dela cura a equipe. Esse Centro passa a ser o ponto de retorno em caso de blackout.

**Why this priority**: é o único jeito gratuito de recuperar a equipe e define onde o jogador volta ao perder.

**Independent Test**: ferir e envenenar a equipe, falar com a enfermeira, conferir HP e status restaurados e o ponto de retorno atualizado.

**Acceptance Scenarios**:

1. **Given** equipe ferida e com status, **When** o script da enfermeira executa a cura, **Then** HP e status de toda a equipe são restaurados (o jogo não guarda PP; ver `docs/balance-log.md`).
2. **Given** a cura concluída, **When** o jogador sofre blackout depois, **Then** retorna àquele Centro.
3. **Given** vários jogadores na sessão, **When** um deles é curado, **Then** só a equipe e o ponto de retorno dele mudam.

---

### User Story 3 - Guardar e retirar no PC (Priority: P2)

O jogador usa o PC para mover Pokémon entre a equipe e as caixas, entre caixas, renomear caixas e ver o resumo de cada Pokémon; e para depositar e retirar itens da mochila.

**Why this priority**: libera espaço para capturas e substitui o armazenamento temporário, mas a jornada básica funciona sem organizar caixas.

**Independent Test**: depositar um Pokémon da equipe, movê-lo de caixa, renomear a caixa, retirá-lo; depositar e retirar um item.

**Acceptance Scenarios**:

1. **Given** equipe com mais de um Pokémon, **When** o jogador deposita um, **Then** ele vai para a vaga escolhida da caixa.
2. **Given** um Pokémon numa caixa e a equipe com vaga, **When** o jogador o retira, **Then** ele entra na equipe.
3. **Given** a equipe com um único Pokémon apto a lutar, **When** tenta depositá-lo, **Then** é recusado.
4. **Given** uma caixa cheia, **When** tenta mover para ela, **Then** é recusado com aviso.
5. **Given** uma caixa, **When** o jogador a renomeia, **Then** o nome persiste no save.
6. **Given** um Pokémon, **When** o jogador abre o resumo, **Then** vê espécie, nível, stats, golpes e demais dados.
7. **Given** itens na mochila, **When** deposita e depois retira, **Then** as quantidades se movem sem perda.
8. **Given** equipe cheia, **When** o jogador captura um Pokémon, **Then** ele vai para o PC.
9. **Given** um save com Pokémon no armazenamento temporário, **When** é carregado, **Then** todos aparecem no PC, sem perda nem duplicação.

### Edge Cases

- Compra cuja quantidade excede o espaço da mochila ou o máximo por item: recusada sem cobrar.
- Dois jogadores comprando ao mesmo tempo: cada um tem dinheiro e mochila próprios.
- Retirada ou movimentação de Pokémon inexistente, vaga inválida ou caixa inexistente: recusada.
- Todas as caixas cheias na captura: a captura é bloqueada com aviso, como no limite anterior.
- Itens-chave e itens sem preço: não podem ser vendidos.
- Desconexão no meio de uma transação: ou a operação foi aplicada inteira ou não foi.
- Save sem o armazenamento temporário: carrega com PC vazio.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Cada jogador DEVE ter seu dinheiro, limitado ao teto original e nunca negativo.
- **FR-002**: O estoque e os preços de cada loja DEVEM vir dos dados extraídos, incluindo itens liberados por progresso.
- **FR-003**: O preço de venda DEVE seguir a regra original (metade do preço de compra); itens sem preço ou itens-chave NÃO DEVEM ser vendáveis.
- **FR-004**: A tela de loja DEVE permitir escolher quantidade, mostrar o total e exigir confirmação, para compra e venda.
- **FR-005**: O servidor DEVE validar toda compra e venda (dinheiro, quantidade, espaço, item na loja ou na mochila) e recusar o inválido sem alterar o estado.
- **FR-006**: A cura DEVE ser disparada pelo script original da enfermeira e restaurar HP e status da equipe.
- **FR-007**: A cura DEVE registrar aquele Centro como ponto de retorno do jogador para o blackout.
- **FR-008**: O PC de Pokémon DEVE ter o número de caixas e de vagas por caixa do original, com os nomes padrão.
- **FR-009**: O jogador DEVE poder mover Pokémon entre equipe e caixas e entre caixas, renomear caixas e ver o resumo de cada Pokémon.
- **FR-010**: O servidor DEVE impedir depositar o último Pokémon apto da equipe e recusar movimentos de Pokémon ou vagas inexistentes ou ocupadas.
- **FR-011**: O armazenamento temporário DEVE ser migrado para o PC, sem perda nem duplicação, e capturas com equipe cheia DEVEM ir para o PC.
- **FR-012**: O PC de itens DEVE permitir depositar e retirar itens da mochila, respeitando quantidades e limites.
- **FR-013**: Dinheiro, PC e ponto de retorno DEVEM persistir no save do jogador, com migração de saves anteriores.
- **FR-014**: Toda mudança de protocolo ou formato de save DEVE ser versionada (princípio VI).

### Key Entities

- **Dinheiro**: saldo por jogador, com teto.
- **Loja**: estoque de uma cidade, com itens fixos e itens condicionados a progresso, e preços.
- **Ponto de retorno**: último Centro Pokémon usado pelo jogador.
- **Caixa do PC**: nome e vagas de Pokémon; cada jogador tem várias caixas.
- **Depósito de itens**: itens guardados no PC, por jogador.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: As lojas de Cherrygrove City e Violet City têm 100% dos produtos e preços do original.
- **SC-002**: 100% das compras, vendas e movimentos inválidos listados nos cenários são recusados sem alterar dinheiro, mochila ou PC.
- **SC-003**: Após falar com a enfermeira, 100% da equipe fica com HP e status completos.
- **SC-004**: Um blackout após a cura leva o jogador ao último Centro usado em 100% dos casos.
- **SC-005**: Um save com Pokémon no armazenamento temporário carrega com todos eles no PC, sem perda nem duplicação.
- **SC-006**: Comprar um item leva no máximo 4 interações (abrir, quantidade, conferir total, confirmar).
- **SC-007**: Os testes cobrem compra, venda, teto de dinheiro, cura, PC e todas as validações do servidor.

## Assumptions

- A regra original de venda é metade do preço de compra, e o teto de dinheiro é o do original (999.999).
- Os dados de lojas, caixas e vagas vêm da extração; se faltarem, a extração é estendida neste spec.
- A cura reaproveita o script original da enfermeira via interpretador de scripts (spec 020).
- O PC é acessado pelo computador dos Centros Pokémon e da casa do jogador, via script original.
- Fora do escopo: Goldenrod Department Store, máquinas de venda (Marco 4), Creche e ovos, trocas entre jogadores.
