# Contrato: etapas novas do pipeline

**Base**: [003 — como uma etapa se pluga](../../003-rom-extraction-pipeline/contracts/extractor-library-api.md#como-uma-etapa-futura-se-pluga-specs-4-a-9)
**Definidas em**: `packages/extractor/src/stages/` e `packages/extractor/src/data/`

`defaultStages` passa a ser:

```ts
[romUnpackStage, codeDecompressStage, ...createDataStages(SOULSILVER_US_LAYOUT)]
```

| Id | Título (PT-BR, aparece no progresso) | v | Peso | Entradas | Saídas | `estimateBytes` |
|----|--------------------------------------|---|------|----------|--------|-----------------|
| `code-decompress` | Descomprimindo o código do jogo | 1 | 2 | `rom-unpack/binaries` | `code` | 8 MiB |
| `data-species` | Lendo os Pokémon | 1 | 1 | `rom-unpack/narc` | `json` | 1 MiB |
| `data-moves` | Lendo os golpes | 1 | 1 | `rom-unpack/narc` | `json` | 1 MiB |
| `data-learnsets` | Lendo os golpes que cada Pokémon aprende | 1 | 1 | `rom-unpack/narc`, `rom-unpack/filesystem`, `code-decompress/code` | `json` | 2 MiB |
| `data-evolutions` | Lendo as evoluções | 1 | 1 | `rom-unpack/narc` | `json` | 1 MiB |
| `data-items` | Lendo os itens | 1 | 1 | `rom-unpack/narc`, `code-decompress/code` | `json` | 1 MiB |
| `data-tables` | Lendo tipos, naturezas e experiência | 1 | 1 | `rom-unpack/narc`, `code-decompress/code` | `json` | 1 MiB |

Arquivos de cada saída `json/`: [research R14](../research.md#r14-divisão-em-etapas).

`code/` contém `arm9.bin` (descomprimido) e `overlay9/NNNN.bin` (todos os overlays,
descomprimidos quando estavam comprimidos).

## Regras para todas as etapas de dados

1. Leem só as entradas declaradas e o layout recebido em `createDataStages(layout)`.
2. Validam cada arquivo com `parseGameDataFile` antes de gravar. Uma falha lança `Error` com
   `file`, `path` e `problem` na mensagem, e o pipeline a registra como `stage-failed`.
3. Gravam com `serializeGameDataFile` (determinístico).
4. Uma estrutura truncada, ou que falhe nas checagens de R10, lança um erro que nomeia a tabela e
   o offset. Valores fora de faixa **não** lançam: são gravados como estão, e o relatório os
   aponta.
5. Mudança no formato de um arquivo = subir a `version` da etapa **e** `GAME_DATA_FORMAT_VERSION`
   se o schema mudar.

## Efeito no app

Quem já tem os assets da 003 recebe, na próxima abertura, uma extração em modo `update` que roda
só as sete etapas novas (feature 003, US3), sem pedir a ROM.
