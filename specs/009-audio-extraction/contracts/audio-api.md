# Contrato: API de áudio (`shared` e `extractor`)

**Feature**: [spec.md](../spec.md) | **Modelo**: [data-model.md](../data-model.md)

Tipos, schemas e o decodificador de WAV ficam em `shared/src/audio/` (sem APIs do Node); a etapa, o
emulador e a gravação ficam em `extractor/src/audio/`.

## `shared` (`@soulsilver/shared/audio`)

Mesmo padrão das features 004 a 008: schemas zod por `kind`, um codec que valida e serializa.

```ts
export const AUDIO_FORMAT_VERSION: number;     // = GAME_DATA_FORMAT_VERSION
export const AUDIO_SAMPLE_RATE = 32000;
export const TRACK_KINDS = ['music', 'jingle', 'effect'] as const;
export type TrackKind = (typeof TRACK_KINDS)[number];

export type AudioFileKind = 'audio-index' | 'audio-report';

// Resultado { ok: true, data } | { ok: false, error: { file, path, problem } }
export function parseAudioFile<K extends AudioFileKind>(kind: K, value: unknown, file: string): GameDataParseResult<…>;
export function parseAudioJson<K extends AudioFileKind>(kind: K, text: string, file: string): GameDataParseResult<…>;
export function serializeAudioFile<K extends AudioFileKind>(kind: K, data: …): string;   // ordem estável

// Tipos: AudioIndexFile, Track, Cry, AudioReportFile, LoopPoints.

export function trackFile(kind: TrackKind, id: number): string;      // "<kind>/<id 4 dígitos>.wav"
export function cryFile(species: number, form: number): string;      // "cry/<espécie>[-<forma>].wav"
export function imaStep(sample: number, index: number, nibble: number): [number, number];  // passo IMA, usado também pelo codificador

/** Decodifica um WAV IMA ADPCM do projeto em amostras de ponto flutuante, um array por canal. */
export function decodeWav(bytes: Uint8Array): { sampleRate: number; channels: Float32Array[] };
```

Os erros usam o `GameDataError` do codec de `game-data` (arquivo, caminho do campo e problema).
Um índice é inválido quando quebra o schema, quando ids de faixas se repetem ou não crescem, quando
um loop sai de `0 ≤ start < end ≤ samples`, quando `file` não bate com o tipo e o id, ou quando um
cry repete espécie e forma. `decodeWav` falha com mensagem clara em um WAV que não é o formato do
projeto (etiqueta, taxa, bloco ou tamanho de `data` inconsistentes).

## `extractor` (`packages/extractor/src/audio/`)

```ts
export const audioStage: Stage;      // id 'audio', entradas filesystem, maps/maps e events/events; saída 'audio'
export function runAudio(ctx: StageContext, workers: number): Promise<void>;   // stage.ts; workers = 1 roda nesta thread

export function readSdat(bytes: Uint8Array): Sdat;                                       // sdat.ts
export function readSwar(bytes: Uint8Array, what: string): Wave[];                       // swar.ts
export function readSbnk(bytes: Uint8Array, what: string): (Instrument | null)[];        // sbnk.ts
export class SoundSource { constructor(sdat: Sdat); instruments(bank: number): Instruments }  // render.ts: bancos e ondas lidos uma vez
export function renderSequence(source: SoundSource, seq: number, bank?: number): RenderedTrack;   // render.ts: PCM e loop
export function renderCry(source: SoundSource, species: number, form: number): RenderedTrack;    // cries.ts
export function encodeWav(channels: Float32Array[]): Uint8Array;                          // wav.ts (ADPCM)
export function renderAll(sdatPath, jobs, workers, onResult, signal?): Promise<void>;     // worker.ts (worker_threads)
export function buildAudioReportFile(input): AudioReportFile;                            // report.ts
export function buildAudioReport(dir): Promise<{ ok: boolean; lines: string[] }>;
```

A etapa entra em `defaultStages`, depois de `eventsStage`. Depende da saída `filesystem` da 003 (o
arquivo de som), dos cabeçalhos de mapa da 006 (`maps/map-headers.json`) e dos scripts da 008
(`events`, para os ids citados). Um arquivo de som que não é um `SDAT` válido falha a etapa com a
posição do erro; uma faixa que não renderiza vai ao relatório até o limite de 2%, e nenhum dos 493
cries pode se perder.

## CLI

- `npm run extract -- --rom <arquivo> --stages audio` roda só a etapa (e o que ela exige);
  `npm run extract` roda junto das demais.
- `npm run extract -- --report` mostra a seção "Áudio" ao final do relatório de sanidade:
  contagens por tipo, tamanho total, faixas não convertidas, ids sem faixa, cries pela forma base
  e o veredito, com o mesmo código de saída das outras etapas.
- `npm run audio:view -- [id] [--out <pasta>]` serve a página de reprodução; somente leitura, em
  `127.0.0.1`, sem IPC.

## Garantias

- Mesma ROM → mesmos bytes nos WAV e nos JSON (SC-005), com qualquer número de trabalhadores.
- Uma faixa com loop tem o loop no índice, em amostras; o WAV só tem a introdução e uma volta.
- Os 493 cries estão presentes ou o relatório diz quais faltam e a etapa falha.
- Nada do áudio entra no repositório nem no app.
