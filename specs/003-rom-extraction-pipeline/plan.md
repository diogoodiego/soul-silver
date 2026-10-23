# Implementation Plan: Validação da ROM, desempacotamento e primeira execução

**Branch**: `003-rom-extraction-pipeline` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-rom-extraction-pipeline/spec.md`

## Summary

Transformar `@soulsilver/extractor` numa biblioteca em Node puro, com três partes:

1. **Validação da ROM**: cabeçalho do DS para identificar jogo e região, e SHA-1 do arquivo
   completo contra a referência do SoulSilver (EUA).
2. **Pipeline de etapas registráveis**: registro com ordem topológica, planner puro que decide o
   que rodar, e runner com staging + rename atômico e manifesto gravado depois de cada etapa.
3. **Primeira etapa, `rom-unpack`**: extrai binários, sistema de arquivos e membros de cada NARC
   (detectado por assinatura) para a área de trabalho.

Uma CLI fina (`npm run extract`) usa a mesma biblioteca. No app:

- o processo principal faz uma checagem rápida do manifesto na abertura;
- a validação, a cópia e a extração rodam num `utilityProcess` próprio (extractor-host), no
  mesmo padrão do server-host;
- um controlador testado expõe `AssetsState` ao renderer;
- uma tela Svelte conduz o jogador: boas-vindas, recusa, progresso, falha com log e assets
  prontos.

Nenhuma dependência nova. Decisões em [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 6.0 (strict), Node.js 24 LTS, Electron 45 (herdados).

**Primary Dependencies**: nenhuma nova. Usa só módulos nativos do Node: `node:crypto` (SHA-1 e
SHA-256), `node:fs/promises` (`statfs`, `rename`, `readdir` recursivo), `node:util`
(`parseArgs`), `AbortController`. Do Electron: `utilityProcess`, `dialog`, `shell`, `webUtils`.

**Storage**: arquivos na pasta de dados do usuário (`%APPDATA%\SoulSilver Desktop`): cópia da ROM,
área de trabalho com `manifest.json` (JSON validado) e log de texto com rotação.

**Testing**: Vitest (projetos `extractor`, `shared`, `app`), com ROMs e NARCs sintéticos montados
por builders em `packages/extractor/test/fixtures/`.

**Target Platform**: Windows 10/11 x64 (app e CLI de desenvolvimento).

**Project Type**: app desktop (Electron) em monorepo npm workspaces; biblioteca + CLI no pacote
`extractor`.

**Performance Goals**:

- validação < 5 s (SC-002);
- primeira extração completa < 2 min para ROM de 128 MiB (SC-003);
- checagem na abertura < 1 s (SC-007);
- progresso com ≥ 1 atualização/s (FR-020).

**Constraints**:

- nenhuma saída parcial pode ser marcada como pronta;
- o processo principal e o renderer nunca são bloqueados;
- o extrator não importa `electron`;
- os testes nunca usam a ROM real;
- o log não contém bytes da ROM.

**Scale/Scope**:

- ROM de 128 MiB, ~300 NARCs e dezenas de milhares de membros;
- ~350 MiB na área de trabalho + 128 MiB da cópia;
- ~15 arquivos novos no `extractor`, 3 no `shared`, 3 no `app`, 1 componente Svelte.

### Dependências novas (princípio X)

Nenhuma. Foram rejeitadas: ndstool e bibliotecas npm de NDS/NARC (R4, R5), `tsx` (R11), zod
(R15) e `proper-lockfile` (R14).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Status | Como o plano atende |
|-----------|--------|---------------------|
| I. Conteúdo fiel | ✅ | `rom-unpack` grava os bytes originais, sem conversão nem ajuste. Ela é a base de todo conteúdo dos specs 4 a 9. |
| II. Assets nunca distribuídos | ✅ | Aceita só SoulSilver (EUA) por SHA-1 (R2, R3). A cópia da ROM, a área de trabalho e o log ficam em `%APPDATA%`. A saída padrão da CLI é `assets/`, já ignorada e bloqueada pelo hook. Os testes usam builders sintéticos sem binários versionados (R18). O pacote do app só ganha código; a verificação da 002 continua valendo (quickstart §8). |
| III. Data-driven | ✅ | O manifesto é um arquivo de dados com validação no carregamento e erro com caminho do campo (R15). As etapas declaram entradas e saídas em dados, não em código do pipeline. |
| IV. Servidor autoritativo e simulação isolada | ✅ | A extração roda num `utilityProcess` próprio, separado do servidor de jogo e do renderer (R10). O servidor de jogo não muda. |
| V. Test-first | ✅ | Validação, parsers NDS/NARC, registro, planner, runner (incluindo interrupção), manifesto, CLI e `assets-controller` são escritos test-first (R18). A tela Svelte é verificada manualmente (quickstart §4–7). |
| VI. Contratos versionados | ✅ | `AssetsState`, `RomValidationResult`, o protocolo do extractor-host e os canais IPC ficam em `shared` ([contracts/](./contracts/)). O manifesto tem `formatVersion`, e cada etapa tem `version`. |
| VII. Progresso individual | N/A | Sem estado de jogador. |
| VIII. Saves no PC do jogador | ✅ (indireto) | A gravação atômica (tmp + fsync + rename) segue o mesmo padrão exigido para saves. Esta feature não toca em saves. |
| IX. Segurança do Electron | ✅ | O renderer só recebe `AssetsState`. O caminho do arrastar e soltar vem de `webUtils` no preload. O principal só atende a janela do app e ignora pedidos fora de estado. Nenhum conteúdo remoto. |
| X. Desempenho e simplicidade | ✅ | Zero dependências novas. A checagem rápida na abertura evita custo no caminho de inicialização (R9). Um único processo extra, só durante a extração. |
| XI. Entrega incremental | ✅ | Primeiro passo do Marco 1 (extrator). O pipeline é o ponto de extensão dos specs 4 a 9 ([contrato](./contracts/extractor-library-api.md#como-uma-etapa-futura-se-pluga-specs-4-a-9)). |
| Restrições técnicas | ✅ | Pacote `extractor` como biblioteca + CLI, exatamente como a constituição define. Somente Windows. |
| Idioma | ✅ | Docs e textos de interface em PT-BR; código, identificadores e mensagens de log em inglês. |
| Fluxo de desenvolvimento | ✅ | Typecheck, lint e testes cobrem o pacote `extractor` (já está nos workspaces e no Vitest). |

**Resultado (pré-pesquisa)**: aprovado.

**Resultado (pós-design)**: aprovado, sem violações. Uma nota: o hash de referência (R2) precisa
ser confirmado no DAT do No-Intro antes do merge (quickstart §2).

## Project Structure

### Documentation (this feature)

```text
specs/003-rom-extraction-pipeline/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── extractor-library-api.md
│   ├── cli.md
│   ├── extractor-host-protocol.md
│   └── renderer-api.md
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
package.json                         # + script "extract"
eslint.config.js                     # + no-restricted-imports "electron" em packages/extractor

packages/shared/src/
├── rom-validation.ts                # novo: RomRejection, RomValidationResult, romRejectionMessage
├── assets-state.ts                  # novo: AssetsState, AssetsFailure, ExtractionMode
├── extractor-host-protocol.ts       # novo: mensagens + guardas
├── ipc.ts                           # + 7 canais, + 7 métodos em SoulSilverApi
└── index.ts                         # + exports
packages/shared/test/
├── rom-validation.test.ts           # uma mensagem por motivo
└── extractor-host-protocol.test.ts

packages/extractor/
├── package.json                     # + dependência @soulsilver/shared
├── tsconfig.json                    # types ["node"], allowImportingTsExtensions
├── src/
│   ├── index.ts                     # API pública (contracts/extractor-library-api.md)
│   ├── cli.ts                       # main(argv, io) + execução direta
│   ├── log.ts                       # Logger, createFileLogger (rotação), createConsoleLogger
│   ├── fs-atomic.ts                 # writeFileAtomic, renameWithRetry
│   ├── binary.ts                    # leitura u16/u32 LE com checagem de limites
│   ├── rom/
│   │   ├── reference.ts             # REFERENCE_ROM_SHA1
│   │   ├── crc16.ts
│   │   ├── validate.ts              # validateRom (R3)
│   │   └── copy.ts                  # copyRom (tmp + SHA-1 + rename)
│   ├── nds/
│   │   ├── header.ts                # parseNdsHeader
│   │   ├── filesystem.ts            # FNT/FAT/overlays → árvore
│   │   └── narc.ts                  # isNarc, parseNarc
│   ├── pipeline/
│   │   ├── stage.ts                 # Stage, StageContext, StageInput
│   │   ├── registry.ts              # createRegistry (validação + ordem topológica)
│   │   ├── manifest.ts              # tipos, parseManifest, read/write atômico
│   │   ├── digest.ts                # digest de árvore (R8)
│   │   ├── plan.ts                  # planRun (puro)
│   │   ├── check.ts                 # checkAssets (rápido, R9) + verifyOutputs
│   │   ├── lock.ts                  # lock da área de trabalho (R14)
│   │   └── run.ts                   # runPipeline (staging, commit, progresso, cancelamento)
│   └── stages/
│       ├── rom-unpack.ts            # etapa 1
│       └── index.ts                 # defaultStages
└── test/
    ├── fixtures/
    │   ├── README.md                # (existente)
    │   ├── build-narc.ts
    │   └── build-nds-rom.ts
    ├── rom/validate.test.ts, copy.test.ts, crc16.test.ts
    ├── nds/header.test.ts, filesystem.test.ts
    ├── narc.test.ts
    ├── pipeline/registry.test.ts, manifest.test.ts, digest.test.ts, plan.test.ts,
    │   check.test.ts, lock.test.ts, run.test.ts, interruption.test.ts, update.test.ts
    ├── stages/rom-unpack.test.ts
    ├── log.test.ts
    └── cli.test.ts                  # (index.test.ts substituído)

packages/app/
├── package.json                     # + devDep @soulsilver/extractor
├── electron.vite.config.ts          # + entrada "extractor-host"
├── src/main/
│   ├── assets-controller.ts         # novo: máquina de estados (data-model), puro com portas injetadas
│   └── index.ts                     # checagem na abertura, IPC novos, confirmação ao fechar
├── src/extractor-host/entry.ts      # novo: adapta parentPort → biblioteca
├── src/preload/index.ts             # + 7 métodos (submitRomFile via webUtils)
└── test/assets-controller.test.ts

packages/client/src/
├── App.svelte                       # mostra FirstRun até AssetsState "ready"
└── FirstRun.svelte                  # novo: telas da tabela em contracts/renderer-api.md
```

**Structure Decision**: mantém o monorepo das features 001 e 002.

- Toda a lógica de extração fica no pacote `extractor`, em Node puro e testável; a CLI é só um
  adaptador de argumentos.
- O app segue o padrão do server-host: entry fino em `utilityProcess`, protocolo com guardas em
  `shared` e controlador puro no processo principal.
- Specs futuros só adicionam arquivos em `packages/extractor/src/stages/`.

## Complexity Tracking

Nenhuma violação da constituição a justificar.
