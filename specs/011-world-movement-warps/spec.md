# Feature Specification: Mundo, movimento e warps

**Feature Branch**: `011-world-movement-warps`

**Created**: 2026-10-24

**Status**: Draft

**Input**: User description: "Mundo, movimento e warps: desenhar os mapas pré-renderizados e permitir que o jogador ande por eles com colisão, câmera, transição entre áreas e warps (portas, escadas, cavernas)."

## Contexto

É o primeiro momento em que o mapa extraído (feature 006) vira algo jogável, sobre o servidor
autoritativo da feature 010. Andar por New Bark Town tem de parecer o jogo original (princípio I),
mesmo com movimento livre (posição contínua) adaptado para combate em tempo real; a liberdade é só
de posição, não de direção: só as 4 direções cardinais existem, sem diagonal.

Atores:

- **Jogador**: controla o próprio personagem com teclado ou gamepad.
- **Desenvolvedor**: valida colisão e movimento em teste automatizado, sem a pilha gráfica.

Termos:

- **Grade de colisão**: a grade por tile extraída do mapa, com categorias (livre, bloqueio, água, ressalto, grama alta, escada, transição de nível).
- **Pedaço de mapa**: uma célula da matriz extraída; vários pedaços vizinhos formam uma área contínua.
- **Warp**: ponto do mapa que leva a outro mapa/posição extraído (porta, escada, entrada de caverna).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Andar e correr com colisão (Priority: P1)

O jogador anda e corre por New Bark Town, Route 29 e Cherrygrove City com teclado ou gamepad,
sem atravessar paredes, árvores ou água.

**Why this priority**: sem movimento com colisão não há nada jogável; tudo o mais depende disso.

**Independent Test**: carregar New Bark Town, mover o personagem nas 4 direções contra obstáculos e confirmar que ele para neles, sem atravessar nem andar na diagonal.

**Acceptance Scenarios**:

1. **Given** o jogador parado em chão livre, **When** segura uma direção do teclado, **Then** o personagem anda nessa direção em velocidade de caminhada, em posição contínua (não presa a tiles); segurando correr, anda na velocidade de corrida.
2. **Given** duas teclas de direção (ex.: cima e direita), **When** pressionadas juntas, **Then** só a direção dominante do vetor resultante vale; não há diagonal.
3. **Given** o analógico do gamepad levemente inclinado numa direção cardinal, **When** o jogador o segura, **Then** a velocidade é proporcional à inclinação, até o máximo de caminhada ou corrida.
4. **Given** o jogador encostado numa parede, árvore ou água, **When** empurra contra ela, **Then** não a atravessa e para nela, sem deslizar (não há eixo diagonal para deslizar ao longo dele).
5. **Given** um ressalto voltado para baixo, **When** o jogador anda nele vindo de cima, **Then** pula para o tile de baixo; vindo de baixo, o ressalto bloqueia.
6. **Given** a grama alta, **When** o jogador está nela, **Then** os pés do sprite ficam cobertos.
7. **Given** latência entre cliente e servidor, **When** o jogador anda, **Then** o movimento local responde na hora e a posição confirmada pelo servidor coincide com a prevista em movimento normal.

---

### User Story 2 - Entrar e sair de prédios por warps (Priority: P2)

O jogador entra e sai de casas, do laboratório e do Centro Pokémon por portas, com transição de fade.
O mesmo vale para escadas e entradas de caverna.

**Why this priority**: o percurso dos critérios de sucesso exige entrar em todos os prédios do caminho.

**Independent Test**: em New Bark Town, entrar na casa do jogador e no laboratório, e sair, conferindo destino e transição.

**Acceptance Scenarios**:

1. **Given** o jogador diante de uma porta, **When** anda para dentro dela, **Then** a tela escurece, o jogador aparece no destino extraído e a tela clareia.
2. **Given** a transição em andamento, **When** o jogador aperta direções, **Then** o input é ignorado até a transição terminar.
3. **Given** o jogador dentro de um prédio, **When** pisa no tapete de saída, **Then** volta para a frente da porta por onde entrou.
4. **Given** uma escada entre andares, **When** o jogador a usa, **Then** vai ao andar de destino com a mesma transição.

---

### User Story 3 - Áreas contínuas sem carregamento (Priority: P2)

O jogador passa de New Bark Town para a Route 29 (e dela para Cherrygrove) sem tela de carregamento, como no original.

**Why this priority**: é o que faz o mundo parecer o jogo original; vem logo depois de entrar em prédios.

**Independent Test**: atravessar a divisa New Bark ↔ Route 29 várias vezes e confirmar que não há pausa, tela preta nem pedaço de mapa vazio na tela.

**Acceptance Scenarios**:

1. **Given** o jogador se aproximando da borda de um pedaço, **When** chega perto o bastante para o vizinho entrar na tela, **Then** o vizinho já está desenhado.
2. **Given** a divisa entre duas áreas, **When** o jogador a cruza, **Then** câmera e movimento continuam sem interrupção e a área atual passa a ser a nova.

---

### User Story 4 - Profundidade e câmera (Priority: P3)

O jogador aparece atrás de telhados e copas de árvores e na frente do chão; a câmera o segue e para nas bordas.

**Why this priority**: acabamento visual; o jogo funciona sem ele, mas não parece o original.

**Independent Test**: andar atrás de uma casa e sob uma árvore conferindo a ordem de desenho, e andar até a borda do mapa conferindo a câmera.

**Acceptance Scenarios**:

1. **Given** o jogador atrás de um telhado ou copa, **When** passa ali, **Then** é coberto pela camada de cima.
2. **Given** dois jogadores na mesma área, **When** um está mais abaixo na tela, **Then** é desenhado na frente do outro.
3. **Given** um mapa com níveis sobrepostos (ex.: ponte), **When** o jogador está no nível de cima ou de baixo, **Then** é desenhado e colide no nível certo, mudando de nível só nos tiles de transição.
4. **Given** o jogador perto da borda da área, **When** anda até ela, **Then** a câmera para e não mostra nada além da área.
5. **Given** a janela redimensionada ou em tela cheia, **When** o jogo é desenhado, **Then** a imagem mantém a resolução interna fixa, escalada sem borrar os pixels.

### Edge Cases

- Jogador dentro de um bloqueio (por correção do servidor ou destino de warp ruim): é empurrado para o tile livre mais próximo.
- Warp cujo destino não existe nos dados extraídos: o warp é ignorado e o problema vai para o log, sem travar o jogo.
- Dois warps acionados no mesmo tick, ou input durante o fade: só o primeiro vale.
- Queda de quadros ou movimento rápido não pode atravessar um tile de bloqueio (o passo avança pixel a pixel).
- Gamepad conectado ou desconectado no meio do jogo: o controle passa ao dispositivo ativo sem reiniciar.
- Previsão do cliente diferente do servidor: diferenças pequenas são corrigidas suavemente, sem teleporte visível.
- Pedaço vizinho ausente na matriz: a borda se comporta como bloqueio e a câmera para ali.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O movimento MUST ser livre (posição contínua, não presa a tiles), com velocidades distintas de caminhada e corrida.
- **FR-002**: O teclado e o analógico do gamepad MUST permitir apenas as 4 direções cardinais; não há diagonal. O vetor de input (duas teclas seguradas, ou o analógico fora do eixo) usa só a direção cardinal dominante; o analógico controla também a intensidade, com zona morta.
- **FR-003**: A colisão MUST usar a grade extraída e impedir atravessar bloqueios e água; como não há mais eixo diagonal, o jogador simplesmente para no obstáculo, sem deslizar.
- **FR-004**: O servidor MUST aplicar movimento e colisão de forma autoritativa; o cliente MUST prever o próprio movimento com os mesmos dados e a mesma lógica compartilhada, e reconciliar com o estado do servidor.
- **FR-005**: Ressaltos MUST permitir passar só na direção indicada, com um pulo de um tile; nas outras direções, bloqueiam.
- **FR-006**: Grama alta MUST cobrir os pés do sprite enquanto o jogador está nela.
- **FR-007**: Em mapas com níveis sobrepostos, o jogador MUST ter um nível atual, colidir só com esse nível e mudar de nível apenas em tiles de escada ou transição.
- **FR-008**: A ordem de desenho MUST ser: chão, entidades ordenadas pela posição vertical, camada de cima; em mapas com níveis, cada entidade MUST ser desenhada no seu nível.
- **FR-009**: A câmera MUST seguir o jogador e parar nas bordas da área, sem mostrar além dela.
- **FR-010**: As áreas MUST ser contínuas conforme as matrizes extraídas; os pedaços vizinhos MUST estar carregados antes de entrarem na tela, e a troca de área atual MUST ocorrer sem pausa visível.
- **FR-011**: Warps MUST levar ao destino extraído, com fade de saída e de entrada; durante a transição, o input do jogador MUST ser ignorado.
- **FR-012**: O jogo MUST ser desenhado numa resolução interna fixa, escalada por fator inteiro sem suavização; a janela MUST poder ser redimensionada e MUST haver tela cheia.
- **FR-013**: Cada jogador MUST ver os outros jogadores da mesma área andando, com a mesma ordem de desenho.
- **FR-014**: A lógica de movimento, colisão, ressaltos, níveis e warps MUST ser testável sem a pilha gráfica (princípio V).

### Key Entities

- **Grade de colisão**: categoria por tile e nível, vinda dos dados extraídos.
- **Pedaço de mapa / área**: camadas pré-renderizadas (chão, cima), grade de colisão e posição na matriz.
- **Warp**: tile de origem, mapa e posição de destino.
- **Estado de movimento do jogador**: posição contínua, nível, direção, se está correndo, se está em transição.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Numa conferência manual, é possível ir de New Bark Town a Cherrygrove City e voltar, entrando em todos os prédios do caminho, sem atravessar nenhum obstáculo.
- **SC-002**: Nenhum carregamento visível (pausa, tela preta ou pedaço vazio) ao cruzar a divisa New Bark ↔ Route 29, em 10 travessias seguidas.
- **SC-003**: Mantém 60 fps num PC modesto com 4 jogadores na mesma área.
- **SC-004**: Em movimento normal sem perda de pacotes, a posição prevista pelo cliente e a confirmada pelo servidor diferem em menos de 1 pixel.
- **SC-005**: Todo warp dos três mapas e dos prédios do percurso leva ao destino certo, conferido por teste automatizado contra os dados extraídos.

## Assumptions

- Dados de mapa (camadas, colisão, matrizes, warps) vêm da feature 006; o sprite do jogador, da 007; servidor, protocolo e tick de 20 Hz, da 010.
- Velocidades padrão: caminhada próxima da do original (~1 tile a cada 16 quadros) e corrida ~2×, ajustáveis por dados.
- Resolução interna igual à tela do DS (256×192), escalada por fator inteiro com barras quando a janela não for múltipla.
- Controles padrão: setas/WASD e Shift para correr no teclado; analógico/D-pad e um botão para correr no gamepad. Remapeamento fica fora do escopo.
- Fade de cerca de 0,3 s para escurecer e 0,3 s para clarear.
- Fora do escopo: NPCs e eventos (Marco 3), golpes de campo como Surf e Cut (spec 22), selvagens (spec 15) e combate (spec 13). Água é sempre bloqueio nesta feature.
