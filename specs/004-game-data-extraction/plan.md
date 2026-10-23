# Implementation Plan: Dados do jogo

**Branch**: `004-game-data-extraction` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-game-data-extraction/spec.md`

## Summary

Acrescentar ao pipeline da 003 uma etapa de descompressão de código (BLZ do ARM9 e dos overlays)
e seis etapas de dados, que leem as estruturas originais e gravam doze arquivos JSON:

| Etapa | Arquivos |
|-------|----------|
| `data-species` | espécies e formas |
| `data-moves` | golpes |
| `data-learnsets` | learnsets, TMs/HMs, tutores |
| `data-evolutions` | evoluções |
| `data-items` | itens |
| `data-tables` | tipos, tabela de tipos, naturezas, curvas de experiência, habilidades |

Os formatos e offsets foram conferidos na ROM real ([research.md](./research.md)). Os schemas
ficam em `@soulsilver/shared/game-data` (zod), usados para validar tanto na geração quanto no
carregamento. A saída é determinística, para reextrações idênticas byte a byte. A CLI ganha
`--report`, um relatório de sanidade local (contagens, schemas, faixas e referências) que não
roda na CI.

## Technical Context

**Language/Version**: TypeScript 6.0 (strict), Node.js 24 LTS (herdados).

**Primary Dependencies**: nova, `zod` 4.6.x em `packages/shared` (R12). O resto usa só módulos
nativos do Node.

**Storage**: arquivos JSON nas saídas das etapas, dentro da área de trabalho da 003
(`%APPDATA%\SoulSilver Desktop\extraction\stages\data-*\json\` no app; `assets/stages/...` na
CLI).

**Testing**: Vitest (`extractor`, `shared`), com builders sintéticos e um codificador BLZ só para
testes.

**Target Platform**: Windows 10/11 x64 (app e CLI).

**Project Type**: biblioteca + CLI no pacote `extractor`; schemas no pacote `shared`.

**Performance Goals**: no máximo 30 s a mais na preparação do jogo (SC-006). A estimativa é
abaixo de 5 s: ~3 MB de código para descomprimir e algumas centenas de KB de dados.

**Constraints**:

- saída determinística (SC-003);
- nenhum ajuste de valores (princípio I);
- nenhum dado da ROM no repositório; os testes são sintéticos (princípio II);
- o módulo de schemas não usa APIs do Node, para que o servidor possa importá-lo.

**Scale/Scope**:

- 505 espécies e formas, 467 golpes, 513 itens, 100 máquinas, 52 tutores, 25 naturezas, 18
  tipos, 6 curvas e 123 habilidades;
- ~25 arquivos novos no `extractor` e ~10 no `shared`.

### Dependências novas (princípio X)

| Dependência | Onde | Justificativa |
|-------------|------|---------------|
| `zod` ^4.6 | `shared` (runtime) | Os doze schemas, com enums e uniões, ficariam centenas de linhas de guardas à mão. O zod dá o caminho do campo em cada erro (princípio III), infere os tipos e roda no Node, no Electron e no renderer (R12). |

Rejeitadas: valibot, Ajv/JSON Schema, `ndstool`/`blz` externos, arquivos da decomp
`pokeheartgold` (R2, R12).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Status | Como o plano atende |
|-----------|--------|---------------------|
| I. Conteúdo fiel | ✅ | Todos os números vêm da ROM e são gravados crus (FR-018). Os identificadores originais de efeito, método e uso são preservados. Nenhum ajuste: `docs/balance-log.md` não muda. |
| II. Assets nunca distribuídos | ✅ | Os dados nascem na máquina do jogador, na pasta de dados (app) ou em `assets/` (CLI, ignorada e bloqueada). O repositório guarda só estrutura: offsets, o mapeamento de formas (identidade) e contagens públicas (R10, R15). Os testes usam builders sintéticos (R16). O relatório com a ROM real é só local. |
| III. Data-driven | ✅ | Doze arquivos de dados com schema validado na geração e no carregamento, com erro de arquivo, caminho e problema (R12, contrato). |
| IV. Servidor autoritativo | ✅ | O módulo de schemas é puro (sem Node e sem Electron), pronto para o servidor importar. A extração continua no extractor-host da 003. |
| V. Test-first | ✅ | BLZ, cada leitor de tabela, cada etapa, os schemas, o determinismo e o relatório têm testes escritos antes, com dados sintéticos (R16). Não há UI nova. |
| VI. Contratos versionados | ✅ | Os schemas ficam em `shared`. Cada arquivo tem `formatVersion`, e cada etapa tem `version` (FR-015). |
| VII. Progresso individual | N/A | — |
| VIII. Saves | N/A | — |
| IX. Segurança do Electron | ✅ | Não há nova superfície de IPC: as etapas rodam no extractor-host existente. |
| X. Desempenho e simplicidade | ✅ | Uma dependência justificada. Offsets fixos em vez de busca por padrões. Uma etapa por grupo de dados, sem framework. |
| XI. Entrega incremental | ✅ | Segundo passo do Marco 1 e base de dados para o núcleo (Marco 2). |
| Idioma | ✅ | Docs, títulos de etapa e textos do relatório em PT-BR; código, chaves de enum e campos em inglês. |

**Resultado (pré-pesquisa)**: aprovado.

**Resultado (pós-design)**: aprovado, sem violações. Notas:

- **Offsets fixos**: são aceitáveis porque a ROM é travada por hash, e cada tabela tem uma
  checagem estrutural (R10).
- **Contagens esperadas**: os números de R15 são públicos e foram conferidos com a ROM real; não
  são dados de conteúdo.

## Project Structure

### Documentation (this feature)

```text
specs/004-game-data-extraction/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── game-data-api.md
│   ├── stages.md
│   └── cli-report.md
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/shared/
├── package.json                     # + dependência zod; + export "./game-data"
├── tsconfig.json                    # + allowImportingTsExtensions
├── src/game-data/
│   ├── index.ts                     # API do contrato game-data-api.md
│   ├── common.ts                    # envelope, TextRef, Stats, chaves de enum, helpers
│   ├── species.ts  moves.ts  learnsets.ts  evolutions.ts  items.ts  tables.ts
│   └── parse.ts                     # parseGameDataFile/Json, serializeGameDataFile, mensagens PT-BR
└── test/game-data/
    ├── parse.test.ts                # envelope, ordem, estrito, mensagens, round-trip
    └── schemas.test.ts              # regras de cada schema

packages/extractor/
├── src/
│   ├── data/
│   │   ├── layout.ts                # SOULSILVER_US_LAYOUT + tipo DataLayout (R10)
│   │   ├── blz.ts                   # descompressão BLZ (R2)
│   │   ├── code.ts                  # ARM9 (module params) + overlays → buffers
│   │   ├── readers/
│   │   │   ├── personal.ts  move.ts  learnset.ts  evolution.ts  item.ts
│   │   │   └── tables.ts            # tipos, naturezas, experiência, TM, tutores, mapa de itens
│   │   ├── stages.ts                # createDataStages(layout): as 6 etapas de dados
│   │   ├── report.ts                # buildSanityReport, formatSanityReport, EXPECTED_COUNTS
│   │   └── write.ts                 # grava um arquivo validado (parse + serialize)
│   ├── stages/
│   │   ├── code-decompress.ts       # etapa code-decompress
│   │   └── index.ts                 # defaultStages ampliado
│   ├── cli.ts                       # + --report
│   └── index.ts                     # + exports
└── test/
    ├── fixtures/game-data/          # builders binários sintéticos + encodeBlz (só teste)
    └── data/
        ├── blz.test.ts  code.test.ts
        ├── personal.test.ts  move.test.ts  learnset.test.ts  evolution.test.ts  item.test.ts  tables.test.ts
        ├── stages.test.ts           # cada etapa ponta a ponta com layout sintético
        ├── determinism.test.ts      # SC-003
        ├── stages-update.test.ts    # SC-005
        └── report.test.ts

README.md                            # + "Dados do jogo" (arquivos gerados, --report)
```

**Structure Decision**: segue a 003. A leitura de cada formato é uma função pura (`readers/`)
que recebe buffers e devolve registros; as etapas só fazem I/O e validação; os schemas ficam em
`shared`. O layout é injetado para que os testes usem offsets sintéticos.

## Complexity Tracking

Nenhuma violação da constituição a justificar.
