# Research: Mundo, movimento e warps

## R1. Passo de movimento livre, em 4 direções, com colisão

- **Decision**: estender `stepMovement` em `shared/src/game/movement.ts`. Input vira vetor `{x, y}` em [-1, 1] com módulo ≤ 1 e `run`. O vetor é reduzido ao seu eixo dominante antes de mover (sem diagonal — só as 4 direções cardinais existem). Velocidade = módulo do componente dominante × (caminhada ou corrida). Move só nesse eixo, pixel a pixel, com a caixa de pés já existente (±6 px), parando no primeiro bloqueio.
- **Rationale**: já é o código usado por servidor e previsão; mover só no eixo dominante garante as 4 direções sem abandonar a posição contínua (mais fiel à sensação de movimento livre pedida, mesmo não sendo o estilo "presa a tiles" do jogo original).
- **Alternatives**: movimento preso à grade de tiles (um tile por passo) — tentado e revertido a pedido, não ficou com a sensação desejada; movimento livre em 8 direções com deslizamento diagonal (versão original desta spec) — não combina com a proposta do jogo (não é um jogo de ação livre em 8 direções); motor de física (exagero, viola X).

## R2. Velocidades

- **Decision**: caminhada 1 px/quadro do original a 60 Hz → 3 px/tick a 20 Hz (o `MOVE_SPEED_PX` atual); corrida 6 px/tick. Constantes em `shared`.
- **Rationale**: o original anda 1 tile (16 px) em 16 quadros e corre ao dobro.
- **Alternatives**: valores em arquivo de dados — adiado até haver balanceamento (combate, spec 13).

## R3. Posição suave a 20 Hz no render a 60 fps

- **Decision**: o jogador local desenha a posição prevista interpolada entre os dois últimos passos previstos; os outros usam a `interpolation.ts` existente.
- **Rationale**: a previsão anda em ticks; interpolar evita movimento em degraus a 60 fps sem mudar o tick.

## R4. Ressaltos

- **Decision**: tile `ledge` é sólido, exceto quando o jogador entra pelo lado oposto à direção e o vetor aponta na direção do ressalto. Então o passo inicia um pulo: posição vai até o tile seguinte em 8 ticks (`hop` na entidade), sem input nem colisão no meio.
- **Rationale**: pulo de uma direção só, como no original; estado curto e determinístico.
- **Alternatives**: deixar andar devagar por cima (não parece o original).

## R5. Grama alta

- **Decision**: o passo não muda; o render sabe a categoria do tile dos pés e desenha a metade de baixo do sprite atrás de uma máscara de grama (recorte do sprite).
- **Rationale**: é só visual; mantém a simulação simples.

## R6. Níveis sobrepostos

- **Decision**: entidade ganha `level` (default 0). A colisão consulta `collision/<level>.json`. Ao terminar um passo com os pés num `levelTransition`, `level := targetLevel`; `ladder` não muda nível, só é andável.
- **Rationale**: os dados de 006 já trazem colisão por nível e `targetLevel`.

## R7. Áreas contínuas

- **Decision**: `WorldMap` de um mapa guarda os vizinhos (`mapNeighbors`) e o deslocamento em pixels de cada um, calculado pelas células da matriz (`mapCells`, `PIECE_TILES × MAP_TILE_PX`). A colisão fora do mapa consulta o vizinho. Quando os pés cruzam a borda, o servidor troca `area` e converte x/y para o sistema do vizinho. Sem vizinho, a borda é sólida.
- **Rationale**: usa `areas.ts` existente; o mapa continua sendo a unidade de relevância da 010.
- **Alternatives**: coordenadas globais da matriz (quebra relevância por área e o protocolo).

## R8. Carga antecipada no cliente

- **Decision**: o renderer mantém carregadas as texturas do mapa atual e de todos os vizinhos diretos; ao trocar de área, carrega os novos vizinhos e solta os que saíram. Vizinhos são desenhados no deslocamento de R7.
- **Rationale**: um mapa externo tem poucos vizinhos e cada camada é um PNG; carga ocorre muito antes da borda (a tela mostra 8 tiles a partir do jogador, o mapa tem 32+).

## R9. Warps

- **Decision**: warps vêm dos eventos de 008 (`x`, `z`, `destMap`, `destAnchor`). O servidor detecta quando o tile dos pés entra num warp, marca `warping` por 12 ticks (0,3 s fade-out + 0,3 s fade-in), descarta input nesse período e move a entidade para o warp `destAnchor` do mapa de destino, um tile à frente na direção de saída. Destino inválido: ignora e registra log.
- **Rationale**: o servidor é autoritativo; o cliente só lê `warping` para desenhar o fade.

## R10. Render e escala

- **Decision**: PixiJS 8, `antialias: false`, `TextureStyle.defaultOptions.scaleMode = "nearest"`, stage 256×192 numa `RenderTexture`/container escalado pelo maior inteiro que cabe na janela, centralizado com barras. Tela cheia pelo `requestFullscreen` do renderer (e F11). Câmera presa ao retângulo do mapa atual unido aos vizinhos.
- **Rationale**: PixiJS é o renderer da constituição; escala inteira garante pixels nítidos.

## R11. Ordem de desenho

- **Decision**: containers por nível: `ground` do nível, entidades daquele nível com `sortableChildren` e `zIndex = y`, `upper` do nível. Níveis em ordem crescente.
- **Rationale**: camada de cima cobre o jogador atrás de telhados; ordenar por y resolve 4 jogadores.

## R12. Input

- **Decision**: teclado (setas/WASD, Shift corre) gera um vetor a partir das teclas seguradas; gamepad via Gamepad API, eixo esquerdo com zona morta 0,2 e intensidade reescalada, D-pad como teclado, botão B/East corre. O dispositivo com input mais recente vence. O vetor pode apontar na diagonal (duas teclas ou um analógico inclinado); é o passo de movimento (`stepMovement`, R1) que só usa o eixo dominante, resultando em só 4 direções de fato.
- **Rationale**: APIs do navegador, sem dependência; decidir a direção cardinal num único lugar (o passo, autoritativo) em vez de duplicar a regra no input evita que cliente e servidor divirjam.

## Revisão (2026-10-24): render 3D com three.js

- **Decision**: o `client` troca PixiJS por three.js 0.186.1 (versão exata). Cada mapa é a malha
  exportada pela etapa `maps` (`mesh.json`, `mesh.bin`, `textures/`), desenhada numa câmera
  oblíqua fixa (`camera.ts`, `obliqueProjection`): a tela é `(x, z - 0.75·y)` e a profundidade cresce
  com `y + 0.75·z`. Os sprites ficam em pé (plano de z constante) na altura do chão do tile, e o
  z-buffer decide o que cobre o jogador. Resolução interna, escala inteira, câmera presa aos
  vizinhos e fade continuam como antes.
- **Rationale**: elimina as camadas abaixo/acima do jogador, os recortes de animação e os casos
  especiais de ponte e rampa do pré-render; aproxima o visual do DS. Justificativa da dependência
  (princípio X): um renderer WebGL com z-buffer, texturas com wrap/espelhamento e matriz de
  projeção própria; o PixiJS é 2D e não tem z-buffer. three.js não usa `eval`, então dispensa o
  `pixi.js/unsafe-eval` com a CSP atual.
- **Alternativas**: WebGL2 puro (rejeitado: mais código próprio para shaders, texturas e buffers);
  manter o pré-render (rejeitado pelo custo dos casos especiais).
- **Limitações**: altura do chão por tile (escadas e rampas sobem um tile de cada vez); rotação de
  textura animada continua sem tocar; translúcidos são ordenados por grupo, não por triângulo.
