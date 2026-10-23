# Implementation Plan: Fundação do projeto

**Branch**: `001-project-foundation` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-project-foundation/spec.md`

## Summary

Montar o esqueleto do monorepo (`app`, `client`, `server`, `shared`, `extractor`) e provar a
arquitetura da constituição com o mínimo de código. Uma janela Electron isolada pede, pela API
tipada do preload, a versão do app e o estado do servidor de jogo. O servidor roda num
`utilityProcess` separado, com um loop de tick fixo de 20 Hz que só conta ticks, e transmite o
contador para a janela. Typecheck, lint e testes rodam com um comando cada. Um hook de
pre-commit nativo do git, ativado no `npm install`, bloqueia ROMs, a pasta `assets/`, formatos
do DS e mídia fora de `art/`. A integração contínua repete essas checagens no Windows a cada
push. Detalhes das decisões em [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript (strict) sobre Node.js 24 LTS; Electron (última estável no
momento da implementação, versão exata fixada no lockfile)

**Primary Dependencies**: electron, electron-vite (+ vite), svelte 5 com
@sveltejs/vite-plugin-svelte e svelte-check, vitest, eslint 9 + typescript-eslint +
eslint-plugin-svelte. Justificativa de cada uma na tabela de dependências abaixo.

**Storage**: N/A (nenhuma persistência nesta feature)

**Testing**: Vitest com `test.projects` (um projeto por pacote + `scripts`)

**Target Platform**: Windows 10/11 x64; integração contínua em GitHub Actions `windows-latest`

**Project Type**: app desktop (Electron) em monorepo npm workspaces

**Performance Goals**: loop do servidor a 20 Hz com no máximo ±1 tick de desvio em 10 s;
resposta de `getServerInfo` em até 3 s após abrir a janela

**Constraints**: renderer com `contextIsolation`, `sandbox`, sem `nodeIntegration` e sem
conteúdo remoto; servidor fora do processo do renderer e do processo principal; zero assets
versionados; setup do zero em menos de 15 min

**Scale/Scope**: 5 pacotes + `scripts/`, cerca de 25 arquivos de código e configuração; 1 janela

### Dependências novas (princípio X)

| Dependência | Pacote | Justificativa |
|-------------|--------|---------------|
| `electron` | app | Plataforma definida pela constituição. |
| `electron-vite`, `vite` | app (dev) | Compila main, preload e renderer com um comando e recarga rápida; alternativa manual exige scripts de cola (R4). |
| `svelte`, `@sveltejs/vite-plugin-svelte` | client | UI definida pela constituição; valida o pipeline agora (R9). |
| `svelte-check` | client (dev) | Typecheck de `.svelte`, que o `tsc` não cobre. |
| `typescript` | raiz (dev) | Linguagem obrigatória. |
| `vitest` | raiz (dev) | Runner de testes para TS/Vite com projetos por pacote (R10). |
| `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-svelte`, `globals` | raiz (dev) | Lint com um comando, incluindo regras de import que reforçam os princípios IV e IX (R11). |

Rejeitadas por YAGNI: pnpm, Turborepo, husky, Prettier e biblioteca de schema (R1, R12, R11, R16).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Status | Como o plano atende |
|-----------|--------|---------------------|
| I. Conteúdo fiel, mecânica livre | ✅ | Sem conteúdo de jogo. Cria `docs/balance-log.md` com o modelo de registro (FR-025). |
| II. Assets nunca distribuídos | ✅ | `assets/` no `.gitignore`; hook de pre-commit e CI bloqueiam ROM, `assets/`, formatos DS e mídia fora de `art/` (R12, R13); fixtures gerados por código (R14). Validação da ROM por hash fica para o spec do extrator. |
| III. Conteúdo data-driven | ✅ N/A | Nenhum arquivo de dados nesta feature; a escolha da lib de schema fica para o primeiro spec com dados (R16). |
| IV. Servidor autoritativo e simulação isolada | ✅ | Servidor em `utilityProcess`; `packages/server` sem Electron, com relógio injetado e testável em Node puro; regra de lint proíbe `electron`/`node:*` em `server/src` (R5, R6, R11). |
| V. Test-first na lógica | ✅ | Tick loop, roteamento de mensagens do servidor, type guards do protocolo e regras de arquivos proibidos são escritos test-first. Janela Svelte validada manualmente (quickstart, cenário 2). |
| VI. Contratos versionados | ✅ | `SoulSilverApi`, canais de IPC, mensagens principal↔servidor e `PROTOCOL_VERSION = 1` em `shared`; o servidor recusa `init` de versão diferente (contracts/). Saves: N/A. |
| VII. Progresso individual | N/A | Sem jogadores nem flags. |
| VIII. Saves do jogador | N/A | Sem saves. |
| IX. Segurança do Electron | ✅ | `contextIsolation`, `sandbox`, sem `nodeIntegration`; navegação, novas janelas e permissões bloqueadas; CSP; API única via preload; opções testadas como funções puras (R7, R8). |
| X. Desempenho e simplicidade | ✅ | Toda dependência justificada acima; alternativas mais pesadas rejeitadas. Loop de tick sem espera ocupada. |
| XI. Entrega incremental jogável | ✅ (com nota) | Esta feature é infraestrutura pré-marco, não um marco; não há o que jogar. Ela habilita o 1º marco (extrator) e não altera a ordem dos marcos. |
| Restrições técnicas | ✅ | Windows only, TS strict, Electron + Svelte, monorepo com os 5 pacotes, CI no GitHub. |
| Fluxo de desenvolvimento | ✅ | Os comandos únicos de typecheck, lint e testes viabilizam a regra "nenhuma task concluída sem checagens". |

**Resultado (pré-pesquisa)**: aprovado, sem violações.
**Resultado (pós-design)**: aprovado. Os contratos mantêm `server` independente de Electron, o
renderer limitado a `window.soulSilver` e toda dependência justificada.

## Project Structure

### Documentation (this feature)

```text
specs/001-project-foundation/
├── plan.md              # Este arquivo
├── research.md          # Fase 0
├── data-model.md        # Fase 1
├── quickstart.md        # Fase 1
├── contracts/
│   ├── renderer-api.md
│   ├── server-host-protocol.md
│   └── forbidden-files-check.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks; não criado aqui)
```

### Source Code (repository root)

```text
package.json               # workspaces, engines, scripts: dev, typecheck, lint, test, check:assets, prepare
package-lock.json
.nvmrc                     # 24
.npmrc                     # engine-strict=true
.gitignore                 # node_modules, out/, dist/, assets/, *.nds
.gitattributes             # finais de linha (LF para .githooks/*)
tsconfig.base.json         # opções strict comuns
tsconfig.json              # typecheck de scripts/ e configs da raiz
eslint.config.js
vitest.config.ts           # test.projects
README.md                  # PT-BR: pré-requisitos, setup, rodar app, checagens
.githooks/
└── pre-commit             # node scripts/check-forbidden-files.ts --staged
.github/workflows/
└── ci.yml                 # windows-latest: forbidden files, typecheck, lint, test
scripts/
├── forbidden-files.ts     # regras puras (findForbiddenFiles)
├── check-forbidden-files.ts  # CLI --staged | --all
├── setup-git-hooks.ts     # usado por "prepare"; ignora se não for repo git
└── test/forbidden-files.test.ts
docs/
└── balance-log.md
art/
└── README.md              # pasta permitida para arte original do projeto
assets/                    # ignorada; saída do extrator (não versionada)

packages/
├── shared/
│   ├── src/
│   │   ├── index.ts
│   │   ├── protocol-version.ts      # PROTOCOL_VERSION
│   │   ├── server-info.ts           # ServerInfo, ServerStatus
│   │   ├── server-host-protocol.ts  # mensagens + type guards
│   │   └── ipc.ts                   # IpcChannel, SoulSilverApi
│   └── test/
├── server/
│   ├── src/
│   │   ├── index.ts
│   │   ├── tick-loop.ts             # loop de passo fixo com relógio injetado
│   │   └── game-server.ts           # handleMessage(msg), send injetado
│   └── test/
├── app/
│   ├── electron.vite.config.ts      # main + server-host + preload (CJS) + renderer (root: ../client)
│   ├── src/
│   │   ├── main/
│   │   │   ├── index.ts             # ciclo de vida do app, cria janela e servidor
│   │   │   ├── window-options.ts    # webPreferences seguras (função pura)
│   │   │   ├── navigation-guard.ts  # regras de navegação/permissões (função pura)
│   │   │   └── server-host.ts       # utilityProcess, pedidos com timeout, status
│   │   ├── server-host/
│   │   │   └── entry.ts             # adaptador parentPort → packages/server
│   │   └── preload/
│   │       └── index.ts             # contextBridge → SoulSilverApi
│   └── test/
├── client/
│   ├── index.html                   # CSP
│   ├── src/
│   │   ├── main.ts
│   │   ├── App.svelte               # placeholder: versões, estado, ticks, erro
│   │   └── global.d.ts              # window.soulSilver: SoulSilverApi
│   └── test/
└── extractor/
    ├── src/index.ts                 # esqueleto, sem extração
    └── test/
        ├── index.test.ts
        └── fixtures/README.md       # convenção de fixtures gerados por código
```

**Structure Decision**: monorepo npm workspaces com os cinco pacotes da constituição em
`packages/`. O pacote `app` concentra tudo que depende do Electron (processo principal, preload,
adaptador do processo do servidor e configuração de build); `client` contém só o renderer;
`server` e `shared` são TypeScript puro. Ferramentas de repositório ficam em `scripts/` na raiz,
com testes próprios.

## Complexity Tracking

Nenhuma violação da constituição a justificar.
