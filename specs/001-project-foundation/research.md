# Research: Fundação do projeto

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-10-23

Cada decisão segue o formato Decisão / Motivo / Alternativas. Versões exatas de dependências
são fixadas no `package-lock.json` no momento da implementação; aqui ficam as versões mínimas.

## R1. Gerenciador de pacotes e monorepo

- **Decisão**: npm workspaces (npm ≥ 11, que vem com o Node 24), com os pacotes em
  `packages/*`. Comandos de raiz orquestram os workspaces.
- **Motivo**: já vem com o Node, sem ferramenta extra para instalar no Windows (SC-001), e
  atende 5 pacotes sem cache de build nem grafo de tarefas (princípio X, YAGNI).
- **Alternativas**: pnpm (exige corepack, que está sendo removido do Node, ou instalação global;
  ganho de disco irrelevante aqui); Turborepo/Nx (cache e orquestração desnecessários para 5
  pacotes pequenos).

## R2. Versão do Node e verificação de pré-requisitos

- **Decisão**: Node 24 LTS, declarado em `.nvmrc` e em `engines` (`>=24 <25`) no
  `package.json` da raiz, com `engine-strict=true` no `.npmrc`.
- **Motivo**: `npm install` falha logo no início com a versão esperada e a encontrada, como pede
  o cenário 2 da US1. O Node 24 executa arquivos `.ts` com sintaxe apagável sem build
  (type stripping), o que permite scripts de repositório em TypeScript sem dependência extra.
- **Alternativas**: script `preinstall` próprio (duplica o que o npm já faz); Volta (ferramenta
  extra).

## R3. TypeScript e typecheck

- **Decisão**: TypeScript (última estável 5.x ou superior) com `tsconfig.base.json` comum:
  `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`,
  `erasableSyntaxOnly`, `module`/`moduleResolution` `Bundler` (pacotes) e `NodeNext` (scripts).
  Cada pacote tem script `typecheck` (`tsc --noEmit`; no `client`, também `svelte-check`).
  A raiz roda `npm run typecheck --workspaces --if-present` e o typecheck de `scripts/`.
- **Motivo**: a saída do npm identifica o pacote que falhou (US3, cenário 2). Os pacotes
  apontam `exports` para o código-fonte `.ts`, então não há etapa de build entre pacotes.
- **Alternativas**: project references com `tsc -b` (exige `composite` e emissão de
  declarações; mais configuração sem ganho nesta escala).

## R4. Build e execução do Electron

- **Decisão**: electron-vite, com `electron.vite.config.ts` no pacote `app`. Entradas do
  processo principal: `src/main/index.ts` e `src/server-host/entry.ts` (servidor de jogo).
  Preload: `src/preload/index.ts`, gerado em **CommonJS** (preloads com `sandbox: true` não
  aceitam ESM). Renderer: `root` apontando para `packages/client`.
  `@soulsilver/shared` e `@soulsilver/server` ficam fora do `externalizeDepsPlugin` para serem
  empacotados (o preload sandboxed não consegue fazer `require` de módulos do workspace).
- **Motivo**: um único comando (`npm run dev`) compila os três alvos com recarga rápida;
  configuração mínima para Electron + Vite + Svelte.
- **Alternativas**: Vite + `tsc` + `electron .` com scripts próprios (mais código de cola);
  Electron Forge (traz empacotamento, fora do escopo).

## R5. Onde roda o servidor de jogo

- **Decisão**: `utilityProcess.fork()` do Electron. O processo principal cria o processo
  utilitário com o bundle `server-host/entry`. A comunicação é por `postMessage` (lado
  principal: `child.postMessage` / `child.on('message')`; lado servidor:
  `process.parentPort`). O adaptador que conhece `parentPort` fica no pacote `app`; o pacote
  `server` exporta só lógica pura, sem importar Electron.
- **Motivo**: processo separado do renderer e do processo principal (FR-008, princípio IV);
  um crash do servidor não derruba a janela (edge case); é o mecanismo oficial do Electron para
  processos Node filhos, sem precisar de um Node externo instalado.
- **Alternativas**: `worker_threads` no processo principal (thread separada, mas crash e
  pausas de GC afetam o processo das janelas); `child_process.fork` com Node do sistema (exige
  Node instalado no PC do jogador final).

## R6. Loop de tick de 20 Hz

- **Decisão**: passo fixo com prazo absoluto. O tick *n* vence em `start + n × 50 ms`. Após cada
  tick, o loop agenda o próximo com `setTimeout(prazo − agora)`. Se atrasar, executa os ticks
  vencidos em sequência, até 5 por rodada; acima disso, descarta o atraso e registra o
  ocorrido. Relógio (`now`) e agendador (`schedule`/`cancel`) são injetados.
- **Motivo**: `setInterval` acumula deriva; o prazo absoluto mantém 200 ± 1 ticks em 10 s
  (SC-003). A injeção de relógio permite testar em Node puro com relógio falso, sem esperar
  tempo real (FR-011, princípio V).
- **Alternativas**: `setInterval(50)` (deriva e sem recuperação); laço ocupado com
  `setImmediate` (gasta CPU à toa).

## R7. Ponte renderer ↔ processo principal (IPC)

- **Decisão**: o preload expõe via `contextBridge.exposeInMainWorld('soulSilver', api)` uma API
  tipada (`SoulSilverApi`, definida em `shared`):
  - `getServerInfo()` → `ipcRenderer.invoke('server:get-info')`;
  - `onServerStatus(listener)` → `ipcRenderer.on('server:status')`, que devolve a função de
    cancelamento.
  Os nomes de canal são constantes em `shared`. O preload nunca expõe `ipcRenderer` diretamente.
  O processo principal encaminha `server:get-info` ao servidor com `requestId` e timeout de
  2 s; os eventos de status do servidor (1 por tick) são repassados à janela.
- **Motivo**: princípio IX e FR-014; um único contrato tipado usado pelas três pontas (FR-007).
  20 mensagens por segundo é carga desprezível para IPC.
- **Alternativas**: o renderer consultar o contador periodicamente (latência e código extra);
  MessagePort direto entre renderer e servidor (mais rápido, mas complica o isolamento e a
  validação; reavaliar no núcleo do jogo).

## R8. Endurecimento do renderer

- **Decisão**: `BrowserWindow` com `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true`, `webSecurity: true`. A navegação e a abertura de janelas são bloqueadas
  (`will-navigate` com `preventDefault` para qualquer URL diferente da origem do app;
  `setWindowOpenHandler` → `deny`). Todos os pedidos de permissão são negados
  (`session.setPermissionRequestHandler`). CSP via `<meta>`: `default-src 'self'`, sem
  `unsafe-eval`. Em dev, a única origem aceita é o servidor local do Vite.
  As opções da janela e as regras de navegação ficam em funções puras, testadas.
- **Motivo**: princípio IX; FR-013 a FR-015; testável sem abrir o Electron.
- **Alternativas**: Electron Fuses e ASAR integrity (aplicam-se ao empacotamento, que está fora
  do escopo; entram com o spec do instalador).

## R9. Interface de placeholder

- **Decisão**: um componente Svelte 5 (`App.svelte`) mostra versão do app, versão do
  protocolo, estado do servidor e contador de ticks; mostra um estado de erro quando
  `getServerInfo` rejeita ou quando chega status `stopped`. Sem PixiJS.
- **Motivo**: a constituição define Svelte para a interface; validar agora o pipeline
  Svelte + TypeScript strict + lint evita retrabalho. PixiJS está fora do escopo.
- **Alternativas**: HTML e TS puros (menos dependências agora, mas adia a validação do stack
  obrigatório).

## R10. Testes

- **Decisão**: Vitest, com `vitest.config.ts` na raiz usando `test.projects` (um projeto por
  pacote + `scripts`). `npm test` roda `vitest run` uma vez para tudo. Cada pacote tem um
  `test/` próprio. Testes de lógica (tick loop, roteamento de pedidos do servidor, verificação
  de arquivos proibidos, opções de segurança) seguem test-first.
- **Motivo**: nativo para TypeScript e Vite; o relatório agrupa os resultados por projeto, o
  que mostra os cinco pacotes cobertos (US3, cenário 3).
- **Alternativas**: Jest (precisa de transformação de TS e ESM); `node:test` (sem suporte a
  Svelte/Vite e sem agrupar por projeto).

## R11. Lint

- **Decisão**: ESLint 9 com flat config na raiz (`eslint.config.js`): `@eslint/js`
  recomendado, `typescript-eslint` com regras type-checked, `eslint-plugin-svelte`. Regras
  adicionais: proibir import de `electron` e de módulos `node:*` em `packages/client` e
  `packages/server/src` (`no-restricted-imports`), reforçando os princípios IV e IX.
  Formatador: nenhum nesta feature.
- **Motivo**: um comando (`npm run lint`) para o repositório inteiro, e a regra de import
  transforma uma violação de arquitetura em erro de lint.
- **Alternativas**: Biome (sem suporte completo a Svelte); Prettier (formatação não é requisito
  aqui; pode entrar depois com justificativa).

## R12. Hook de pre-commit

- **Decisão**: hooks nativos do git em `.githooks/`, ativados pelo script `prepare` da raiz
  (`git config core.hooksPath .githooks`), que roda no `npm install`. O script ignora sem erro
  quando o diretório não é repositório git. O hook `.githooks/pre-commit` (shell, executado pelo
  Git for Windows) chama `node scripts/check-forbidden-files.ts --staged`.
- **Motivo**: zero dependências; ativo após a instalação sem passo manual (FR-020).
- **Alternativas**: husky ou simple-git-hooks (dependência extra para o mesmo resultado);
  pre-commit (Python).

## R13. Regras de arquivos proibidos

- **Decisão**: módulo puro `scripts/forbidden-files.ts` com `findForbiddenFiles(paths)`, que
  recebe caminhos relativos e devolve as violações com o motivo de cada uma. Regras, nesta
  ordem, sem diferenciar maiúsculas e minúsculas:
  1. qualquer caminho dentro de `assets/` → bloqueado (saída do extrator);
  2. extensão de ROM (`.nds`) → bloqueado em qualquer lugar;
  3. extensões de formatos extraídos do DS (lista do spec) → bloqueado em qualquer lugar;
  4. extensões de imagem e áudio (`.png .jpg .jpeg .gif .bmp .webp .tga .ico .svg .wav .ogg
     .mp3 .flac .mid .midi`) → bloqueado **fora de `art/`**, pasta de arte original do
     projeto.

  CLI `scripts/check-forbidden-files.ts`: `--staged` usa
  `git diff --cached --name-only --diff-filter=ACMR`; `--all` usa `git ls-files`. Sai com
  código 1 e mensagem em PT-BR que lista cada arquivo e o motivo, citando o princípio II.
  A integração contínua roda `--all`.
- **Motivo**: a regra 4 impede que um asset convertido para PNG ou WAV escape pela extensão
  comum, deixando `art/` como única exceção explícita (FR-019). Função pura → test-first sem
  git.
- **Alternativas**: só `.gitignore` (não impede `git add -f`); detecção por conteúdo (assinatura
  de arquivo; complexidade desnecessária agora).

## R14. Fixtures sintéticos

- **Decisão**: convenção `packages/<pacote>/test/fixtures/`. Fixtures são **gerados por código**
  (builders TypeScript que montam buffers e objetos em memória), não arquivos binários
  versionados. Um `README.md` em `packages/extractor/test/fixtures/` documenta a convenção.
- **Motivo**: princípio II (testes nunca dependem da ROM) e FR-005; builders evitam pedir
  exceção ao hook para binários em formato DS.
- **Alternativas**: binários sintéticos versionados com exceção no hook (abre uma brecha para
  assets reais).

## R15. Integração contínua

- **Decisão**: GitHub Actions, `.github/workflows/ci.yml`, em `push` (todos os branches) e
  `pull_request`. Runner `windows-latest`. Passos: `actions/checkout`, `actions/setup-node`
  com `node-version-file: .nvmrc` e cache npm, `npm ci`, e depois um passo por checagem
  (arquivos proibidos, typecheck, lint, testes), para que a falha apareça com o nome do passo
  (FR-023). O download do binário do Electron é mantido (o typecheck usa os tipos dele); os
  testes não abrem janela.
- **Motivo**: a constituição define GitHub como hospedagem; plataforma única Windows.
- **Alternativas**: matriz com Linux (fora do escopo da constituição).

## R16. Biblioteca de schemas

- **Decisão**: nenhuma nesta feature. A mensagem entre processo principal e servidor é validada
  com um type guard escrito à mão em `shared`.
- **Motivo**: ainda não há arquivos de dados (princípio III) nem rede; escolher a biblioteca de
  schema é decisão do primeiro spec que carregar dados (o extrator), com justificativa
  (princípio X).
- **Alternativas**: adotar zod ou valibot já (dependência sem uso real hoje).
