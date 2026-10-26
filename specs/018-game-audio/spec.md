# Feature Specification: Áudio no jogo

**Feature Branch**: `018-game-audio`

**Created**: 2026-10-25

**Status**: Draft

**Input**: User description: "Áudio no jogo: tocar a música e os efeitos sonoros extraídos no spec 9. Inclui música por lugar, música de combate, efeitos de golpes, captura e interface, cries dos Pokémon e controles de volume."

## Contexto

A trilha do HGSS é parte central da identidade do jogo, e uma fatia jogável sem som parece
inacabada. Os efeitos sonoros também são feedback do combate em tempo real: acertar um golpe precisa
soar como acerto. Pelo princípio I, músicas, efeitos e cries são os extraídos da ROM (feature 009).
Pelo princípio IV, o áudio é só apresentação no cliente e nunca influencia a simulação do servidor.

Atores:

- **Jogador**: ouve a música do próprio estado e os efeitos ao redor, e ajusta os volumes.
- **Outros jogadores da sessão**: geram efeitos que o jogador ouve conforme a distância.

Termos:

- **Música de lugar**: a faixa indicada pelo header do mapa atual (feature 006), na versão de dia ou de noite.
- **Crossfade**: a música antiga perde volume enquanto a nova ganha, sem intervalo de silêncio.
- **Efeito próprio**: efeito causado pelo jogador local, pelos Pokémon dele ou pelos menus dele.
- **Efeito de terceiros**: efeito causado por outro jogador, pelos Pokémon dele ou por Pokémon selvagens.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Música de cada lugar (Priority: P1)

O jogador ouve a música do lugar em que está. Ao mudar para uma área com outra música, há
crossfade. Se a música for a mesma, ela continua sem reiniciar. A tela de título toca a música de
título.

**Why this priority**: É o que mais identifica o jogo e a base de toda a camada de áudio.

**Independent Test**: Andar de New Bark Town à Route 29 e entrar no laboratório, ouvindo as trocas.

**Acceptance Scenarios**:

1. **Given** a tela de título, **When** ela aparece, **Then** toca a música de título.
2. **Given** o jogador em New Bark Town, **When** entra na Route 29, **Then** a música faz crossfade para a da Route 29 sem silêncio nem corte.
3. **Given** duas áreas com a mesma música, **When** o jogador passa de uma à outra, **Then** a música continua do ponto em que estava.
4. **Given** uma faixa com introdução e loop, **When** chega ao fim do loop, **Then** volta ao início do loop sem repetir a introdução nem cortar.
5. **Given** um mapa com músicas diferentes de dia e de noite, **When** o jogador entra nele, **Then** toca a do período atual.

---

### User Story 2 - Música de batalha e fanfarra (Priority: P1)

Quando o jogador entra em combate com um selvagem, a música passa para a de batalha selvagem. Ao
vencer, toca a fanfarra de vitória e depois volta a música do lugar. Cada cliente segue o próprio
estado.

**Why this priority**: Marca o início e o fim do combate, que é o centro do jogo.

**Independent Test**: Provocar um combate com selvagem, vencer e conferir a sequência de músicas. Repetir com um segundo jogador por perto, fora do combate.

**Acceptance Scenarios**:

1. **Given** o jogador fora de combate, **When** um combate com selvagem começa, **Then** a música de batalha selvagem está tocando em até 1 segundo.
2. **Given** um combate vencido, **When** ele termina, **Then** toca a fanfarra de vitória e, ao fim dela, a música do lugar volta com crossfade.
3. **Given** um combate terminado por captura, fuga ou derrota, **When** ele termina, **Then** a música do lugar volta sem a fanfarra de vitória (a captura toca o próprio efeito).
4. **Given** dois jogadores próximos, um em combate e outro não, **When** o combate acontece, **Then** só o que está em combate ouve a música de batalha.

---

### User Story 3 - Efeitos de combate, captura e interface (Priority: P1)

O jogador ouve os golpes, os acertos e a efetividade deles, desmaios, o arremesso, a balançada, a
captura e o escape da Poké Ball, portas e warps, subida de nível, evolução e a navegação de menus.

**Why this priority**: No combate em tempo real o som é parte do feedback de acerto.

**Independent Test**: Usar golpes com e sem som identificado, acertar com efetividades diferentes, capturar e falhar uma captura, navegar num menu.

**Acceptance Scenarios**:

1. **Given** um golpe com som original identificado nos dados extraídos, **When** é usado, **Then** toca esse som.
2. **Given** um golpe sem som identificado, **When** é usado, **Then** toca o som padrão do arquétipo dele (feature 013).
3. **Given** um acerto, **When** ele é super efetivo, normal ou pouco efetivo, **Then** toca o efeito de acerto correspondente.
4. **Given** uma Poké Ball arremessada, **When** ela balança, captura ou o Pokémon escapa, **Then** toca o efeito de cada momento.
5. **Given** um menu aberto, **When** o jogador move o cursor, confirma ou cancela, **Then** toca o efeito correspondente.
6. **Given** um efeito de outra entidade, **When** ele toca, **Then** fica mais baixo quanto mais longe e tem pan estéreo conforme a posição na tela.

---

### User Story 4 - Cries dos Pokémon (Priority: P2)

O jogador ouve o cry do próprio Pokémon ao lançá-lo e ao desmaiar, e o de um selvagem agressivo
quando ele nota o jogador.

**Why this priority**: Dá personalidade, mas o combate funciona sem.

**Independent Test**: Lançar um Pokémon, deixá-lo desmaiar e aproximar-se de um selvagem agressivo.

**Acceptance Scenarios**:

1. **Given** um Pokémon na equipe, **When** é lançado, **Then** toca o cry da espécie e da forma dele.
2. **Given** um Pokémon em campo, **When** desmaia, **Then** toca o cry dele na versão de desmaio do original.
3. **Given** um selvagem agressivo, **When** nota o jogador, **Then** toca o cry dele, posicional.

---

### User Story 5 - Volumes nas Configurações (Priority: P2)

O jogador ajusta o volume geral, de música e de efeitos, e escolhe silenciar quando a janela perde
o foco.

**Why this priority**: Necessário para jogar com conforto, mas o jogo é jogável com os padrões.

**Independent Test**: Mudar cada volume, ouvir a mudança na hora, reabrir o app e conferir que continua.

**Acceptance Scenarios**:

1. **Given** a seção de áudio nas Configurações, **When** o jogador muda um volume, **Then** a mudança é imediata.
2. **Given** volumes ajustados, **When** o app é reaberto, **Then** os mesmos volumes valem.
3. **Given** a opção de silenciar ativa, **When** a janela perde o foco, **Then** o áudio silencia, e volta quando ela recupera o foco.
4. **Given** dois saves diferentes, **When** o jogador troca de save, **Then** os volumes não mudam.

---

### Edge Cases

- Troca rápida de áreas (ida e volta por uma porta) antes de o crossfade terminar: a música alvo é sempre a do lugar atual, sem duas músicas acumuladas.
- Música, efeito ou cry ausente nos dados extraídos (relatório da feature 009): o jogo segue sem aquele som, sem erro nem travamento, e registra o caso no log.
- O jogador muda de área durante a fanfarra: ela é cortada com fade e a música do novo lugar assume.
- Um novo combate começa durante a fanfarra: a música de batalha assume.
- Dia vira noite com o jogador no mapa: a música troca no próximo mapa, não no meio da faixa.
- Mais efeitos simultâneos que o limite: os de menor prioridade (terceiros mais distantes) são descartados primeiro. Efeitos próprios nunca são cortados por efeitos de terceiros.
- Volume geral em zero: nada toca, e o jogo continua normal.
- Sem dispositivo de áudio, ou dispositivo removido durante o jogo: o jogo continua sem som e sem erro.
- Efeito de entidade além do alcance de atenuação: não toca.

## Requirements *(mandatory)*

### Functional Requirements

**Música**

- **FR-001**: O jogo MUST tocar a música de lugar indicada pelo header do mapa atual (feature 006), na versão do período do dia.
- **FR-002**: Ao mudar para uma área com música diferente, o jogo MUST fazer crossfade, sem silêncio entre as faixas.
- **FR-003**: Ao mudar para uma área com a mesma música, ela MUST continuar sem reiniciar.
- **FR-004**: Faixas com introdução e loop MUST respeitar os pontos de loop extraídos (feature 009): introdução uma vez, loop contínuo.
- **FR-005**: A tela de título MUST tocar a música de título.
- **FR-006**: Ao começar um combate com selvagem, a música de batalha selvagem MUST estar tocando em até 1 segundo.
- **FR-007**: Ao vencer um combate, o jogo MUST tocar a fanfarra de vitória e, ao fim dela, voltar à música do lugar.
- **FR-008**: Cada cliente MUST escolher a música pelo estado do próprio jogador. O estado de outros jogadores MUST NOT mudar a música local.
- **FR-009**: A música MUST NOT ser posicional.

**Efeitos sonoros**

- **FR-010**: Um golpe MUST tocar o som original do golpe quando identificado nos dados extraídos, e o som padrão do arquétipo dele (feature 013) caso contrário.
- **FR-011**: O jogo MUST tocar efeitos para: acerto, super efetivo, pouco efetivo, desmaio, arremesso, balançada, captura e escape da Poké Ball, portas e warps, subida de nível, evolução, e cursor, confirmar e cancelar nos menus.
- **FR-012**: Efeitos de terceiros MUST diminuir com a distância até um alcance máximo e MUST ter pan estéreo conforme a posição horizontal na tela. Efeitos próprios e de interface MUST tocar centrados e sem atenuação.
- **FR-013**: O jogo MUST limitar o número de efeitos simultâneos, priorizando efeitos próprios sobre os de terceiros e, entre terceiros, os mais próximos.

**Cries**

- **FR-014**: O jogo MUST tocar o cry da espécie e da forma ao lançar um Pokémon, quando ele desmaia e quando um selvagem agressivo nota o jogador.
- **FR-015**: Cries de terceiros MUST seguir as mesmas regras de distância, pan e prioridade dos efeitos.

**Volume e preferências**

- **FR-016**: A seção de áudio nas Configurações MUST ter volume geral, de música e de efeitos (os cries contam como efeitos), e a opção de silenciar quando a janela perde o foco.
- **FR-017**: Uma mudança de volume MUST valer imediatamente.
- **FR-018**: As preferências de áudio MUST ficar nas configurações do app, MUST persistir entre aberturas e MUST NOT ficar no save (princípio VIII).

**Carregamento e desempenho**

- **FR-019**: O áudio de uma área (música e efeitos esperados) MUST estar carregado antes de ser necessário, sem engasgo ao tocar.
- **FR-020**: Tocar áudio MUST NOT afetar o tick do servidor nem a taxa de quadros do cliente (princípio X).
- **FR-021**: Um som ausente MUST ser ignorado com registro no log, sem erro visível nem travamento.

**Testes**

- **FR-022**: A escolha de música, a prioridade e o limite de efeitos, a atenuação e o pan MUST ser testados com dados sintéticos, sem depender da ROM (princípios II e V).
- **FR-023**: A conferência auditiva com a ROM real (trocas, loops, inteligibilidade em combate) MUST ser manual, separada da integração contínua.

### Key Entities

- **Estado de música**: a faixa que o jogador deve ouvir agora (título, lugar, batalha ou fanfarra) e a faixa em transição.
- **Evento sonoro**: efeito ou cry com origem (própria ou de terceiros), posição e prioridade.
- **Som de golpe**: ligação entre um golpe e o som original extraído, ou o som padrão do arquétipo.
- **Preferências de áudio**: volume geral, de música e de efeitos, e silenciar sem foco, guardadas nas configurações do app.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Ir de New Bark Town à Route 29 e entrar no laboratório troca a música sem silêncio nem corte audível em 3 de 3 trocas.
- **SC-002**: A música de batalha começa em até 1 segundo depois do início do combate em 10 de 10 combates.
- **SC-003**: Num combate com 4 jogadores e golpes simultâneos, o jogo mantém 60 quadros por segundo e os efeitos próprios continuam distinguíveis.
- **SC-004**: Mudar um volume nas Configurações tem efeito audível imediato e continua valendo depois de reabrir o app em 100% dos casos testados.
- **SC-005**: Passar entre áreas com a mesma música não reinicia a faixa em 100% dos casos testados.
- **SC-006**: Nenhum som ausente nos dados extraídos causa erro ou travamento.
- **SC-007**: Os testes automatizados passam usando apenas dados sintéticos.

## Assumptions

- A feature 009 entrega músicas, efeitos e cries com identificadores e pontos de loop. A 006 entrega a música de cada mapa, a 013 os arquétipos de golpe, a 015 os eventos de captura, a 016 a subida de nível e a evolução, e a 017 a tela de Configurações.
- O servidor já envia ao cliente os eventos de combate, captura e progressão necessários. Esta feature só os traduz em som no cliente.
- O controle de volume, que a feature 009 atribuía à feature 26, passa a fazer parte desta feature.
- A duração do crossfade, o alcance de atenuação e o limite de efeitos simultâneos são definidos no plano e ajustados por escuta.
- Os volumes padrão permitem jogar sem ajuste, e a opção de silenciar sem foco vem desativada.

## Fora do escopo

- Músicas de treinador, rival e líder de ginásio (feature 020).
- Música de bicicleta e surf (feature 022).
- Rádio do Pokégear (feature 023).
- Eventos com música especial nas cutscenes (feature 020 em diante).
