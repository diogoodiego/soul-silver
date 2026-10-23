# Data Model: Textos e i18n

**Feature**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

Os schemas ficam em `packages/shared/src/text/` (zod), no mesmo estilo da feature 004. Os tipos
TypeScript são `z.infer` dos schemas.

## Identificador de texto

```ts
/** "0237:25" (banco em 4 dígitos, índice em decimal) ou "species-names:25" (banco com nome). */
type TextId = string;

interface ParsedTextId { bank: number; index: number }
function parseTextId(id: string): ParsedTextId;          // aceita as duas formas; erro claro se inválido
function formatTextId(bank: number, index: number): string;   // sempre a forma numérica
```

`TEXT_BANK_NAMES` (banco → nome) e o inverso são fixos, definidos por [research R7](./research.md#r7-identificadores-e-bancos-com-nome).
`TEXT_REF_BANKS` liga os seis catálogos da 004 aos bancos:

| `catalog` (feature 004) | Banco |
|-------------------------|-------|
| `species-names` | 237 |
| `move-names` | 750 |
| `item-names` | 222 |
| `ability-names` | 720 |
| `type-names` | 735 |
| `nature-names` | 34 |

## Marcação

```ts
type MarkupToken =
  | { kind: "text"; value: string }                                   // texto comum (já sem escapes)
  | { kind: "newline" }                                               // {n}
  | { kind: "page" }                                                  // {page}
  | { kind: "scroll" }                                                // {scroll}
  | { kind: "pad" }                                                   // {pad}
  | { kind: "color"; color: number }                                  // {color:N}
  | { kind: "variable"; name: VariableName; slot: number; flag: number }   // {nome:slot[,flag]}
  | { kind: "command"; id: number; params: number[] }                // {cmd:XXXX:p1,p2}
  | { kind: "raw"; code: number };                                    // {raw:XXXX}

function parseMarkup(text: string): MarkupToken[];        // lança MarkupError { position, problem }
function serializeMarkup(tokens: readonly MarkupToken[]): string;
```

Propriedade exigida: `serializeMarkup(parseMarkup(s)) === s` para todo `s` em forma canônica, e
`parseMarkup(serializeMarkup(t))` igual a `t` para todo `t` produzido pelo extrator. Gramática em
[contracts/markup.md](./contracts/markup.md).

### Variáveis

```ts
type VariableName =
  | "pokemon-species" | "pokemon-name" | "trainer-name" | "ability" | "move" | "item"
  | "box" | "stat" | "type" | "status" | "pocket" | "phrase"
  | `number${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`
  | `var${string}`;                       // var + 4 dígitos hexadecimais do comando

interface VariableKind { name: VariableName; command: number; value: "text" | "number" }
```

Tabela fixa (comando ↔ nome ↔ tipo de valor) em [research R5](./research.md#r5-comandos-de-controle-e-variáveis).
`number1`–`number10` têm valor `"number"`; todas as outras, `"text"`.

- `slot`: inteiro 0–255, que buffer do script preenche a variável.
- `flag`: inteiro 0–255, quase sempre 0.
- Uma variável aparece na marcação como `{nome:slot}` (flag 0) ou `{nome:slot,flag}`.
- A chave de preenchimento de uma variável é `nome:slot` (por exemplo, `"trainer-name:0"`). O flag
  não entra na chave.

## text-bank (um arquivo por banco e idioma)

```ts
interface TextBankFile {
  kind: "text-bank";
  formatVersion: 1;
  language: string;               // "en", "pt-BR"
  bank: number;                   // 0–9999
  name: string | null;            // nome legível, se o banco tem
  records: TextRecord[];          // ids crescentes, sem repetição
}

interface TextRecord { id: number; text: string }   // text em marcação
```

Regras de validação:

- `records` em ordem estritamente crescente de `id` (mesma regra da 004).
- `text` precisa passar por `parseMarkup`; o erro de marcação vira o erro de schema, com o caminho
  `records.N.text` e a posição dentro do texto.
- `language` precisa casar com `^[a-z]{2,3}(-[A-Za-z0-9]+)*$`.
- Nenhum campo extra.
- O catálogo de inglês gerado tem os registros de **todos** os índices do banco (inclusive textos
  vazios, `text: ""`). Um catálogo de outro idioma tem só os registros traduzidos.

## text-index

```ts
interface TextIndexFile {
  kind: "text-index";
  formatVersion: 1;
  language: "en";
  records: Array<{ id: number; name: string | null; count: number }>;   // id = banco
}
```

Um registro por banco do catálogo de inglês; serve para busca rápida de nomes e contagens.

## text-report

```ts
interface TextReportFile {
  kind: "text-report";
  formatVersion: 1;
  banks: number;                  // bancos decodificados
  texts: number;                  // textos decodificados
  namedBanks: number;
  compressedTexts: number;
  unknownCharacters: Array<{ code: number; count: number; banks: number[] }>;   // {raw:XXXX}
  unknownCommands: Array<{ command: number; count: number; params: number }>;  // {cmd:XXXX}
  roundTrip: { banks: number; identical: number };                              // devem ser iguais
}
```

`banks`, `texts` e `roundTrip` fecham com os números do protótipo: 829 bancos, 49.984 textos,
829 idênticos. Os alertas da CLI (`--report`) e a falha por referência sem destino (SC-004) são
calculados na hora a partir deste arquivo e dos dados da 004, e não ficam gravados.

## Catálogo carregado (shared, sem disco)

```ts
interface TextCatalog {
  languages(): string[];
  /** Texto do idioma pedido, ou do inglês quando falta. */
  get(id: TextId, language: string): { text: string; language: string; fallback: boolean };
  has(id: TextId, language?: string): boolean;
  /** Todos os ids do idioma, em ordem de banco e índice. */
  ids(language: string): string[];
}

function createTextCatalog(sources: Record<string, readonly TextBankFile[]>, options?: { fallback?: string }): TextCatalog;
function validateTranslation(base: readonly TextBankFile[], translation: readonly TextBankFile[]): TranslationProblem[];

interface TranslationProblem { id: TextId; variable: string; problem: string }
```

- `createTextCatalog` exige o idioma de fallback (padrão `en`) completo para os ids pedidos; um id
  inexistente em todos os idiomas lança `UnknownTextError` com o identificador.
- `validateTranslation` compara, por texto, o multiconjunto de variáveis `nome:slot[,flag]`.
  Falta, sobra ou flag diferente gera um problema; quem chama decide falhar. `createTextCatalog`
  chama `validateTranslation` com o inglês e lança se houver problema.

## Formatação

```ts
type TextValues = Readonly<Record<string, string | number>>;      // chaves "nome:slot"
function formatText(text: string, values: TextValues, id?: TextId): string;
function textVariables(text: string): string[];                    // chaves "nome:slot", sem repetição, em ordem
function screenText(text: string): string;                         // R13, usado pela busca
```

`formatText` lança `TextFormatError { id, variable, problem }` por variável ausente ou sobrando.

## Banco decodificado (extrator, em memória)

```ts
interface Bank {
  seed: number;                               // 0–65535
  entries: BankEntry[];
}

interface BankEntry {
  compressed: boolean;                        // 0xF100
  words: number[];                            // palavras de texto, sem o terminador 0xFFFF
}

function decodeBank(bytes: Uint8Array): Bank;                 // lança BankFormatError { bank?, entry?, problem }
function encodeBank(bank: Bank): Uint8Array;
function wordsToMarkup(words: readonly number[], charmap: Charmap): { text: string; unknown: UnknownUse[] };
function markupToWords(text: string, charmap: Charmap): number[];
```

`words` são os valores de 16 bits do texto: caracteres, `0xE000`, `0x25BC`, `0x25BD` e sequências
`0xFFFE cmd n params…`. Para texto comprimido, `words` já são os caracteres descomprimidos.

`encodeBank(decodeBank(b))` é idêntico a `b` (SC-003). `markupToWords(wordsToMarkup(w))` é igual a `w`.

## Relação com a feature 004

A feature 004 grava referências `{ catalog, index }` em `species`, `moves`, `items`, `abilities`,
`types` e `natures`. `TEXT_REF_BANKS[catalog]` dá o banco, e o texto é `formatTextId(banco, index)`.
Nada na 004 muda.
