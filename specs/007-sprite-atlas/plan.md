# Implementation Plan: Sprites

**Branch**: `007-sprite-atlas` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-sprite-atlas/spec.md`

## Summary

Acrescentar ao pipeline uma etapa `sprites` que converte os gráficos 2D da ROM (tiles 4/8 bpp com
paleta, comprimidos em parte) em atlas PNG com metadados JSON de quadros, âncoras e animações,
mais um relatório e uma página de pré-visualização de desenvolvimento. Decisões em
[research.md](./research.md):

1. **Verificação dos formatos (R0)**: antes do código de produção, confirmar na ROM real onde
   ficam e como se decodificam os sprites de overworld (jogador, NPCs, Pokémon) e os mapeamentos
   de índice para espécie, forma, gênero, item e treinador. Os arquivos de batalha, ícones e
   treinadores já foram localizados (achados parciais em R0).
2. **Decodificação própria e mínima (R1)**: leitor de NCGR/NCLR/NCER/NANR e de LZ10 em
   TypeScript, sem dependência nova; reaproveita `encodePng` da 006.
3. **Atlas por categoria, em páginas (R2)**: empacotador determinístico por prateleiras; shiny é
   uma segunda imagem com os mesmos retângulos, então os metadados existem uma vez só.
4. **Metadados em `shared` (R3)**: schemas zod, `formatVersion`, erro com arquivo, campo e
   problema; nomes derivados dos identificadores numéricos da 004.
5. **Espelhamento por metadado (R4)**: quadro espelhado não é duplicado; a animação marca `flipX`.
6. **Falha parcial com limite (R5)**: sprite com erro vai ao relatório; zero perdas toleradas para
   os 493 Pokémon.
7. **Pré-visualização (R6)**: página HTML local, somente leitura, reaproveitando o servidor do
   visualizador de mapas, fora do app distribuído.

## Technical Context

**Language/Version**: TypeScript 6.0 (strict), Node.js 24 LTS (herdados).

**Primary Dependencies**: nenhuma nova. `zod` já está em `shared`; `node:zlib` para PNG (via
`maps/png.ts`); a página de pré-visualização é HTML e JavaScript puros.

**Storage**: área de trabalho da 003, etapa `sprites`: `stages/sprites/sprites/` com um PNG por
página de atlas e variante, um JSON por categoria e `report.json`
(`%APPDATA%\SoulSilver Desktop\extraction\stages\sprites\` no app; `assets/stages/sprites/` na
CLI).

**Testing**: Vitest (`extractor`, `shared`), com fixtures sintéticos montados por builders
(NCGR 4 bpp de 8 × 8, NCLR de 16 cores, NCER/NANR mínimos, NARC de 3 membros, LZ10 de poucos
bytes).

**Target Platform**: Windows 10/11 x64 (app e CLI).

**Project Type**: biblioteca + CLI no pacote `extractor`; tipos e schemas em `shared`;
pré-visualização de desenvolvimento local.

**Performance Goals**:

- etapa `sprites` inteira em menos de 90 s na primeira extração (≈ 3 mil gráficos de batalha,
  ≈ 550 ícones, ≈ 800 sprites de overworld; a medir no R0);
- a página abre uma lista de milhares de sprites e anima um em menos de 1 s.

**Constraints**:

- saída determinística byte a byte (SC-004): ordem de empacotamento fixa, PNG sem metadados
  variáveis;
- `shared/src/sprites/` sem APIs do Node, para o renderer (feature 11) usar os schemas;
- nenhum dado da ROM no repositório; testes sintéticos (princípio II);
- falha de um sprite não interrompe os demais, dentro do limite do relatório (FR-015).

**Scale/Scope**: ≈ 2,3 mil quadros de batalha normais (493 espécies × frente/costas × gêneros e
formas), ≈ 550 ícones, ≈ 800 itens e treinadores, ≈ 850 gráficos de overworld; ≈ 12 arquivos
novos no `extractor`, ≈ 5 em `shared`, 1 página HTML.

### Dependências novas (princípio X)

Nenhuma. Rejeitadas: `sharp`/`node-canvas` (binários nativos) e bibliotecas de empacotamento de
atlas (o empacotador de prateleiras cabe em ~60 linhas e precisa ser determinístico).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Status | Como o plano atende |
|-----------|--------|---------------------|
| I. Conteúdo fiel | ✅ | Quadros, paletas, âncoras e durações vêm dos dados da ROM; nada é redesenhado. Cores convertidas sem ajuste. |
| II. Assets nunca distribuídos | ✅ | PNGs e JSON nascem em `stages/sprites/` na máquina do jogador, ignorada e bloqueada pelo hook. Testes sintéticos (R8). Conferência com a ROM real é manual (quickstart §5). |
| III. Data-driven | ✅ | Índice de atlas, quadros, animações e relatório são JSON com schema validado no carregamento; erro com arquivo, caminho e problema (`SpriteFormatError`). As tabelas de mapeamento do layout são dados. |
| IV. Servidor autoritativo | N/A | A etapa roda no extractor-host; nenhum dado dela decide estado de jogo. |
| V. Test-first | ✅ | LZ10, NCGR, NCLR, NCER, NANR, empacotador, PNG, schemas, etapa, relatório e CLI têm testes escritos antes, com fixtures sintéticos. A página de pré-visualização é verificada manualmente (quickstart §4). |
| VI. Contratos versionados | ✅ | Tipos e schemas em `shared` ([contracts/sprite-api.md](./contracts/sprite-api.md)); `formatVersion` no índice e no relatório; `version` na etapa. |
| VII. Progresso individual | N/A | Sem estado de jogador. |
| VIII. Saves | N/A | Sem saves. |
| IX. Segurança do Electron | ✅ | Nenhuma nova superfície de IPC. A página é HTML local em `127.0.0.1`, somente leitura, fora do app. |
| X. Desempenho e simplicidade | ✅ | Zero dependências novas; leitores pequenos; empacotador simples. Atlas em páginas de no máximo 2048 × 2048 para o renderer carregar sem GPU exigente. |
| XI. Entrega incremental | ✅ | Marco 1 (extrator); entrega o insumo do overworld e do combate. |
| Restrições técnicas | ✅ | Biblioteca + CLI no `extractor`, Windows apenas, TypeScript strict. |
| Idioma | ✅ | Docs em PT-BR; código, identificadores e logs em inglês. |
| Fluxo de desenvolvimento | ✅ | Typecheck, lint e testes cobrem `extractor` e `shared`. |

**Resultado (pré-pesquisa)**: aprovado.

**Resultado (pós-design)**: aprovado, sem violações. Duas notas:

- **Overworld (P1) ainda sem formato confirmado**: R0 localizou batalha, ícones e treinadores,
  mas não o formato nem o mapeamento dos sprites de overworld (jogador, NPCs, Pokémon). O
  candidato é `a/0/8/1` (832 `BTX0`, 14 `BMD0`), que parece 3D com textura em quadro, não
  NCGR. Se o overworld precisar de renderização de quadro a partir de textura NSBTX, o plano
  reaproveita o decodificador de textura da 006 (`maps/texture.ts`); isso é decidido no R0, antes
  de implementar a história 1.
- **Anim. de batalha**: os sprites de batalha são imagens estáticas por quadro (frente/costas);
  a spec não exige animação de batalha, então não se extrai a animação de entrada.

## Project Structure

### Documentation (this feature)

```text
specs/007-sprite-atlas/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── sprite-api.md
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/shared/src/sprites/
├── index.ts          # API do contrato sprite-api.md
├── constants.ts      # SPRITE_FORMAT_VERSION, ATLAS_MAX_SIZE, categorias, direções
├── schemas.ts        # sprite-index, sprite-report; parse*, SpriteFormatError
└── names.ts          # spriteName(): composição de nomes a partir dos ids da 004

packages/extractor/src/sprites/
├── lz10.ts           # descompressão LZ10
├── nitro-gfx.ts      # NCGR (tiles), NCLR (paleta), NCER (células), NANR (animações)
├── decode.ts         # tiles + paleta -> RGBA (índice 0 transparente)
├── pack.ts           # empacotador por prateleiras, determinístico
├── layout.ts         # onde cada categoria vive e como índice vira espécie/forma/gênero/item
├── overworld.ts      # categorias de overworld (decisão final após R0)
├── battle.ts         # frente/costas, normal/shiny
├── icons.ts          # ícones de Pokémon e de itens
├── trainers.ts       # sprites de treinadores
├── report.ts         # SpriteReport + resumo para a CLI
├── stage.ts          # Stage `sprites`
└── probe.ts          # sonda R0 (somente contagens)

packages/extractor/src/viewer/
├── sprites.html      # pré-visualização animada (somente dev)
└── serve.ts          # (existente) ganha a rota dos sprites
```

**Structure Decision**: segue a organização da 006 (pasta por etapa, contrato em `shared`, sonda R0
no código, visualizador em `viewer/`). O PNG vem de `maps/png.ts`, importado direto; mover para um
módulo comum só se uma terceira etapa precisar.

## Complexity Tracking

Sem violações a justificar.
