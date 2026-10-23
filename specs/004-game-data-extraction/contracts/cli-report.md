# Contrato: relatório de sanidade na CLI

**Base**: [003 — CLI do extrator](../../003-rom-extraction-pipeline/contracts/cli.md)
**Definido em**: `packages/extractor/src/cli.ts` (opção nova) e
`packages/extractor/src/data/report.ts` (`buildSanityReport`, `formatSanityReport`)

## Opção nova

| Opção | Descrição |
|-------|-----------|
| `--report` | Lê os arquivos de dados em `--out` (padrão `assets`), valida, confere contagens e faixas, e imprime o relatório. Não exige `--rom` e não extrai nada. |

`--report` com `--verify`, `--stages` ou `--force` → erro de uso (código 2).

## Saída (stdout)

```text
Relatório de sanidade — C:\dev\soul-silver\assets

Arquivos
  ok       species.json
  ok       moves.json
  ...
Contagens
  ok       espécies          493 / 493
  FALHA    golpes            466 / 467
  ...
Alertas (2)
  moves #200    accuracy    150    esperado 1–100 ou null
  species #12   abilities.1 999    habilidade inexistente
Ignorados
  moves         468–470 (sem nome no jogo)
  growth-rates  membros 6–7 (cópias do grupo 0)
  items         23 ids sem dados

Resultado: FALHA (1 contagem)
```

## Códigos de saída

| Código | Situação |
|--------|----------|
| 0 | Todos os arquivos válidos e todas as contagens fecham (alertas não contam) |
| 1 | Algum arquivo ausente ou inválido, ou alguma contagem diferente |
| 2 | Erro de uso |

O relatório não roda na CI (FR-022): nenhum workflow chama `--report`. Os testes de `buildSanityReport` usam dados sintéticos.
