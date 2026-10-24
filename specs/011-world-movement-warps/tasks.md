---

description: "Task list for feature 011 — Mundo, movimento e warps"
---

# Tasks: Mundo, movimento e warps

**Input**: Design documents from `specs/011-world-movement-warps/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: obrigatórios para a lógica (princípio V, test-first): escreva cada teste antes do código e confirme que falha. Render e input do navegador são isentos e validados pelo [quickstart.md](quickstart.md).

**Organization**: por história da spec (US1 P1, US2 P2, US3 P2, US4 P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)

---

## Phase 1: Setup

- [X] T001 Adicionar `pixi.js` 8 (versão exata) às `dependencies` de `packages/client/package.json` e rodar `npm install` na raiz; justificar no plan já feito (princípio X)
- [X] T002 [P] Subir `PROTOCOL_VERSION` de 2 para 3 em `packages/shared/src/protocol-version.ts` e ajustar o valor esperado nos testes de handshake em `packages/server/test/handshake.test.ts`

---

## Phase 2: Foundational (bloqueia todas as histórias)

**Purpose**: protocolo v3, `WorldMap`, carga de mundo no servidor e acesso do renderer aos assets.

- [X] T003 [P] Teste do protocolo v3 em `packages/shared/test/game/protocol.test.ts`: `input` aceita `{ seq, move: { x, y }, run }` com "cada eixo em [-1, 1]"; rejeita eixo fora do intervalo, `NaN`/`Infinity` e o campo antigo `dir`; entidade e delta aceitam `level` "int ≥ 0" (ver [contracts/protocol-v3.md](contracts/protocol-v3.md))
- [X] T004 Implementar o protocolo v3 em `packages/shared/src/game/protocol.ts` (substituir `dir` por `move` + `run`; `level` em `entityFields`) e `level` em `Entity`/`diffEntity` de `packages/shared/src/game/entity.ts`, com default 0 onde entidades são criadas em `packages/server/src/session.ts`
- [X] T005 [P] Teste de `WorldMap` em `packages/shared/test/game/world-map.test.ts` com matriz sintética 2×1 (dois mapas lado a lado): `neighbors` traz `{ map, dx, dy }` com deslocamento em px = células × `PIECE_TILES` × `MAP_TILE_PX`; `widthPx`/`heightPx` corretos; `tileAt(world, mapId, level, xPx, yPx)` resolve tiles fora da borda pelo vizinho e devolve `blocked` sem vizinho
- [X] T006 Implementar `packages/shared/src/game/world-map.ts` (tipo `WorldMap` do [data-model.md](data-model.md), `buildWorldMap(area, mapId, levels, warps)` usando `mapCells`/`mapNeighbors` de `packages/shared/src/maps/areas.ts`, e `tileAt`) e exportar em `packages/shared/src/game/index.ts`
- [X] T007 [P] Teste do loader em `packages/server/test/world-loader.test.ts` com fixtures sintéticas em `packages/server/test/fixtures/world/` (`map-areas.json`, `collision/0.json`, `collision/1.json`, eventos com warps): valida com os schemas zod existentes, monta `WorldMap` por mapa, descarta warp com "`destMap` ausente ou `destAnchor` fora do índice" registrando log, e falha com mensagem clara se um arquivo for inválido
- [X] T008 Implementar `packages/server/src/world-loader.ts` (`loadWorld(dataDir, log)` → `(mapId) => WorldMap | undefined`), lendo `maps/` (006) e `events/` (008) da pasta de extração
- [X] T009 Ligar o loader em `packages/server/src/game-server.ts` (trocar `collision: () => undefined` e o spawn fixo por spawn em New Bark Town vindo dos dados) e mudar a opção `collision` de `packages/server/src/session.ts` para `world: (mapId) => WorldMap | undefined`; atualizar `packages/server/test/harness.ts`
- [X] T010 Servir a pasta de extração ao renderer só para leitura: protocolo `assets://` em `packages/app/src/main/index.ts` com `protocol.handle`, resolvendo caminhos dentro de `assetsPaths.workspace` e recusando `..`/caminhos absolutos (princípio IX); teste da resolução de caminho em `packages/app/test/assets-protocol.test.ts`

**Checkpoint**: servidor carrega o mundo real; renderer consegue buscar PNG/JSON da extração.

---

## Phase 3: User Story 1 — Andar e correr com colisão (P1) 🎯 MVP

**Goal**: andar/correr em New Bark, Route 29 e Cherrygrove, teclado ou gamepad, sem atravessar obstáculos, com previsão no cliente.

**Independent Test**: abrir New Bark, empurrar contra casas, árvores e água nas 4 direções e com o analógico; nada atravessa, sem eixo diagonal para deslizar.

> **Correção (2026-10-24)**: a implementação original desta fase (T011–T022) tinha movimento livre
> em 8 direções, com deslizamento diagonal contra obstáculos. Isso não combina com a proposta do
> jogo (princípio I) e foi reduzida para só as 4 direções cardinais — sem diagonal, mas mantendo
> o movimento livre (posição contínua), não preso à grade de tiles (uma primeira correção havia
> prendido o personagem a andar um tile por vez; não ficou com a sensação desejada e foi revertida
> no mesmo dia). Ver [research.md](research.md) R1/R2/R12, [contracts/movement-step.md](contracts/movement-step.md)
> e [data-model.md](data-model.md) atualizados; `stepMovement` em
> `packages/shared/src/game/movement.ts` e `packages/shared/test/game/movement.test.ts` foram
> reescritos para mover só no eixo dominante do vetor de input.

### Tests (escrever antes, devem falhar)

- [X] T011 [P] [US1] Testes do passo em `packages/shared/test/game/movement.test.ts` cobrindo as garantias 1–5 e 9 de [contracts/movement-step.md](contracts/movement-step.md): determinismo; velocidade = `min(|move|, 1) × (run ? RUN_SPEED_PX : MOVE_SPEED_PX)`; diagonal não mais rápida; caixa de pés nunca sobrepõe `blocked`/`water`/borda sem vizinho; deslizamento por eixo; ledge passa só na direção do ressalto iniciando `data.hop` "int 0–8" e ignora input durante o hop; mapa ausente = aberto; `facing` = direção cardinal dominante
- [X] T012 [P] [US1] Teste de entrada em `packages/server/test/inputs.test.ts`: `move` com módulo > 1 é normalizado, não rejeitado; cliente se move com o novo input
- [X] T013 [P] [US1] Teste de previsão em `packages/client/test/net/prediction.test.ts`: com o mesmo `WorldMap`, previsão e servidor coincidem (< 1 px, SC-004) ao andar contra uma parede e ao pular um ressalto
- [X] T014 [P] [US1] Teste de desencalhe em `packages/shared/test/game/movement.test.ts`: entidade com caixa dentro de sólido vai ao centro do tile livre mais próximo (espiral, "raio ≤ 4 tiles")

### Implementation

- [X] T015 [US1] Reescrever `stepMovement(entity, input, world)` em `packages/shared/src/game/movement.ts` conforme o contrato: `RUN_SPEED_PX = 6`, movimento por eixo pixel a pixel, colisão via `tileAt`, ledges (R4), `unstick` (T014); remover o comentário `shortcut:` de ledges/ladders
- [X] T016 [US1] Atualizar `packages/server/src/session.ts` para chamar o novo passo com `input.move`/`input.run` e o `world` do loader
- [X] T017 [US1] Atualizar `packages/client/src/net/prediction.ts` e `packages/client/src/net/game-connection.ts` para o novo input e para receber `world: (mapId) => WorldMap | undefined` em vez de `collision`
- [X] T018 [P] [US1] Input em `packages/client/src/input/input.ts`: teclado setas/WASD → vetor normalizado de 8 direções, Shift = correr; Gamepad API com eixo esquerdo, zona morta 0,2 reescalada, D-pad como teclado, botão East corre; dispositivo com input mais recente vence; reconexão de gamepad sem reiniciar
- [X] T019 [P] [US1] Carga de mapa no cliente em `packages/client/src/render/map-assets.ts`: busca via `assets://` `collision/<nível>.json`, as camadas `layers/<nível>-<camada>.png` e o `WorldMap` do mapa (mesmo `buildWorldMap` do `shared`)
- [X] T020 [US1] Renderer base em `packages/client/src/render/game-renderer.ts`: `Application` PixiJS com `antialias: false`, escala `nearest`, stage 256×192, chão do mapa atual, sprite do jogador (atlas da 007) com animação de andar por `facing`, câmera centrada no jogador
- [X] T021 [US1] Trocar a vista de texto de `packages/client/src/GameSession.svelte` pelo canvas do renderer, ligando `input.ts` → `game-connection` a cada tick e mantendo o painel de debug do F3
- [X] T022 [US1] Interpolação do jogador local entre os dois últimos passos previstos (R3) em `packages/client/src/render/game-renderer.ts`; demais entidades usam `packages/client/src/net/interpolation.ts`

**Checkpoint**: US1 jogável em um mapa; rodar `npx vitest run` e os passos 1–3 e 6 do quickstart.

---

## Phase 4: User Story 2 — Entrar e sair de prédios por warps (P2)

**Goal**: portas, escadas e cavernas levam ao destino extraído com fade; input travado durante a transição.

**Independent Test**: entrar e sair da casa do jogador e do laboratório em New Bark.

### Tests

- [X] T023 [P] [US2] Testes de warp em `packages/shared/test/game/movement.test.ts` (garantia 8): pés entrando no tile de warp iniciam `data.warping` "int 0–12"; input ignorado enquanto `> 0`; no tick 6 a entidade vai ao warp `destAnchor` do `destMap`, um tile à frente na direção de saída; dois warps no mesmo tick → só o primeiro
- [X] T024 [P] [US2] Teste de sessão em `packages/server/test/session.test.ts`: jogador que entra num warp troca `area` e é replicado no novo mapa; warp com destino inválido é ignorado e logado
- [X] T025 [US2] Teste com dados reais em `packages/server/test/route-warps.test.ts` (SC-005): para New Bark, Route 29, Cherrygrove e seus interiores, todo warp leva a um destino existente e o warp de volta aponta para a origem; `it.skip` quando a extração local não existir

### Implementation

- [X] T026 [US2] Implementar a máquina de warp do [data-model.md](data-model.md) em `packages/shared/src/game/movement.ts` (detecção, contagem de `warping`, troca de área no meio, desencalhe no destino)
- [X] T027 [US2] Garantir em `packages/server/src/session.ts` que a troca de `area` por warp atualiza relevância/replicação (`packages/server/src/relevance.ts`)
- [X] T028 [US2] Fade em `packages/client/src/render/fade.ts` ligado a `data.warping` do jogador local (0,3 s para escurecer, 0,3 s para clarear) e troca do mapa desenhado quando `area` muda, em `packages/client/src/render/game-renderer.ts`

**Checkpoint**: quickstart passo 4.

---

## Phase 5: User Story 3 — Áreas contínuas sem carregamento (P2)

**Goal**: cruzar New Bark ↔ Route 29 ↔ Cherrygrove sem pausa nem pedaço vazio.

**Independent Test**: atravessar a divisa New Bark ↔ Route 29 10 vezes (SC-002).

### Tests

- [X] T029 [P] [US3] Teste da troca de área em `packages/shared/test/game/movement.test.ts` (garantia 7): pés cruzando a borda com vizinho trocam `area` e convertem x/y por `dx`/`dy`; ida e volta retorna à mesma posição
- [X] T030 [P] [US3] Teste em `packages/server/test/session.test.ts`: jogador cruzando a borda passa a ser relevante no mapa vizinho sem perder input

### Implementation

- [X] T031 [US3] Implementar a troca de área na borda em `packages/shared/src/game/movement.ts`
- [X] T032 [US3] Streaming de vizinhos em `packages/client/src/render/map-streamer.ts`: mantém carregados mapa atual + vizinhos diretos, desenha cada vizinho no seu deslocamento, carrega os novos e libera (`destroy`) os que saíram ao trocar de área (R8)
- [X] T033 [US3] Usar o streamer em `packages/client/src/render/game-renderer.ts`, mantendo a câmera contínua na troca de área (reancorar coordenadas sem salto)

**Checkpoint**: quickstart passos 5 e 8.

---

## Phase 6: User Story 4 — Profundidade e câmera (P3)

**Goal**: camada de cima cobre o jogador, entidades por y, níveis, grama alta, câmera presa às bordas, escala inteira e tela cheia.

**Independent Test**: andar atrás de casas e árvores, na grama, até a borda do mapa, e redimensionar/tela cheia.

### Tests

- [X] T034 [P] [US4] Teste de níveis em `packages/shared/test/game/movement.test.ts` (garantia 6): `levelTransition` sob os pés define `level = targetLevel`; colisão usa só o nível atual; `ladder` é andável e não muda nível
- [X] T035 [P] [US4] Teste puro da câmera e escala em `packages/client/test/render/camera.test.ts`: `clampCamera` nunca mostra além da união mapa + vizinhos e centraliza quando o mapa é menor que 256×192; `integerScale(janelaW, janelaH)` = maior inteiro ≥ 1 que cabe, com offset das barras

### Implementation

- [X] T036 [US4] Implementar níveis em `packages/shared/src/game/movement.ts`
- [X] T037 [US4] `packages/client/src/render/camera.ts` com `clampCamera` e `integerScale` (T035) e uso no renderer, com redimensionamento da janela
- [X] T038 [US4] Ordem de desenho por nível em `packages/client/src/render/game-renderer.ts`: `ground` do nível → container de entidades daquele nível com `sortableChildren` e `zIndex = y` → `upper` do nível, níveis em ordem crescente (R11); outros jogadores desenhados na mesma ordem (FR-013)
- [X] T039 [US4] Grama alta em `packages/client/src/render/game-renderer.ts`: quando o tile dos pés é `tallGrass`, recortar a metade de baixo do sprite (R5)
- [X] T040 [US4] Tela cheia por F11 em `packages/client/src/GameSession.svelte` com `requestFullscreen`/`exitFullscreen`, confirmando que `packages/app/src/main/window-options.ts` permite redimensionar

**Checkpoint**: quickstart passos 7 e 9.

---

## Phase 7: Polish & Cross-Cutting

- [X] T041 [P] Teste de desempenho em `packages/server/test/perf.test.ts`: passo de movimento "< 0,1 ms por entidade" e tick com 4 jogadores no mundo carregado dentro do orçamento da 010
- [X] T042 [P] Atualizar `packages/server/test/determinism.test.ts` e `packages/server/test/replay.test.ts` para o input v3 (gravações antigas regeneradas)
- [X] T043 Rodar `npm run typecheck` e `npx vitest run` na raiz e corrigir quebras
- [ ] T044 Executar a conferência manual completa do [quickstart.md](quickstart.md), incluindo 4 clientes e ≥ 60 fps (SC-001 a SC-003), e anotar o resultado no fim do quickstart

---

## Implementation notes

- T007: fixtures são geradas num diretório temporário pelos serializers do `shared` (sempre válidas), em vez de JSON versionado em `test/fixtures/world/`.
- T007/T008: o loader mantém todos os warps (o `destAnchor` é índice na lista); destino inexistente vai para o log e o passo nunca inicia esse warp. Arquivo corrompido vira mapa ausente com log, para não derrubar o tick.
- T015/T026: portas externas são tiles sólidos nos dados reais (0x8069); o warp dispara ao empurrar a porta, ao entrar num tile de warp andável ou ao empurrar parede sobre um tapete. Chegada numa âncora sólida fica um tile abaixo.
- T032: o streaming de mapas ficou dentro de `render/game-renderer.ts` (carrega mapa atual + vizinhos + vizinhos dos vizinhos, para cantos diagonais); `map-streamer.ts` não existe.
- T010: o protocolo `assets://` responde com `Access-Control-Allow-Origin: *` (a página de produção é `file://`, origem `null`); só a sessão do app registra o esquema.
- Mapa 0 é placeholder da matriz e nunca é vizinho (sem isso a câmera abrangia Johto inteira).
- T044 (parcial): conferido no app real via CDP — New Bark renderiza, colisão com árvores, entrar e sair da casa por porta com fade, divisa New Bark → Route 29 sem pausa. Falta: 4 clientes e 60 fps, gamepad físico, Cherrygrove e todos os prédios, grama alta e ressalto na tela.

## Dependencies & Execution Order

- **Setup (T001–T002)** → **Foundational (T003–T010)** → histórias.
- **US1** depende só do Foundational; é o MVP.
- **US2, US3, US4** dependem de US1 (passo novo e renderer base em T015/T020) e são independentes entre si, mas tocam `movement.ts` e `game-renderer.ts`: execute-as em sequência (US2 → US3 → US4) ou coordene esses dois arquivos.
- Em cada história: testes → `shared` → `server` → `client`.
- **Polish** após as histórias desejadas.

## Parallel Examples

- Foundational: T003, T005, T007 juntos (arquivos de teste distintos); depois T004, T006, T008.
- US1: T011, T012, T013, T014 juntos; T018 e T019 em paralelo com T015–T017.
- US2: T023, T024 juntos. US3: T029, T030 juntos. US4: T034, T035 juntos.

## Implementation Strategy

1. **MVP**: Setup + Foundational + US1 → andar com colisão num mapa real, servidor autoritativo e previsão.
2. **+US2**: prédios com warps (já permite o percurso por fade, sem continuidade).
3. **+US3**: divisas contínuas (SC-002).
4. **+US4**: profundidade, câmera e tela cheia.
5. Polish e conferência manual completa (SC-001, SC-003).
