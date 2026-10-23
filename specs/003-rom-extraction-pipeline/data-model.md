# Data Model: Validação da ROM, desempacotamento e primeira execução

**Feature**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

Tipos compartilhados com o renderer ou com o extractor-host ficam em `packages/shared`
(princípio VI). Os tipos internos da biblioteca ficam em `packages/extractor`.

---

## Validação da ROM (`shared/src/rom-validation.ts`)

```ts
type RomRegion = "usa" | "japan" | "korea" | "europe" | "france" | "germany" | "italy" | "spain" | "unknown";

type RomRejection =
  | { reason: "unreadable" }
  | { reason: "archive"; format: "zip" | "7z" | "rar" }
  | { reason: "not-ds-rom" }
  | { reason: "other-game"; title: string; gameCode: string }
  | { reason: "heartgold"; region: RomRegion }
  | { reason: "other-region"; region: RomRegion; gameCode: string }
  | { reason: "modified" };

type RomValidationResult =
  | { ok: true; sha1: string; size: number }
  | { ok: false; rejection: RomRejection };
```

- `title` é sanitizado: só ASCII imprimível, no máximo 12 caracteres.
- `romRejectionMessage(rejection): { title: string; detail: string }` devolve o texto em PT-BR
  usado pelo app e pela CLI (FR-003). Toda mensagem termina dizendo o que fornecer: "Escolha o
  arquivo de Pokémon SoulSilver (EUA), com extensão .nds."
- Ordem das checagens e mapeamento de região: [research R1 e R3](./research.md#r3-ordem-das-checagens-e-limites-de-tamanho).

## Etapa (`extractor/src/pipeline/stage.ts`)

```ts
type StageInput = { kind: "rom" } | { kind: "stage"; stage: string; output: string };

interface Stage {
  id: string;              // kebab-case, único; ex.: "rom-unpack"
  title: string;           // legível, PT-BR; ex.: "Desempacotando a ROM"
  version: number;         // inteiro ≥ 1; incrementado a cada mudança de saída
  weight: number;          // custo relativo para a porcentagem (> 0)
  inputs: readonly StageInput[];
  outputs: readonly string[];          // nomes das saídas; cada uma vira stages/<id>/<nome>/
  estimateBytes(romSize: number): number;
  run(ctx: StageContext): Promise<void>;
}

interface StageContext {
  rom: Uint8Array;                                  // ROM inteira, só leitura
  inputDir(stage: string, output: string): string;  // pasta de uma saída consumida
  outputDir(output: string): string;                // pasta de staging da saída
  signal: AbortSignal;
  progress(fraction: number): void;                 // 0..1
  log: Logger;
}
```

Regras de registro (`createRegistry(stages)`, FR-010), cada uma com erro `StageRegistryError`
nomeando a etapa:

- `id` duplicado;
- `version` não inteira ou < 1, `weight` ≤ 0, `outputs` vazio ou com nome repetido;
- entrada `stage` que aponta para etapa ou saída inexistente;
- ciclo de dependências.

A ordem de execução é topológica, com desempate pela ordem de registro (determinística).

`defaultStages` em `extractor/src/stages/index.ts` é a lista única usada pelo app e pela CLI.
Nesta feature: `[romUnpackStage]`.

## Etapa `rom-unpack` (versão 1)

| Campo | Valor |
|-------|-------|
| `id` | `rom-unpack` |
| `title` | "Desempacotando a ROM" |
| `inputs` | `[{ kind: "rom" }]` |
| `outputs` | `["binaries", "filesystem", "narc"]` |
| `weight` | 10 |
| `estimateBytes` | `2.5 × romSize` |

Conteúdo das saídas: [research R6](./research.md#r6-layout-da-área-de-trabalho-e-saídas-da-etapa-rom-unpack).
O progresso é reportado pela fração de bytes já gravados.

## Manifesto (`extraction/manifest.json`, `extractor/src/pipeline/manifest.ts`)

```ts
interface Manifest {
  formatVersion: 1;
  rom: { sha1: string; size: number };
  createdAt: string;        // ISO-8601, primeira etapa gravada nesta área de trabalho
  updatedAt: string;        // ISO-8601, última etapa gravada ("data da extração")
  completedAt?: string;     // ISO-8601, gravado quando todas as etapas registradas ficaram em dia
  stages: Record<string, StageRecord>;
}

interface StageRecord {
  version: number;
  completedAt: string;      // ISO-8601
  outputs: Record<string, OutputRecord>;
}

interface OutputRecord {
  sha256: string;           // digest de árvore (research R8), hex minúsculo
  files: number;
  bytes: number;
}
```

Validação na leitura (`parseManifest`, princípio III): `formatVersion === 1`; `sha1` com 40 hex;
`sha256` com 64 hex; contagens inteiras ≥ 0; datas ISO válidas. Em caso de falha →
`{ ok: false, path: "stages.rom-unpack.outputs.narc.files", problem: "esperado inteiro ≥ 0" }` e o
manifesto é tratado como ausente (FR-019).

`rom.sha1` diferente do SHA-1 da cópia guardada = manifesto inválido para essa ROM (todas as
etapas são refeitas).

`completedAt` separa os dois casos de "etapa registrada ausente do manifesto": com `completedAt`,
uma atualização acrescentou a etapa (`outdated`); sem ele, a extração foi interrompida
(`incomplete`).

Gravação: atômica (tmp + fsync + rename) depois de cada etapa e ao remover entradas antes de
reexecutar etapas ([research R7](./research.md#r7-atomicidade-staging-commit-e-manifesto-incremental)).

## Plano de execução (`extractor/src/pipeline/plan.ts`, puro)

```ts
type RunReason = "missing" | "version-changed" | "output-invalid" | "dependency-rerun" | "forced" | "rom-changed";

interface PlannedStage { stage: Stage; reason: RunReason }

function planRun(args: {
  registry: Registry;
  manifest: Manifest | undefined;
  romSha1: string;
  isOutputValid(stageId: string, output: string, record: OutputRecord): Promise<boolean>;
  only?: readonly string[];   // CLI --stages (inclui dependências necessárias)
  force?: readonly string[];  // CLI --force
}): Promise<PlannedStage[]>;
```

Uma etapa entra no plano quando (FR-011), na ordem de prioridade do motivo:

1. `forced`: está em `force`;
2. `rom-changed`: `manifest.rom.sha1 ≠ romSha1`;
3. `missing`: não está no manifesto;
4. `version-changed`: versão registrada ≠ versão atual;
5. `dependency-rerun`: alguma etapa da qual depende está no plano;
6. `output-invalid`: alguma saída falha em `isOutputValid` (digest completo, research R9).

`dependency-rerun` vem antes de `output-invalid` para não calcular digests de uma etapa que vai
rodar de qualquer jeito. O retorno é `{ stages, removed }`; um id desconhecido em `only` ou
`force` lança `StageRegistryError`.

Com `only`, o plano é restrito às etapas pedidas mais as dependências delas que se encaixem em
2–6 acima. Etapas que estão no manifesto mas não estão mais registradas → removidas
(manifesto + pasta) no início do run.

## Resultado da checagem rápida (`checkAssets`)

```ts
type AssetsCheck =
  | { status: "ready" }
  | { status: "needs-extraction"; romAvailable: boolean; reason: "no-manifest" | "incomplete" | "outdated" | "outputs-missing" }
  | { status: "needs-rom" };   // nenhuma extração anterior e nenhuma cópia da ROM
```

`romAvailable` = a cópia guardada existe e tem o tamanho de `manifest.rom.size`. O hash completo
da cópia é conferido no extractor-host antes de usar (FR-005, FR-006); se não conferir, o host
responde `rom-copy-invalid` e o app volta a pedir a ROM.

## Estado dos assets no app (`shared/src/assets-state.ts`)

```ts
type ExtractionMode = "first-run" | "update" | "repair" | "resume";

type AssetsFailure =
  | { code: "disk-full"; requiredBytes: number; availableBytes: number }
  | { code: "write-permission"; path: string }
  | { code: "busy" }
  | { code: "rom-copy-failed" }
  | { code: "stage-failed"; stageTitle: string }
  | { code: "unexpected" };

type AssetsState =
  | { status: "checking" }
  | { status: "needs-rom"; savedRom: boolean; previousRomInvalid: boolean }
  | { status: "validating" }
  | { status: "rejected"; rejection: RomRejection }
  | { status: "extracting"; mode: ExtractionMode; stageTitle: string; percent: number }
  | { status: "cancelling" }
  | { status: "failed"; failure: AssetsFailure }
  | { status: "ready" };
```

Transições (controlador no processo principal):

```text
checking ──ready──────────────────────────────────────────────► ready
checking ──needs-extraction, romAvailable──► extracting(update|repair|resume)
checking ──needs-rom / !romAvailable──────► needs-rom
needs-rom ──chooseRom / submitRomFile──► validating
validating ──ok (cópia gravada)──► extracting(first-run)
validating ──recusada──► rejected ──chooseRom / submitRomFile──► validating
needs-rom(savedRom) ──startExtraction──► extracting(resume)
extracting ──progress──► extracting (percent nunca decresce)
extracting ──cancel──► cancelling ──► needs-rom(savedRom: true)
extracting ──falha──► failed ──retry──► checking
extracting ──rom-copy-invalid──► needs-rom(savedRom: false, previousRomInvalid: true)
extracting ──concluída──► ready
```

- `mode`: `update` quando o motivo é `outdated` (etapa nova ou versão nova); `repair` quando é
  `outputs-missing`; `resume` quando é `incomplete` ou após cancelar; `first-run` após escolher
  a ROM.
- O renderer só mostra a tela principal em `ready`.
- Fechar a janela em `validating`, `extracting` ou `cancelling` pede confirmação (FR-023); se
  confirmar, o app cancela, espera no máximo 5 s e fecha.

## Mensagens do extractor-host (`shared/src/extractor-host-protocol.ts`)

Ver [contracts/extractor-host-protocol.md](./contracts/extractor-host-protocol.md).

## Área de trabalho

```text
%APPDATA%\SoulSilver Desktop\          (app.getPath("userData"))
├── rom\
│   └── soulsilver.nds                 cópia validada (FR-005)
├── extraction\                        raiz da área de trabalho (= --out na CLI)
│   ├── .lock                          research R14
│   ├── manifest.json
│   ├── staging\                       pastas temporárias das etapas
│   └── stages\
│       └── rom-unpack\
│           ├── binaries\  header.bin arm9.bin arm7.bin banner.bin y9.bin y7.bin overlay9\0000.bin … overlay7\…
│           ├── filesystem\ a\0\0\0 … (árvore da FNT, bytes originais)
│           └── narc\       a\0\0\0\0000.bin … [names.json]
└── logs\
    ├── extractor.log
    └── extractor.1.log
```

A cópia da ROM é gravada como `rom/soulsilver.nds.tmp-<aleatório>`, conferida pelo SHA-1 e
renomeada (atômica). Cancelar ou fechar durante a cópia apaga o temporário.

## Logger (`extractor/src/log.ts`)

```ts
interface Logger {
  info(message: string, stageId?: string): void;
  warn(message: string, stageId?: string): void;
  error(message: string, error?: unknown, stageId?: string): void;
}
```

`createFileLogger(path, { maxBytes: 1_048_576 })` faz a rotação; `createConsoleLogger()` é o da
CLI. Formato: [research R13](./research.md#r13-log-de-extração).
