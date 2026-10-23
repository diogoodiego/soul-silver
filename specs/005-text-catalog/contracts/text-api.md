# Contrato: módulo `@soulsilver/shared/text`

**Definido em**: `packages/shared/src/text/index.ts` (subpath `./text` no `package.json` de `shared`)
**Consumidores**: a etapa do extrator (validação na geração), a busca, o relatório e, nos specs
seguintes, o servidor de jogo, os scripts e a UI.

O módulo não usa APIs do Node nem do Electron: recebe valores já lidos. O servidor de jogo e o
renderer podem importá-lo (princípios IV e IX).

```ts
// Identificadores
export function parseTextId(id: string): { bank: number; index: number };   // "0237:25" ou "species-names:25"
export function formatTextId(bank: number, index: number): string;          // "0237:25"
export const TEXT_BANK_NAMES: Readonly<Record<number, string>>;             // banco -> nome
export const TEXT_REF_BANKS: Readonly<Record<TextRefCatalog, number>>;      // catálogos da feature 004

// Marcação (contracts/markup.md)
export function parseMarkup(text: string): MarkupToken[];                   // lança MarkupError
export function serializeMarkup(tokens: readonly MarkupToken[]): string;
export const TEXT_VARIABLES: readonly VariableKind[];                       // tabela comando <-> nome <-> valor
export function variableByName(name: string): VariableKind | undefined;
export function variableByCommand(command: number): VariableKind | undefined;

// Formatação
export function formatText(text: string, values: TextValues, id?: string): string;   // lança TextFormatError
export function textVariables(text: string): string[];                      // ["trainer-name:0", ...]
export function screenText(text: string): string;                           // como aparece na tela

// Schemas e arquivos
export const GAME_TEXT_FORMAT_VERSION = 1;
export const textBankFile: z.ZodType<TextBankFile>;
export const textIndexFile: z.ZodType<TextIndexFile>;
export const textReportFile: z.ZodType<TextReportFile>;
export function parseTextFile<K extends TextFileKind>(kind: K, value: unknown, file: string): GameDataParseResult<TextFileOf<K>>;
export function parseTextJson<K extends TextFileKind>(kind: K, text: string, file: string): GameDataParseResult<TextFileOf<K>>;
export function serializeTextFile<K extends TextFileKind>(kind: K, data: TextFileOf<K>): string;

// Catálogo e i18n
export function createTextCatalog(sources: Record<string, readonly TextBankFile[]>, options?: { fallback?: string }): TextCatalog;
export function validateTranslation(base: readonly TextBankFile[], translation: readonly TextBankFile[]): TranslationProblem[];
export class UnknownTextError extends Error { id: string }
export class TextFormatError extends Error { id?: string; variable: string; problem: string }
export class MarkupError extends Error { position: number; problem: string }
```

`TextFileKind` é `"text-bank" | "text-index" | "text-report"`. `parseTextFile`, `parseTextJson` e
`serializeTextFile` seguem as mesmas garantias de `parseGameDataFile` (contrato da feature 004):
erro com `{ file, path, problem }`, objetos estritos, `records` em ordem de `id`, e
serialização determinística (`JSON.stringify(valor, null, 2) + "\n"`, campos na ordem do schema).

## Garantias

1. `formatText` falha por variável ausente **e** por valor sobrando; o erro traz o identificador (se
   `id` foi dado), a chave `nome:slot` e o problema. Variável repetida recebe o mesmo valor em todas
   as ocorrências.
2. `formatText` devolve marcação: `{n}`, `{page}`, `{scroll}`, `{pad}`, `{color}`, `{cmd}` e `{raw}`
   passam sem alteração, e `\{`, `\}`, `\\` continuam escapados no resultado. Os valores
   preenchidos entram escapados, para que um nome com `{` não seja lido como comando.
3. `createTextCatalog` valida cada idioma que não é o de fallback com `validateTranslation` e lança
   `Error` listando o primeiro problema (identificador, variável, problema).
4. `catalog.get` nunca devolve texto vazio por engano: id inexistente em todos os idiomas lança
   `UnknownTextError`. Um texto realmente vazio no jogo (`""`) é devolvido como `""`.
5. `screenText` é determinístico e não lança para marcação válida.
6. O schema `text-bank` rejeita um `text` com marcação inválida, com o caminho `records.N.text` e a
   posição do problema no `problem`.
