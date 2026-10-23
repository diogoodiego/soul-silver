# Contrato: etapa `text-catalog` e CLI

**Base**: [003 — pipeline](../../003-rom-extraction-pipeline/contracts/extractor-library-api.md),
[004 — etapas](../../004-game-data-extraction/contracts/stages.md) e
[004 — relatório](../../004-game-data-extraction/contracts/cli-report.md)
**Definidos em**: `packages/extractor/src/text/` e `packages/extractor/src/cli.ts`

## Etapa

`defaultStages` ganha uma etapa depois das de dados:

| Id | Título (aparece no progresso) | v | Peso | Entradas | Saídas | `estimateBytes` |
|----|-------------------------------|---|------|----------|--------|-----------------|
| `text-catalog` | Convertendo os textos | 1 | 3 | `rom-unpack/narc` | `catalog` | 40 MiB |

Arquivos da saída `catalog/` (formatos em [data-model.md](../data-model.md)):

```text
catalog/index.json        kind "text-index"
catalog/report.json       kind "text-report"
catalog/en/NNNN.json      kind "text-bank", um por banco (NNNN com 4 dígitos)
```

Regras:

1. Lê só `narc/<messages>` (`a/0/2/7`) e o layout; não depende das etapas de dados da 004.
2. Para cada banco: decodifica, converte para marcação, valida com o schema, e **confere a ida e
   volta** (`bytes → banco → marcação → banco → bytes` idêntico). Diferença falha a etapa com o
   banco e a primeira entrada diferente na mensagem.
3. Caractere ou comando desconhecido **não** falha: vira `{raw}` ou `{cmd}` e entra no
   `report.json`. Banco corrompido ou truncado falha com o número do banco e o problema.
4. Grava com `serializeTextFile` (determinístico) e valida antes de gravar.
5. Mudar a etapa = subir `version`; mudar um schema = subir `GAME_TEXT_FORMAT_VERSION`.
6. Uma atualização que muda só esta etapa reextrai só ela (feature 003, US3).

## CLI

Duas opções novas, além das da 003 e da 004:

| Opção | Padrão | Descrição |
|-------|--------|-----------|
| `--find <trecho>` | — | Procura o trecho nos textos do catálogo em `--out`. Não exige `--rom`. |
| `--lang <idioma>` | `en` | Idioma da busca; textos que o idioma não tem vêm do inglês. |
| `--limit <n>` | `20` | Máximo de resultados (inteiro de 1 a 1000). |

`--find` não combina com `--rom`, `--stages`, `--force`, `--verify` nem `--report` (erro de uso,
código 2). `--lang` e `--limit` só valem com `--find`.

### `--find`

Normalização e ordem de [research R13](../research.md#r13-busca). Saída:

```text
3 resultados para "photo taken"

0000:10   {trainer-name:0}’s Photo Taken: {var0104:1} Photo of: {pokemon-name:2} …
0000:11   …
0001:5    …

(mostrando 3; use --limit para ver mais)
```

- Cada linha: identificador, nome do banco entre parênteses se existir, e o texto **na marcação**
  (não na forma da tela), cortado em 160 caracteres com `…`.
- Sem resultado: `nenhum texto contém "trecho"`, código de saída 0 (a busca em si funcionou).
- Sem catálogo no `--out`: erro (código 1) dizendo para rodar a extração.

### `--report` (ampliado)

A seção nova aparece depois dos dados do jogo:

```text
Textos
  ok       bancos                 829 / 829
  ok       textos                 49984 / 49984
  ok       ida e volta            829 / 829
  ok       referências de nome    1651 / 1651
  Alertas de texto (n)
    caractere 0x01E0  x39  bancos 0024
    comando   0x0104  x203
Resultado: …
```

- Falha (código 1): arquivo do catálogo ausente ou inválido, contagem diferente da esperada
  (829 bancos e 49.984 textos, constantes `EXPECTED_TEXT_COUNTS`), ida e volta com diferença, ou
  referência de nome da 004 sem texto.
- Alerta (não falha): caractere ou comando desconhecido. Lista os 10 mais frequentes.
- `--report` sem catálogo extraído mostra a seção como "ausente" e falha.

Referências de nome: cada registro de `species`, `moves`, `items`, `abilities`, `types` e `natures`
tem `name = { catalog, index }`; resolve quando `TEXT_REF_BANKS[catalog]` existe no catálogo
com um registro de `id = index`. O relatório não roda na CI (FR-022 da 004).

## Funções da biblioteca

```ts
export const textCatalogStage: Stage;
export function decodeBank(bytes: Uint8Array): Bank;
export function encodeBank(bank: Bank): Uint8Array;
export function loadTextCatalog(catalogDir: string): Promise<TextBankFile[]>;           // um idioma
export function findTexts(banks: readonly TextBankFile[], query: string, options?: { limit?: number }): FoundText[];
export const EXPECTED_TEXT_COUNTS: { banks: 829; texts: 49984 };

interface FoundText { id: string; bank: number; name: string | null; text: string }
```
