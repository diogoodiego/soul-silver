# Contrato: API de eventos, scripts, encontros e treinadores (`shared` e `extractor`)

**Feature**: [spec.md](../spec.md) | **Modelo**: [data-model.md](../data-model.md)

Tipos e schemas ficam em `shared/src/events/` (sem APIs do Node); a etapa e a leitura de arquivos
ficam em `extractor/src/events/`.

## `shared` (`@soulsilver/shared/events`)

Mesmo padrão das features 004 a 007: schemas zod por `kind`, um codec que valida e serializa.

```ts
export const EVENTS_FORMAT_VERSION: number;            // = GAME_DATA_FORMAT_VERSION

export type EventsFileKind =
  | 'map-events' | 'script-file' | 'encounters' | 'headbutt' | 'trainers'
  | 'script-commands' | 'events-report';

// Resultado { ok: true, data } | { ok: false, error: { file, path, problem } } (FR-015)
export function parseEventsFile<K extends EventsFileKind>(kind: K, value: unknown, file: string): GameDataParseResult<…>;
export function parseEventsJson<K extends EventsFileKind>(kind: K, text: string, file: string): GameDataParseResult<…>;
export function serializeEventsFile<K extends EventsFileKind>(kind: K, data: …): string;   // ordem estável, termina em \n

// Tipos: MapEventsFile, ScriptFile, ScriptCommand, ScriptRef, EncountersFile, EncounterRecord,
// EncounterSlot, HeadbuttFile, HeadbuttRecord, TrainersFile, TrainerRecord, TeamMember,
// ScriptCommandsFile, CommandSpec, EventsReportFile, CommandCoverage, SCRIPT_ARG_TYPES.
```

Os erros usam o formato `GameDataError` do codec de `game-data` (arquivo, caminho do campo e
problema), como as features 006 e 007; não há classe de erro própria. Um arquivo é inválido quando
quebra o schema, quando um `label` ou `movement` de um script não existe, quando uma entrada não
tem rótulo, quando `minLevel` passa de `maxLevel`, quando o nível de um Pokémon do time sai de
"1 a 100", quando os ids de registros não crescem ou quando um id de comando se repete.

## `extractor` (`packages/extractor/src/events/`)

```ts
export const eventsStage: Stage;   // id 'events', entradas narc, code, maps/maps e text-catalog/catalog; saída 'events'

export function readZone(bytes, name): RawZone;                       // zone.ts
export function readLevelScripts(bytes, name): RawLevelScripts;       // zone.ts
export function decodeScriptFile(bytes, table, file, messageBank): ScriptFile;   // script.ts
export function readScriptTable(path?): Promise<ScriptTable>;         // command-table.ts
export function readEncounter(bytes, id): EncounterRecord;            // encounter.ts
export function readHeadbutt(bytes, mapId): HeadbuttRecord | null;    // encounter.ts
export function readTrainer(data, team, id): TrainerRecord | null;    // trainer.ts
export function resolveScript(id, map): ScriptTarget | null;          // refs.ts
export function trainerOfScript(id): number | null;                   // refs.ts
export function buildEventsReportFile(input): EventsReportFile;       // report.ts
export function buildEventsReport(dir): Promise<{ ok: boolean; lines: string[] }>;
```

A etapa entra em `defaultStages`, depois de `spritesStage`. Depende das saídas `narc` e `code` da
003, dos cabeçalhos da 006 (`maps/map-headers.json`) e do índice da 005 (`text-catalog`
`index.json`). Um arquivo de zona, level script, encontro, headbutt ou treinador inválido falha a
etapa com o membro e o offset; scripts perdidos seguem para o relatório até o limite de 2%.

## CLI

- `npm run extract -- --rom <arquivo> --stages events` roda só a etapa (e o que ela exige);
  `npm run extract` roda junto das demais.
- `npm run extract -- --report` mostra a seção "Eventos, scripts, encontros e treinadores" ao final
  do relatório de sanidade: contagens, comandos mais usados, desconhecidos, scripts perdidos,
  referências sem destino e o veredito, com o mesmo código de saída das outras etapas.

## Garantias

- Mesma ROM → mesmos bytes nos JSON (SC-004).
- Comando fora da tabela nunca é descartado: sai como `raw`, na posição original, e aparece em
  `unknownCommands`.
- Cada arquivo de script existe uma vez; cada evento guarda `{ id, file, entry }`.
- Tipo de encontro sem Pokémon no mapa não aparece no arquivo.
