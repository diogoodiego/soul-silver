# Contrato: módulo `@soulsilver/shared/game-data`

**Definido em**: `packages/shared/src/game-data/index.ts` (subpath `./game-data` no
`package.json` de `shared`)
**Consumidores**: etapas de dados do extractor (validação na geração), relatório de sanidade e,
nos specs seguintes, o servidor de jogo e as ferramentas que carregam os dados.

O módulo não usa APIs do Node nem do Electron: ele recebe valores já lidos. Quem lê o arquivo do
disco é o chamador. O servidor de jogo, por exemplo, continua sem importar módulos do Node
(regra de lint da 001).

```ts
export const GAME_DATA_FORMAT_VERSION = 1;

/** Nome do arquivo de cada tipo, dentro da saída `json/` da etapa que o gera. */
export const GAME_DATA_FILES: Record<GameDataKind, { stage: string; file: string }>;
// ex.: moves → { stage: "data-moves", file: "moves.json" }

/** Schemas zod, um por tipo (data-model.md). */
export const gameDataSchemas: Record<GameDataKind, z.ZodType>;

export type GameDataKind = /* data-model.md, "Envelope comum" */;
export type SpeciesRecord = z.infer<typeof speciesRecord>;   // e assim para cada registro
export type GameDataFileOf<K extends GameDataKind> = /* envelope tipado */;

export type GameDataParseResult<K extends GameDataKind> =
  | { ok: true; data: GameDataFileOf<K> }
  | { ok: false; error: { file: string; path: string; problem: string } };

/**
 * Valida um valor já desserializado. `path` usa pontos e índices
 * (ex.: "records.5.baseStats.hp"); vazio quando o problema é no próprio valor.
 */
export function parseGameDataFile<K extends GameDataKind>(kind: K, value: unknown, file: string): GameDataParseResult<K>;

/** Igual, partindo do texto JSON; JSON inválido vira { path: "", problem: "JSON inválido: …" }. */
export function parseGameDataJson<K extends GameDataKind>(kind: K, text: string, file: string): GameDataParseResult<K>;

/** Serialização determinística (R13): JSON com 2 espaços + "\n", na ordem de campos do schema. */
export function serializeGameDataFile<K extends GameDataKind>(kind: K, data: GameDataFileOf<K>): string;
```

Garantias:

1. `formatVersion` diferente de `GAME_DATA_FORMAT_VERSION` falha com path `formatVersion`.
2. `kind` diferente do pedido falha com path `kind`.
3. Os objetos são estritos: um campo desconhecido falha com o path do campo.
4. `records` precisa estar ordenado por `id`, sem repetição. A violação falha com o path do
   primeiro registro fora de ordem.
5. `problem` é uma frase curta em português (por exemplo, "esperado inteiro entre 0 e 255,
   recebido 300").
6. `serializeGameDataFile(kind, x)` seguido de `parseGameDataJson` devolve o mesmo valor, e
   serializar duas vezes o mesmo valor dá a mesma string.
