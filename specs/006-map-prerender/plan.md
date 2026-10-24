# Implementation Plan: Mapas pré-renderizados e colisão

**Branch**: `006-map-prerender` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-map-prerender/spec.md`

## Summary

Acrescentar ao pipeline uma etapa `maps` que converte os mapas da ROM em imagens
pré-renderizadas em projeção fixa, com camadas inferior e superior, colisão por tile traduzida
em categorias e níveis separados quando há sobreposição. Também um visualizador de
desenvolvimento local para conferir o resultado. Decisões em [research.md](./research.md):

1. **Verificação dos formatos (R0)**: antes do código de produção, confirmar na ROM real a
   estrutura de headers, matrizes, pedaços e modelos NSBMD/NSBTX.
2. **Projeção e alinhamento (R1, R2)**: 16 px por tile, projeção ortográfica isométrica fixa,
   alinhamento `(x*16, y*16)` garantido por construção.
3. **Renderização sem GPU (R3)**: rasterizador TypeScript com z-buffer e PNG via `node:zlib`.
4. **Camadas e níveis (R4, R5)**: duas camadas por mapa; níveis por faixa de altura, com
   transições marcadas.
5. **Colisão (R6)**: tabela de permissões em dados de `shared`, com valor original preservado.
6. **Visualizador (R9)**: HTML local servido pela CLI, somente leitura, sem IPC.

## Technical Context

**Language/Version**: TypeScript 6.0 (strict), Node.js 24 LTS (herdados).

**Primary Dependencies**: nenhuma nova. `zod` já está em `shared`; o extrator usa `node:zlib` (PNG)
e módulos nativos do Node. O visualizador é HTML e JavaScript puros.

**Storage**: área de trabalho da 003, etapa `maps`: PNG por camada, JSON por colisão e por mapa
(`%APPDATA%\SoulSilver Desktop\extraction\stages\maps\` no app; `assets/stages/maps/` na CLI).

**Testing**: Vitest (`extractor`, `shared`), com fixtures sintéticos montados por builders
(pedaço 2 × 2, prédio cúbico, matriz 2 × 2, ponte sobre caminho).

**Target Platform**: Windows 10/11 x64 (app e CLI).

**Project Type**: biblioteca + CLI no pacote `extractor`; modelos, colisão e tabelas em `shared`;
visualizador de desenvolvimento local.

**Performance Goals**:

- etapa `maps` inteira em menos de 2 min na primeira extração (ordem de grandeza dos ~500 mapas
  com pedaços 32 × 32 tiles; a medir no R0);
- visualizador abre um mapa em menos de 1 s.

**Constraints**:

- alinhamento tile a tile exato, sem deslocamento acumulado (SC-003);
- saída determinística (SC-006);
- `shared/src/maps/` sem APIs do Node, para servidor e renderer usarem a tabela de colisão;
- nenhum dado da ROM no repositório; testes sintéticos (princípio II);
- falha de um mapa não interrompe os demais (FR-013).

**Scale/Scope**: ~500 headers de mapa, pedaços e modelos de dezenas de MB no total; ~15 arquivos
novos no `extractor`, ~6 em `shared`, 1 visualizador HTML.

### Dependências novas (princípio X)

Nenhuma. Rejeitadas: `node-canvas` e `sharp` (binários nativos, R3) e renderer WebGL headless
(depende de GPU, R3).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Status | Como o plano atende |
|-----------|--------|---------------------|
| I. Conteúdo fiel | ✅ | Os mapas, colisões e prédios vêm dos dados da ROM. A tabela de categorias (R6) só traduz permissões; o valor original é preservado em `raw`. |
| II. Assets nunca distribuídos | ✅ | As imagens e colisões nascem na máquina do jogador, em `stages/maps/`, ignorada e bloqueada pelo hook. Os testes são sintéticos (R11). A conferência com a ROM real é manual (quickstart §5). |
| III. Data-driven | ✅ | Headers, áreas, colisão e relatório são arquivos JSON com schema validado no carregamento e erro com arquivo, caminho e problema (`MapFormatError`). A tabela de permissões e a lista de texturas animadas são dados. |
| IV. Servidor autoritativo | ✅ | `shared/src/maps/` é puro, então o servidor usa a mesma tabela de colisão. A extração roda no extractor-host existente, fora do servidor de jogo. |
| V. Test-first | ✅ | Tradução de permissões, schemas, renderização de pedaço, alinhamento, camadas, níveis, rasterizador, PNG, etapa, relatório e CLI têm testes escritos antes, com fixtures sintéticos. O visualizador é verificado manualmente (quickstart §5), como manda a regra para UI. |
| VI. Contratos versionados | ✅ | Tipos e schemas em `shared` ([contracts/map-api.md](./contracts/map-api.md)); `formatVersion` em header, colisão e relatório; `version` na etapa. |
| VII. Progresso individual | N/A | Sem estado de jogador. |
| VIII. Saves | N/A | Sem saves. |
| IX. Segurança do Electron | ✅ | Nenhuma nova superfície de IPC. O visualizador é HTML local em `127.0.0.1`, somente leitura, fora do app. |
| X. Desempenho e simplicidade | ✅ | Zero dependências novas. Rasterizador pequeno, sem framework. A verificação R0 evita refazer o desenho se o formato for diferente do esperado. |
| XI. Entrega incremental | ✅ | Parte do Marco 1 (extrator). Entrega o insumo do overworld (spec 7) e do mundo contínuo. |
| Restrições técnicas | ✅ | Pacote `extractor` como biblioteca + CLI, Windows apenas, TypeScript strict. |
| Idioma | ✅ | Docs em PT-BR; código, identificadores e logs em inglês. |
| Fluxo de desenvolvimento | ✅ | Typecheck, lint e testes cobrem `extractor` e `shared`. |

**Resultado (pré-pesquisa)**: aprovado.

**Resultado (pós-design)**: aprovado, sem violações. Duas notas:

- **Formato dos mapas**: as hipóteses de estrutura (research R0) não foram verificadas no código
  deste repositório; a verificação R0 é pré-requisito e pode mudar `PIECE_TILES` e o modelo de
  pedaço. Se mudar, o plano volta ao passo de design antes de implementar.
- **Renderização em software**: o custo do rasterizador é a principal incerteza de desempenho;
  a medição no R0 decide se é preciso otimizar antes de seguir.

## Project Structure

### Documentation (this feature)

```text
specs/006-map-prerender/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── map-api.md
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/shared/
├── src/maps/
│   ├── index.ts                     # API do contrato map-api.md
│   ├── constants.ts                 # MAP_TILE_PX, PIECE_TILES
│   ├── collision.ts                 # CollisionCategory, classifyPermission (R6)
│   ├── schemas.ts                   # map-header, area, collision, map-report; parse*, MapFormatError
│   └── animations.ts                # schema map-animations (R7)
└── test/maps/
    ├── collision.test.ts  schemas.test.ts

packages/extractor/
├── src/maps/
│   ├── probe.ts                     # R0: exploração da ROM (fora do build de produção, sem dados)
│   ├── header.ts                    # leitura do header de mapa
│   ├── grid.ts                      # matriz de pedaços
│   ├── piece.ts                     # permissões, alturas, prédios e modelo de cada pedaço
│   ├── nsbmd.ts                     # leitura de modelos NSBMD e texturas NSBTX
│   ├── raster.ts                    # rasterizador com z-buffer (R3)
│   ├── png.ts                       # encodePng via node:zlib
│   ├── render.ts                    # renderPiece, camadas inferior e superior (R2, R4)
│   ├── levels.ts                    # níveis e transições (R5)
│   ├── stage.ts                     # mapsStage e relatório por mapa
│   └── index.ts
├── src/stages/index.ts              # + mapsStage em defaultStages
├── src/cli.ts                       # + --stage maps; + maps:view
├── src/viewer/
│   ├── serve.ts                     # servidor local somente leitura em 127.0.0.1
│   └── index.html                   # visualizador: camadas, níveis, colisão colorida
└── test/maps/
    ├── fixtures/builders.ts         # pedaço, prédio, matriz e ponte sintéticos
    ├── raster.test.ts  png.test.ts  render.test.ts  levels.test.ts
    ├── header.test.ts  piece.test.ts  stage.test.ts  viewer.test.ts
```

**Structure Decision**: segue as features 003, 004 e 005. Lógica sem ROM e sem disco (colisão,
schemas, categorias, animadas) mora em `shared`, para o servidor e o visualizador usarem. O que
conhece os bytes da ROM e o rasterizador mora no `extractor`. O visualizador fica em
`extractor/src/viewer/` porque é ferramenta de desenvolvimento, não parte do app.

## Complexity Tracking

Nenhuma violação da constituição a justificar.
