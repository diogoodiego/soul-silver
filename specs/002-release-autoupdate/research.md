# Research: Build, distribuição e auto-update

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-10-23

Formato: Decisão / Motivo / Alternativas. Versões consultadas em 2026-10-23; as exatas ficam no
`package-lock.json`.

## R1. Empacotamento e instalador

- **Decisão**: electron-builder (26.x) com alvo **NSIS one-click, por usuário**
  (`oneClick: true`, `perMachine: false`), x64. Configuração em
  `packages/app/electron-builder.yml`. O instalador vai para
  `%LOCALAPPDATA%\Programs\SoulSilver Desktop`, cria atalhos no menu Iniciar e na área de
  trabalho, e mantém `deleteAppDataOnUninstall: false` (padrão).
- **Motivo**: instalação sem administrador (FR-007), atalhos (FR-008), dados preservados na
  desinstalação (FR-010), e gera `latest.yml` + `.blockmap`, que é o que o electron-updater
  consome. Combinação mais usada e documentada para Electron no Windows.
- **Alternativas**: Electron Forge + Squirrel.Windows (instalador sem UI, sem controle de
  atalhos e com histórico de problemas na atualização); MSIX (exige assinatura para instalar
  fora da loja).

## R2. Atualização automática

- **Decisão**: `electron-updater` (6.x) no processo principal, com provider GitHub (lido do
  `app-update.yml` gerado no build). `autoDownload: true`, `autoInstallOnAppQuit: true`,
  `allowDowngrade: false`. "Reiniciar agora" chama `quitAndInstall(true, true)` (silencioso e
  reabre o app).
- **Motivo**: baixa em segundo plano (FR-013); "Depois" aplica ao fechar (FR-015); só aplica
  arquivos cujo SHA-512 confere com `latest.yml` (FR-016); o instalador só roda depois do
  download completo, então uma falha no meio mantém a versão atual (FR-017). Sem
  `publisherName` configurado, não exige assinatura de código.
- **Alternativas**: `update-electron-app` + update.electronjs.org (exige Squirrel); checagem
  manual da API do GitHub + download próprio (reimplementar integridade e instalação).
- **Limite conhecido**: sem assinatura, a integridade garante que o arquivo é o publicado na
  release, mas não autentica o autor além da conta do GitHub. Aceito pelo modelo de confiança da
  constituição (LAN entre amigos).

## R3. Controlador de atualização testável

- **Decisão**: `createUpdateController({ updater, isPackaged, checkTimeoutMs = 15000, onState })`
  em `packages/app/src/main/update-controller.ts`. Recebe um `updater` com a interface mínima
  usada (eventos `update-available`, `download-progress`, `update-downloaded`,
  `update-not-available`, `error`; métodos `checkForUpdates`, `quitAndInstall`). Traduz eventos
  para `UpdateState` e aplica o timeout de 15 s (FR-020). Em dev (`isPackaged: false`) fica em
  `disabled` e não chama o updater.
- **Motivo**: test-first com updater falso (princípio V); o electron-updater só é importado no
  `main/index.ts`.
- **Alternativas**: usar o electron-updater direto no `index.ts` (não testável sem empacotar).

## R4. Início sem atraso e instância única

- **Decisão**: a checagem começa só depois que a janela foi criada, sem `await` no caminho de
  inicialização. `app.requestSingleInstanceLock()`: uma segunda instância encerra e foca a
  janela existente.
- **Motivo**: FR-012 e SC-004 (abrir offline no mesmo tempo); evita duas instâncias baixando e
  aplicando a mesma atualização (edge case).

## R5. Publicação a partir de tag

- **Decisão**: workflow `.github/workflows/release.yml` em `push` de tags `v*`, runner
  `windows-latest`, `permissions: contents: write`. Passos, em ordem, cada um nomeado:
  1. `Validate tag` (formato, igual à versão do app, nova e maior que a última release);
  2. `Forbidden files`, `Typecheck`, `Lint`, `Test` (mesmos da CI);
  3. `Build installer`: `npm run dist` (electron-vite build + `electron-builder --win
     --publish never`);
  4. `Verify package` (R7);
  5. `Release notes` (R6);
  6. `Publish`: `gh release create <tag> <instalador> <blockmap> latest.yml --notes-file ...`.
- **Motivo**: a release só passa a existir no último passo, depois de todas as verificações.
  Qualquer falha antes disso não cria release (FR-002, FR-003, FR-004). `gh` já vem no runner,
  então não precisa de action de terceiros. O tempo esperado (~8–12 min, a maior parte em
  `npm ci` e no build) cabe nos 20 min (SC-001).
- **Alternativas**: `electron-builder --publish always` (cria a release antes da verificação de
  conteúdo; o rascunho fica pendurado se algo falhar); semantic-release (automatiza a versão,
  mas tira o controle do desenvolvedor e acrescenta dependência).

## R6. Notas de versão

- **Decisão**: função pura `buildReleaseNotes(commits)` em `scripts/release-notes.ts`; a CLI lê
  `git log <tag anterior>..<tag> --no-merges --format=%s` e grava Markdown. Os commits são
  agrupados pelo prefixo convencional: `feat` → "Novidades", `fix` → "Correções", o resto →
  "Outras mudanças"; `docs`, `test`, `ci` e `chore` aparecem só em "Outras mudanças". Na primeira
  release (sem tag anterior), usa todo o histórico.
- **Motivo**: FR-005; os commits já seguem Conventional Commits. As notas automáticas do GitHub
  são baseadas em pull requests e ficam vazias para commits diretos.
- **Alternativas**: `gh release create --generate-notes` (depende de PRs); conventional-changelog
  (dependência maior que o problema).

## R7. Verificação do conteúdo do pacote

- **Decisão**: `findForbiddenPackageFiles(paths)` em `scripts/forbidden-files.ts`, reaproveitando
  as listas de extensões. Dentro do pacote, bloqueia: `.nds`, formatos do DS, imagem e áudio (não
  há exceção de `art/` no pacote nesta feature) e qualquer segmento de caminho `assets/`. A CLI
  `scripts/verify-package.ts <win-unpacked>` lista todos os arquivos da pasta descompactada e
  também o conteúdo de `resources/app.asar` (via `@electron/asar`), e sai com código 1 nomeando
  cada arquivo proibido. Para não colidir com a regra `assets/`, o renderer passa a emitir os
  bundles em `static/` (`build.assetsDir`).
- **Motivo**: FR-004 pede a inspeção do pacote gerado; o instalador NSIS é a compressão exata de
  `win-unpacked`, então verificar essa pasta verifica o que o jogador recebe. Reaproveitar as
  regras mantém uma única definição de "proibido".
- **Alternativas**: abrir o `.exe` NSIS com 7-Zip (dependência externa e formato instável);
  verificar só `out/` (não pega `extraResources` nem arquivos copiados pelo electron-builder).

## R8. Dependências em runtime

- **Decisão**: o pacote empacotado não tem `node_modules`. `@soulsilver/shared`,
  `@soulsilver/server` e `electron-updater` são empacotados no bundle do processo principal pelo
  electron-vite; no `package.json` do `app` eles viram `devDependencies`, e o electron-builder
  inclui apenas `out/**` e `package.json`.
- **Motivo**: evita problemas do electron-builder com symlinks de workspaces; pacote menor; a
  verificação de conteúdo fica simples.
- **Plano B**: se o electron-updater não funcionar empacotado, voltar a deixá-lo externo como
  `dependency` e conferir o `node_modules` gerado.

## R9. Identidade do app e pasta de dados

- **Decisão**: `productName: "SoulSilver Desktop"`, `appId: "io.github.soulsilver-desktop"`.
  A pasta de dados do usuário (`app.getPath("userData")`) passa a ser
  `%APPDATA%\SoulSilver Desktop`. Este nome MUST NOT mudar depois da primeira release, porque é
  onde ficam saves e assets.
- **Motivo**: hoje o nome vem do pacote (`@soulsilver/app`), o que gera uma pasta estranha; fixar
  agora evita migração de dados depois.

## R10. Versão do app e validação da tag

- **Decisão**: a versão vive só em `packages/app/package.json` (lida por `app.getVersion()`).
  Função pura `validateReleaseTag({ tag, appVersion, publishedVersions })` em
  `scripts/release-tag.ts`: exige `^v\d+\.\d+\.\d+$`, `tag === "v" + appVersion`, tag ainda não
  publicada e maior que todas as publicadas (comparação numérica). A CLI busca as versões
  publicadas com `gh release list --json tagName`.
- **Motivo**: FR-002 e os edge cases de tag; puro e testável sem GitHub.

## R11. Interface da atualização

- **Decisão**: na janela atual (Svelte), um componente `UpdateNotice.svelte`:
  - `downloading`: linha discreta "Baixando atualização… N%";
  - `ready`: painel com versão atual e nova, o texto "Versões diferentes não conseguem jogar
    juntas. Reinicie para continuar compatível com seus amigos." e os botões "Reiniciar agora" e
    "Depois";
  - `check-failed`: nota discreta no rodapé "Não foi possível verificar atualizações", com botão
    para dispensar.
  A versão do app passa a vir da API (`getAppVersion`), para continuar visível mesmo com o
  servidor de jogo parado (FR-009).
- **Motivo**: FR-014, FR-019; sem diálogos nativos que bloqueiam a janela.

## R12. Primeira instalação e SmartScreen

- **Decisão**: seção "Instalar o jogo" no README com o link para a página de releases, o passo a
  passo do SmartScreen ("Mais informações" → "Executar assim mesmo"), o motivo (app sem
  assinatura de código), onde ficam os dados e como desinstalar.
- **Motivo**: FR-011; assinatura de código está fora do escopo.

## R13. Teste em PC limpo

- **Decisão**: validar a instalação na **Área Restrita do Windows** (Windows Sandbox), que é um
  Windows limpo descartável, e em pelo menos um PC de amigo.
- **Motivo**: SC-002 sem precisar de uma máquina dedicada.
