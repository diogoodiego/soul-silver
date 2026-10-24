# Tasks: Mapas pré-renderizados e colisão

**Input**: Design documents from `/specs/006-map-prerender/`

**Prerequisites**: [plan.md](./plan.md) (obrigatório), [spec.md](./spec.md) (obrigatório), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/map-api.md](./contracts/map-api.md), [quickstart.md](./quickstart.md)

**Tests**: obrigatórios. A constituição (princípio V) exige test-first para o extrator e para a lógica de `shared`. Cada teste é escrito e precisa falhar antes da implementação correspondente. O visualizador (UI) é exceção e é verificado manualmente.

**Organização**: tarefas agrupadas por história de usuário, para que cada uma seja implementada e testada de forma independente.

**Princípio de cirurgia (karpathy-guidelines)**: cada tarefa altera só os arquivos listados, tem um critério de pronto verificável e não antecipa trabalho de outra história.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: história a que a tarefa pertence (US1, US2, US3); ausente em Setup, Fundação, Integração e Polimento
- Cada descrição traz o caminho exato do arquivo

---

## Phase 1: Setup (infraestrutura compartilhada)

**Propósito**: preparar a estrutura de pastas e as exportações sem mudar comportamento.

- [X] T001 Confirmar em `.gitignore` e no hook de pre-commit que `packages/extractor/assets/` e a pasta de saída `stages/maps/` estão bloqueadas; se não estiverem, ajustar só essas regras. Pronto quando `git check-ignore` retorna a pasta de saída para um arquivo de teste.
- [X] T002 [P] Adicionar a exportação `"./maps"` em `packages/shared/package.json`, apontando para `packages/shared/src/maps/index.ts`. Pronto quando `npm run typecheck -w @soulsilver/shared` passa (o arquivo ainda pode estar vazio).
- [X] T003 [P] Criar as pastas vazias `packages/shared/src/maps/`, `packages/shared/test/maps/`, `packages/extractor/src/maps/`, `packages/extractor/src/viewer/`, `packages/extractor/test/maps/fixtures/` (com `.gitkeep` onde a pasta ficar vazia). Pronto quando as pastas existem no git status.

---

## Phase 2: Fundação (bloqueia todas as histórias)

**Propósito**: verificar o formato da ROM e construir os blocos sem ROM (colisão, schemas, rasterizador, PNG, leitor de modelo).

**⚠️ CRÍTICO**: nenhuma história começa antes do checkpoint desta fase. A verificação R0 pode mudar `PIECE_TILES` e o modelo de pedaço.

### Verificação dos formatos (R0, pré-requisito)

- [X] T004 Escrever `packages/extractor/src/maps/probe.ts`, um script de exploração que lê, da ROM do desenvolvedor, um header de mapa, uma matriz de área, um pedaço e um modelo NSBMD com textura, e imprime a estrutura no console. Não grava dados no repositório. Pronto quando roda sem erro na ROM real e imprime tamanhos e offsets relativos.
- [X] T005 Preencher a seção R0 em `specs/006-map-prerender/research.md` com a estrutura confirmada (sem bytes da ROM). Se `PIECE_TILES` ou o modelo de pedaço diferirem do plano, atualizar `plan.md` e parar para revisão antes de T007. Pronto quando R0 está preenchida e o gate foi decidido.

**Checkpoint R0**: estrutura confirmada e documentada. Se houve mudança, o plano foi revisto.

### Colisão e constantes (shared)

- [X] T006 [P] Escrever `packages/shared/test/maps/collision.test.ts`: `classifyPermission` cobre todas as categorias (`blocked`, `free`, `tallGrass`, `water`, `ledge` com direção, `ladder`, `levelTransition` com `targetLevel`, `special`), e um valor desconhecido vira `special` com `raw` preservado. Deve falhar.
- [X] T007 Escrever `packages/shared/src/maps/constants.ts` (`MAP_TILE_PX = 16`, `PIECE_TILES` confirmado em T005) e `packages/shared/src/maps/collision.ts` (`CollisionCategory`, `classifyPermission`). Depende de T005 e T006. Pronto quando `collision.test.ts` passa.
- [X] T008 [P] Escrever `packages/shared/test/maps/schemas.test.ts`: `parseMapHeader`, `parseArea`, `parseCollision` e `parseMapReport` aceitam exemplos válidos e rejeitam campo ausente, enum inválido, `grid` com tamanho diferente de `width × height`, falha sem `reason`, e aviso `successWithWarnings` sem `warnings`. Cada erro é `MapFormatError` com arquivo, caminho do campo e problema. Deve falhar.
- [X] T009 Escrever `packages/shared/src/maps/schemas.ts`, `packages/shared/src/maps/animated.ts` (`ANIMATED_TEXTURES`) e `packages/shared/src/maps/index.ts` (API do `map-api.md`). Depende de T008. Pronto quando `schemas.test.ts` passa e o typecheck de `shared` passa.

### Rasterizador e PNG (extractor)

- [X] T010 [P] Escrever fixtures em `packages/extractor/test/fixtures/maps/` (divididos em `build-land.ts`, `build-nitro.ts` e `build-gx.ts`) (convenção de `test/fixtures/<tema>/`): builders sintéticos de pedaço 2 × 2 tiles, prédio cúbico com textura 2 × 2 px, matriz 2 × 2 de pedaços e mapa com ponte sobre caminho. Nenhum dado da ROM. Pronto quando o arquivo compila com `npm run typecheck -w @soulsilver/extractor`.
- [X] T011 [P] Escrever `packages/extractor/test/maps/raster.test.ts`: um triângulo conhecido preenche exatamente os pixels esperados; o z-buffer oculta o triângulo de trás; a amostragem de textura é nearest-neighbor (sem mistura de cor). Deve falhar.
- [X] T012 Escrever `packages/extractor/src/maps/raster.ts` (rasterizador com z-buffer, projeção ortográfica fixa de R2, amostragem nearest-neighbor). Depende de T011. Pronto quando `raster.test.ts` passa.
- [X] T013 [P] Escrever `packages/extractor/test/maps/png.test.ts`: `encodePng` gera assinatura PNG correta, dimensões no cabeçalho IHDR e pixels recuperáveis por `node:zlib` inflate. Deve falhar.
- [X] T014 Escrever `packages/extractor/src/maps/png.ts` com `encodePng` usando `node:zlib`. Depende de T013. Pronto quando `png.test.ts` passa.

### Leitor de modelo (extractor)

- [X] T015 [P] Escrever `packages/extractor/test/maps/nsbmd.test.ts`: um modelo NSBMD sintético (cabeçalho, um triângulo com UV e referência de textura) e uma textura NSBTX sintética são lidos para as estruturas esperadas. Usa o builder de T010. Deve falhar.
- [X] T016 Escrever `packages/extractor/src/maps/nsbmd.ts` (leitura de NSBMD e NSBTX, com checagem de limites). Depende de T004 (formato confirmado) e T015. Pronto quando `nsbmd.test.ts` passa.

**Checkpoint da Fundação**: rasterizador, PNG, colisão e schemas testados com dados sintéticos; formato da ROM documentado. As histórias podem começar.

---

## Phase 3: User Story 1 - Imagens e colisão alinhadas por mapa (Priority: P1) 🎯 MVP

**Objetivo**: para cada mapa, gerar as camadas inferior e superior e a colisão por nível, alinhadas tile a tile, com transições entre níveis marcadas.

**Teste independente**: com pedaços e matrizes sintéticos, verificar dimensões, alinhamento tile a tile, separação de camadas, níveis e categorias de colisão. Nenhum passo depende da ROM.

### Testes da US1 (escritos antes e com falha)

- [X] T017 [P] [US1] Escrever em `packages/extractor/test/maps/render.test.ts`: um pedaço 2 × 2 tiles renderizado tem largura e altura `tiles × 16`, e a cor de cada tile sintético aparece no bloco `(x*16, y*16)` correspondente (SC-003).
- [X] T018 [P] [US1] Escrever em `packages/extractor/test/maps/render.test.ts`: uma copa de árvore aparece só na camada `upper`; tronco e chão aparecem só na `lower`.
- [X] T019 [P] [US1] Escrever `packages/extractor/test/maps/levels.test.ts`: a ponte sobre caminho gera dois níveis; os tiles de entrada e saída têm `levelTransition` com `targetLevel` correto; altura ambígua gera aviso `ambiguous-height` e não erro.
- [X] T020 [P] [US1] Escrever `packages/extractor/test/maps/piece.test.ts`: permissões e alturas de um pedaço sintético são lidas para uma matriz `PIECE_TILES × PIECE_TILES`, e a permissão desconhecida é preservada com `raw`.

### Implementação da US1

- [X] T021 [US1] Escrever `packages/extractor/src/maps/piece.ts`: lê permissões, alturas, prédios e modelo de um pedaço, usando `nsbmd.ts`. Depende de T016, T020. Pronto quando `piece.test.ts` passa.
- [X] T022 [US1] Escrever `packages/extractor/src/maps/render.ts` com `renderPiece`: projeção fixa de R2, duas camadas (R4), recorte de prédios para o pedaço. Depende de T012, T014, T017, T018, T021. Pronto quando `render.test.ts` passa.
- [X] T023 [US1] Escrever `packages/extractor/src/maps/levels.ts`: separação de níveis por faixa de altura (R5), tiles de transição com `targetLevel`, aviso `ambiguous-height`. Depende de T019. Pronto quando `levels.test.ts` passa.
- [X] T024 [US1] Em `packages/extractor/src/maps/levels.ts`, montar a colisão por nível com `classifyPermission` e validar cada saída com `parseCollision` antes de gravar. Depende de T009, T023. Pronto quando um teste de `levels.test.ts` confirma que a saída passa em `parseCollision`.

**Checkpoint da US1**: com fixtures sintéticos, um mapa gera camadas e colisão por nível, alinhadas e validadas. MVP entregue.

---

## Phase 4: User Story 2 - Composição e vizinhança das áreas (Priority: P2)

**Objetivo**: para cada área, saber os pedaços que a compõem, os vizinhos e a altura de cada pedaço; e ler o header de cada mapa.

**Teste independente**: com matrizes e headers sintéticos, verificar pedaços por posição, vizinhos, alturas e campos do header.

### Testes da US2 (escritos antes e com falha)

- [X] T025 [P] [US2] Escrever `packages/extractor/test/maps/header.test.ts`: um header sintético com `refs` vazias é aceito; campo ausente gera `MapFormatError` com caminho do campo; tamanho que não é múltiplo de `PIECE_TILES` é rejeitado.
- [X] T026 [P] [US2] Escrever `packages/extractor/test/maps/grid.test.ts`: uma matriz 2 × 2 de pedaços produz `grid` e `pieceHeights` corretos; um índice fora de `pieceHeights` falha com caminho do campo.
- [X] T027 [P] [US2] Escrever em `packages/extractor/test/maps/grid.test.ts`: duas áreas adjacentes listam uma à outra como vizinha com a direção correta (`north`, `south`, `east`, `west`).

### Implementação da US2

- [X] T028 [P] [US2] Escrever `packages/extractor/src/maps/header.ts`: lê o header de mapa (nome, música, clima, `areaType`, `refs` de eventos, scripts e encontros como índices, sem resolver o conteúdo) e valida tamanho múltiplo de `PIECE_TILES`. Depende de T004 e T025. Pronto quando `header.test.ts` passa.
- [X] T029 [US2] Escrever `packages/extractor/src/maps/grid.ts`: monta a matriz de pedaços, as alturas e os vizinhos, e produz o `Area` validado com `parseArea`. Depende de T026, T027. Pronto quando `grid.test.ts` passa.

**Checkpoint da US2**: com fixtures sintéticos, cada área lista pedaços, alturas e vizinhos, e cada mapa tem header validado.

---

## Phase 5: User Story 3 - Visualizador de desenvolvimento (Priority: P3)

**Objetivo**: abrir qualquer mapa no visualizador, alternar camadas e níveis, e sobrepor a colisão colorida por categoria, com legenda.

**Teste independente**: abrir um mapa sintético, alternar camadas e colisão, e conferir cada categoria visualmente.

### Testes e servidor da US3

- [X] T030 [P] [US3] Escrever `packages/extractor/test/maps/viewer.test.ts`: o servidor escuta só em `127.0.0.1`; responde só a GET de arquivos dentro de `stages/maps/`; recusa caminhos com `..` e caminhos absolutos. Deve falhar.
- [X] T031 [US3] Escrever `packages/extractor/src/viewer/serve.ts` com o servidor somente leitura. Depende de T030. Pronto quando `viewer.test.ts` passa.

### Interface e CLI da US3

- [X] T032 [P] [US3] Escrever `packages/extractor/src/viewer/index.html`: seletor de nível, alternância de `lower` e `upper`, sobreposição de colisão com cor fixa por categoria e legenda. Verificação manual (regra V para UI), sem teste automatizado.
- [X] T033 [US3] Em `packages/extractor/src/cli.ts`, adicionar o comando `maps:view -- <mapa-id>` que chama `serve.ts` e abre o navegador. Depende de T031, T032. Pronto quando `npm run maps:view -- new-bark-town` serve a página sem erro (mesmo que o mapa ainda não exista).
- [X] T034 [US3] Adicionar o script `"maps:view"` em `package.json` da raiz, apontando para o comando de T033. Depende de T033.

**Checkpoint da US3**: o visualizador mostra camadas e colisão de um mapa gerado.

---

## Phase 6: Integração - etapa `maps` e relatório (integra US1 e US2)

**Objetivo**: juntar as histórias numa etapa do pipeline com relatório por mapa, falha isolada e saída determinística.

- [X] T035 [P] [US1] [US2] Escrever `packages/extractor/test/maps/stage.test.ts`: a etapa grava `header.json`, `layers/`, `collision/` e `areas.json` por mapa; cada mapa tem `status` (`success`, `successWithWarnings` ou `failure`); uma falha em um mapa não interrompe os outros (FR-013); toda falha tem `stage` e `reason`. Deve falhar.
- [X] T036 [P] [US1] [US2] Escrever em `packages/extractor/test/maps/stage.test.ts`: um mapa com água usando textura animada gera aviso `animated-texture`; uma permissão desconhecida gera aviso `unknown-permission`.
- [X] T037 [US1] [US2] Escrever `packages/extractor/src/maps/stage.ts` com `mapsStage` (id `maps`, version 1), `try/catch` por mapa, gravação com `writeFileAtomic` e `report.json` validado com `parseMapReport`. Depende de T024, T029, T035, T036. Pronto quando `stage.test.ts` passa.
- [X] T038 [US1] [US2] Escrever em `packages/extractor/test/maps/stage.test.ts` o teste de determinismo: duas execuções sobre o mesmo fixture geram arquivos com bytes idênticos (SC-006). Depende de T037.
- [X] T039 [US1] [US2] Registrar `mapsStage` em `packages/extractor/src/stages/index.ts` (`defaultStages`) e exportar a API em `packages/extractor/src/index.ts`. Depende de T037. Pronto quando `npm run extract -- --help` lista a etapa `maps`.
- [X] T040 [US1] [US2] Em `packages/extractor/src/cli.ts`, aceitar `--stage maps` e incluir a seção "Mapas" no `--report`, com status e motivo por mapa. Depende de T037, T039. Pronto quando o relatório fixture mostra a seção.

**Checkpoint da integração**: a etapa roda no pipeline com relatório por mapa, falha isolada e saída determinística.

---

## Final Phase: Polimento e validação

**Propósito**: validação ponta a ponta com a ROM real e a conferência manual dos critérios de sucesso.

- [X] T041 [P] Adicionar a seção "Mapas" em `README.md` (raiz, onde ficam as demais seções do extrator): como rodar a etapa, ler o relatório e abrir o visualizador.
- [X] T042 Rodar `npm run typecheck`, `npm run lint` e os testes de `shared` e `extractor`. Pronto quando tudo passa; se algo falhar, registrar a saída completa, não resumir.
- [X] T043 Rodar `npm run extract -- --stage maps` com a ROM real (quickstart §3). Pronto quando ao menos 95% dos mapas têm `status` diferente de `failure` (SC-002) e toda falha tem `reason`.
- [X] T044 Checar tile a tile na ROM real (quickstart §4): para todos os mapas, largura e altura de cada PNG são `tilesX × 16` e `tilesY × 16`, e cada colisão tem uma célula por tile (SC-003).
- [X] T045 Conferência manual das quatro amostras de SC-001 no visualizador (quickstart §5): New Bark Town, Route 29, Cherrygrove City e uma caverna com níveis sobrepostos. Registrar o resultado no PR.
- [X] T046 Rodar a reexecução determinística com a ROM real (quickstart §6) e comparar hashes dos arquivos de `stages/maps/` (SC-006).
- [X] T047 Revisar o diff da feature contra a constituição (Constitution Check do plano): nenhum dado da ROM commitado, nenhuma dependência nova, nenhum IPC novo.

---

## Phase 7: Animações de textura (FR-009, FR-019, FR-020; escopo revisto)

**Propósito**: gravar a descrição das texturas animadas de cada mapa. A reprodução no tempo fica
com o overworld (FR-020). Esta fase é a opção 1 escolhida em conversa: a extração amplia a 006.

**Gate**: T048 e T049 bloqueiam as tarefas seguintes. Nenhum formato é fixado sem decodificação
confirmada e inspeção visual de uma animação conhecida.

- [X] T048 Escrever em `packages/extractor/src/maps/animation-probe.ts` um probe que decodifica os
  quadros-chave de uma animação `BTA0` (água) e de uma `BTP0`: quantidade de quadros, valores
  por quadro e velocidade. Não grava dados no repositório. Pronto quando imprime a estrutura de
  uma animação e de uma textura de água.
- [X] T049 Confirmar o formato decodificado por inspeção visual: exporta o primeiro e o último
  quadro de uma animação de água como PNG no scratchpad e compara com o jogo. Atualizar a R7 com o
  formato verificado. Pronto quando a R7 traz o formato e a conferência visual foi registrada.
- [X] T050 [P] [US1] Escrever em `packages/extractor/test/maps/animation.test.ts` os testes do
  formato verificado (fixtures sintéticos em `test/fixtures/maps/build-nitro.ts`): quadros lidos
  em ordem, velocidade, tipo de animação e animação sem quadros válidos gerando erro. Devem falhar.
- [X] T051 [US1] Estender `packages/extractor/src/maps/animation.ts` para ler quadros, velocidade e
  tipo, em vez de só os nomes. Depende de T050. Pronto quando `animation.test.ts` passa.
- [X] T052 [P] [US1] Escrever em `packages/shared/test/maps/schemas.test.ts` os testes do schema
  `map-animations` (uma lista por mapa: material, tipo, quadros, velocidade) e do aviso de
  animação. Devem falhar.
- [X] T053 [US1] Adicionar `mapAnimationsFile` em `packages/shared/src/maps/schemas.ts` e exportar
  em `index.ts`. Substitui a lista fixa `ANIMATED_TEXTURES` de `animated.ts`. Depende de T052.
- [X] T054 [US1] Ligar animações ao mapa pelo nome do material (FR-019) em
  `packages/extractor/src/maps/stage.ts`: gravar `animations.json` por mapa e marcar o aviso
  `animated-texture` com o nome do material. Animações sem modelo no mapa não entram. Depende de
  T051 e T053. Pronto quando o teste de etapa cobre a ligação e a exclusão.
- [X] T055 Rodar a etapa com a ROM real (`--force maps`) e conferir que os mapas com água têm
  `animations.json` não vazio. Pronto quando o relatório mostra os mapas com animação e nenhuma
  falha nova.

## Phase 8: Reprodução das animações (FR-020, FR-021)

- [X] T056 [P] Testes de `buildMapScene` num instante do ciclo (rolagem, troca de textura) em `packages/extractor/test/maps/scene.test.ts`.
- [X] T057 Implementar `animations` e `time` em `packages/extractor/src/maps/scene.ts`. Rotação não é tocada (3 materiais; atalho comentado no código).
- [X] T058 [P] Teste e implementação de `changedRegions` em `packages/extractor/src/maps/frames.ts` (caixa alinhada aos tiles, por nível e camada).
- [X] T059 Schema `regions`/`frames` e `ANIMATION_FRAMES` em `packages/shared/src/maps/`, com testes.
- [X] T060 A etapa grava os quadros e as regiões (versão 3); teste em `stage.test.ts`.
- [X] T061 Botão "Animar" no visualizador (`packages/extractor/src/viewer/index.html`), conferido só por checagem de sintaxe; falta a conferência visual no navegador.

---

## Dependências e ordem de execução

### Dependências entre fases

- **Setup (Fase 1)**: sem dependências.
- **Fundação (Fase 2)**: depende de Setup. BLOQUEIA todas as histórias. A verificação R0 (T004, T005) bloqueia T007 e T016.
- **US1 (Fase 3)**: depende da Fundação. É o MVP.
- **US2 (Fase 4)**: depende da Fundação. Não depende da US1, mas a integração (Fase 6) precisa das duas.
- **US3 (Fase 5)**: depende da Fundação e, para a conferência real, de um mapa gerado (Fase 6).
- **Integração (Fase 6)**: depende de US1 e US2.
- **Polimento (Final)**: depende de tudo.

### Dependências dentro de cada história

- Testes antes da implementação, e cada teste precisa falhar antes.
- Leitura (`piece`, `header`) antes de render e grid.
- Render e níveis antes do stage.
- Servidor antes da CLI do visualizador.

### Oportunidades de paralelismo

- Setup: T002 e T003 em paralelo.
- Fundação: os pares de teste (T006, T008, T010, T011, T013, T015) podem rodar em paralelo; cada implementação espera o seu teste.
- US1: os testes T017 a T020 em paralelo.
- US2 e US3 podem ser feitas em paralelo por pessoas diferentes depois da Fundação.

---

## Exemplo de paralelismo: US1

```bash
# Testes da US1, em paralelo (arquivos diferentes ou áreas independentes):
Task: "T017 render: tiles alinhados em 16 px"
Task: "T019 levels: ponte e transições"
Task: "T020 piece: permissões e alturas"
```

---

## Estratégia de implementação

### MVP primeiro (US1)

1. Completar Setup (Fase 1).
2. Completar Fundação (Fase 2), incluindo o checkpoint R0.
3. Completar US1 (Fase 3).
4. **PARAR e VALIDAR**: camadas e colisão alinhadas com fixtures sintéticos.

### Entrega incremental

1. Setup + Fundação: base pronta.
2. US1: imagens e colisão (MVP).
3. US2: composição e header.
4. US3: visualizador.
5. Integração: etapa e relatório no pipeline.
6. Polimento: validação com a ROM real e conferência manual.

---

## Resumo

- **Total de tarefas**: 47
- **Por fase**: Setup 3 · Fundação 13 · US1 8 · US2 5 · US3 5 · Integração 6 · Polimento 7
- **Tarefas por história**: US1 8 (T017 a T024), US2 5 (T025 a T029), US3 5 (T030 a T034); a integração (T035 a T040) carrega as marcas [US1] e [US2].
- **Oportunidades de paralelismo**: 14 tarefas marcadas com [P], além dos pares de teste da fundação.
- **Escopo do MVP**: Fases 1 a 3 (Setup, Fundação e US1), com fixtures sintéticos.

Formato validado: todas as tarefas começam com `- [ ]`, têm ID sequencial, marca `[P]` quando paralelizáveis, marca `[US#]` nas fases de história (e somente nelas), e trazem caminho de arquivo.
