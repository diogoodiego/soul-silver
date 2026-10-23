# Contrato: API pública de `@soulsilver/extractor`

**Definida em**: `packages/extractor/src/index.ts`
**Consumidores**: processo principal do app (`checkAssets`), extractor-host (validação, cópia,
run), CLI, e as etapas dos specs 4 a 9.

A biblioteca roda em Node puro: MUST NOT importar `electron` (FR-028). Isso é verificado por
regra de lint (`no-restricted-imports`) no pacote.

```ts
// Validação e cópia da ROM
export function validateRom(path: string, options?: { references?: readonly string[] /* SHA-1 hex */; signal?: AbortSignal }): Promise<RomValidationResult>;
export function copyRom(source: string, dest: string, expectedSha1: string, signal?: AbortSignal): Promise<void>;
export function sha1File(path: string, signal?: AbortSignal): Promise<string>;
export const REFERENCE_ROM_SHA1: readonly string[];

// Formatos (para testes e para as etapas futuras)
export function parseNdsHeader(rom: Uint8Array): NdsHeader;            // lança NdsFormatError
export function readNdsFileSystem(rom: Uint8Array): NdsFileSystem;     // árvore + overlays
export function parseNarc(bytes: Uint8Array): Narc;                    // { members, names?: Record<number, string> }; lança NarcFormatError
export function isNarc(bytes: Uint8Array): boolean;

// Pipeline
export type { Stage, StageContext, StageInput, Manifest, PlannedStage, RunReason, Logger };
export function createRegistry(stages: readonly Stage[]): Registry;   // lança StageRegistryError
export const defaultStages: readonly Stage[];
export function checkAssets(args: { workspaceDir: string; romPath: string; registry: Registry; log: Logger }): Promise<AssetsCheck>;
export function runPipeline(args: RunArgs): Promise<RunResult>;
export function verifyOutputs(args: { workspaceDir: string; registry: Registry; log?: Logger }): Promise<{ ok: boolean; mismatches: OutputMismatch[] }>;

// Log
export function createFileLogger(path: string, options?: { maxBytes?: number }): Logger;
export function createConsoleLogger(): Logger;
```

## `runPipeline`

```ts
interface RunArgs {
  workspaceDir: string;
  romPath: string;                       // ROM já validada (cópia guardada ou --rom)
  registry: Registry;
  only?: readonly string[];
  force?: readonly string[];
  signal?: AbortSignal;
  log: Logger;
  onProgress?: (p: { stageId: string; stageTitle: string; percent: number }) => void;
  onPlan?: (plan: readonly PlannedStage[]) => void;
  appVersion?: string;                   // vai na primeira linha do log
  references?: readonly string[];        // padrão: REFERENCE_ROM_SHA1
  lock?: { pid?: number; isAlive?: (pid: number) => boolean };
  statfs?: (path: string) => Promise<{ bavail: number | bigint; bsize: number | bigint }>;
  /** Só para testes de interrupção (research R18). */
  onCheckpoint?: (name: CheckpointName) => void;
}

type RunResult =
  | { status: "completed"; ran: string[]; skipped: string[] }
  | { status: "cancelled" }
  | { status: "failed"; error: PipelineError };

type PipelineError =
  | { code: "disk-full"; requiredBytes: number; availableBytes: number }
  | { code: "write-permission"; path: string }
  | { code: "busy" }
  | { code: "rom-mismatch" }                 // SHA-1 da ROM não está nas referências
  | { code: "stage-failed"; stageId: string; message: string };
```

Garantias:

1. Adquire o lock da área de trabalho e o libera em qualquer saída (R14).
2. Limpa `staging/` e pastas órfãs antes de planejar (R7).
3. Confere o SHA-1 da ROM antes de qualquer gravação.
4. Confere o espaço livre antes da primeira etapa (R12).
5. Cancelamento (`signal`) → `cancelled`; nenhuma saída parcial entra no manifesto.
6. Uma exceção numa etapa → `stage-failed`, registrada no log com stack; as etapas já gravadas
   continuam válidas.
7. Nunca rejeita a promise por erro esperado; erros inesperados de I/O viram `PipelineError`.
8. `percent` vai de 0 a 100, nunca decresce, e termina em 100 em `completed`.

## Como uma etapa futura se pluga (specs 4 a 9)

1. Criar `packages/extractor/src/stages/<id>.ts` exportando um `Stage`.
2. Declarar como entradas as saídas que consome, por exemplo
   `{ kind: "stage", stage: "rom-unpack", output: "narc" }`.
3. Adicionar a etapa a `defaultStages`.
4. Mudou o formato da saída? Incrementar `version`. O app reextrai só essa etapa e as
   dependentes (FR-011, SC-006).

O pipeline, o manifesto, o app e a CLI não mudam.
