# Implementation Plan: Build, distribuição e auto-update

**Branch**: `002-release-autoupdate` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-release-autoupdate/spec.md`

## Summary

Empacotar o app com electron-builder num instalador NSIS por usuário (sem administrador), e
publicá-lo no GitHub Releases a partir de uma tag `vX.Y.Z`. Um workflow valida a tag, roda as
checagens, gera o instalador, verifica que o pacote não tem nenhum asset, gera as notas a partir
dos commits e só então cria a release. No app, o electron-updater verifica a versão ao abrir,
baixa em segundo plano e mostra um painel com "Reiniciar agora" e "Depois"; sem internet, mostra
um aviso discreto e segue funcionando. A lógica nova (tag, notas, verificação de pacote,
controlador de atualização) é pura e testada antes. Decisões em [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 6.0 (strict), Node.js 24 LTS, Electron 45 (herdados da 001)

**Primary Dependencies**: novas: `electron-builder` (26.x, dev), `electron-updater` (6.x,
empacotado no bundle do main), `@electron/asar` (dev, para ler o pacote na verificação)

**Storage**: N/A (o cache de download é do electron-updater; a pasta de dados do usuário só é
fixada, não usada)

**Testing**: Vitest (projetos `app` e `scripts`)

**Target Platform**: Windows 10/11 x64; publicação em GitHub Actions `windows-latest`

**Project Type**: app desktop (Electron) em monorepo npm workspaces

**Performance Goals**: tag → release < 20 min; abertura offline sem atraso perceptível (≤ 2 s
a mais); checagem desiste em 15 s

**Constraints**: nenhum asset no pacote; instalação sem administrador; dados do usuário
preservados; sem assinatura de código; repositório público

**Scale/Scope**: ~6 arquivos novos em `scripts/`, 1 workflow, 1 config de build, ~3 arquivos no
`app`, 1 componente Svelte; 2 a 4 jogadores por partida

### Dependências novas (princípio X)

| Dependência | Onde | Justificativa |
|-------------|------|---------------|
| `electron-builder` | app (dev) | Gera instalador NSIS por usuário, `latest.yml` e blockmap; padrão de fato (R1). |
| `electron-updater` | app (dev, bundled) | Download em segundo plano, verificação SHA-512, aplicação ao fechar (R2). |
| `@electron/asar` | raiz (dev) | Listar o conteúdo de `app.asar` na verificação do pacote (R7); já vem como dependência transitiva do electron-builder. |

Rejeitadas: Electron Forge/Squirrel, MSIX, semantic-release, conventional-changelog,
`update-electron-app` (R1, R2, R5, R6).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Status | Como o plano atende |
|-----------|--------|---------------------|
| I. Conteúdo fiel | N/A | Sem conteúdo de jogo. |
| II. Assets nunca distribuídos | ✅ | `Verify package` inspeciona `win-unpacked` e `app.asar` antes de publicar; o build inclui só `out/**` e `package.json` (R7, R8). Dados do usuário ficam em `%APPDATA%\SoulSilver Desktop`, preservados na desinstalação (R1, R9). |
| III. Data-driven | N/A | Sem arquivos de dados. |
| IV. Servidor autoritativo | ✅ | Não muda; o updater roda no processo principal, fora do servidor de jogo. |
| V. Test-first | ✅ | `validateReleaseTag`, `buildReleaseNotes`, `findForbiddenPackageFiles` e `createUpdateController` são escritos test-first. Painel de atualização verificado manualmente (quickstart). |
| VI. Contratos versionados | ✅ | `UpdateState` e os 4 canais novos ficam em `shared` (contracts/renderer-api.md). A atualização automática é o mecanismo que mantém todos no mesmo `PROTOCOL_VERSION`. |
| VII. Progresso individual | N/A | — |
| VIII. Saves no PC do jogador | ✅ | Desinstalação e atualização não tocam na pasta de dados do usuário (FR-010). |
| IX. Segurança do Electron | ✅ | Renderer continua sem rede e sem Node; o download acontece só no processo principal, via HTTPS do GitHub; a API nova só expõe estado e um comando de reinício. |
| X. Desempenho e simplicidade | ✅ | 3 dependências justificadas; a release usa `gh`, sem actions de terceiros; checagem fora do caminho de inicialização. |
| XI. Entrega incremental | ✅ | Habilita testar cada marco nos PCs dos amigos. |
| Restrições técnicas | ✅ | GitHub Releases, instalador Windows e auto-update, exatamente como a constituição define. |
| Modelo de confiança | ✅ (com nota) | Sem assinatura, a autenticidade da atualização depende da conta do GitHub; aceitável para LAN entre amigos (R2). |
| Fluxo de desenvolvimento | ✅ | O workflow de release repete typecheck, lint e testes. |

**Resultado (pré-pesquisa)**: aprovado.
**Resultado (pós-design)**: aprovado, sem violações.

## Project Structure

### Documentation (this feature)

```text
specs/002-release-autoupdate/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── renderer-api.md
│   └── release-pipeline.md
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
package.json                      # + script "dist"; devDep @electron/asar
.gitignore                        # + packages/app/dist/ (via "dist/")
README.md                         # + "Instalar o jogo", "Publicar uma versão"
.github/workflows/
├── ci.yml                        # inalterado
└── release.yml                   # novo: tag v* → release
scripts/
├── forbidden-files.ts            # + findForbiddenPackageFiles
├── verify-package.ts             # novo: CLI sobre win-unpacked + app.asar
├── release-tag.ts                # novo: validateReleaseTag (puro)
├── check-release-tag.ts          # novo: CLI (lê versão do app + gh release list)
├── release-notes.ts              # novo: buildReleaseNotes (puro) + CLI
└── test/
    ├── forbidden-files.test.ts   # + casos de pacote
    ├── release-tag.test.ts       # novo
    └── release-notes.test.ts     # novo

packages/shared/src/
├── update-state.ts               # novo: UpdateState
└── ipc.ts                        # + canais e métodos novos

packages/app/
├── package.json                  # productName, deps → devDeps, script "dist"
├── electron-builder.yml          # novo: NSIS one-click por usuário, publish github
├── electron.vite.config.ts       # renderer assetsDir "static"; bundle electron-updater
├── src/main/
│   ├── update-controller.ts      # novo: createUpdateController (puro, testado)
│   └── index.ts                  # instância única, updater, IPC novos
├── src/preload/index.ts          # + 4 métodos
└── test/update-controller.test.ts

packages/client/src/
├── App.svelte                    # versão via getAppVersion; inclui UpdateNotice
└── UpdateNotice.svelte           # novo
```

**Structure Decision**: mantém o monorepo da 001. Ferramentas de release ficam em `scripts/`
(funções puras + CLIs finas, como `forbidden-files`); a integração com o electron-updater fica no
pacote `app`, com a lógica isolada em `update-controller.ts`.

## Complexity Tracking

Nenhuma violação da constituição a justificar.
