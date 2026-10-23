# Quickstart: validação de build, distribuição e auto-update

**Feature**: [spec.md](./spec.md) | **Date**: 2026-10-23

## Pré-requisitos

- Repositório **público** no GitHub, com a `001-project-foundation` mergeada.
- `gh` autenticado localmente (para inspecionar releases).
- Windows 11 Pro com a **Área Restrita do Windows** (Windows Sandbox) habilitada, ou um segundo
  PC, para os testes de jogador.

## Cenário 1 — Build e verificação local (SC-005)

```powershell
npm run dist
node scripts/verify-package.ts packages/app/dist/win-unpacked
```

**Esperado**: `packages/app/dist/` contém o instalador, o `.blockmap` e o `latest.yml`; a
verificação sai com 0.

**Asset injetado** (o build do electron-vite limpa `out/`, então o arquivo entra depois dele):

```powershell
npm run build
New-Item -ItemType File packages/app/out/renderer/static/test.narc
cd packages/app; npx electron-builder --win --dir --publish never; cd ../..
node scripts/verify-package.ts packages/app/dist/win-unpacked
```

**Esperado**: a verificação sai com 1 e nomeia `test.narc` (dentro de `app.asar`). Rode
`npm run dist` de novo para limpar.

## Cenário 2 — Publicar com tag (US1, SC-001)

1. Em `packages/app/package.json`, ajuste `version` para `0.2.0`, commite e faça push.
2. `git tag v0.2.0` e `git push origin v0.2.0`; anote a hora.
3. **Esperado**: o workflow `Release` passa em todos os passos e a release `v0.2.0` aparece com
   os 3 arquivos e as notas, em menos de 20 minutos.
4. **Variações** (cada uma deve falhar em `Validate tag`, sem criar release): tag `v0.2.1` com o
   app em `0.2.0`; tag `v0.1.9`; tag `v0.3.0-beta`.

## Cenário 3 — Instalar num Windows limpo (US2, SC-002, SC-007)

Na Área Restrita do Windows:

1. Seguindo só o README, baixe o instalador da release, passe pelo SmartScreen e instale.
2. **Esperado**: atalhos no menu Iniciar e na área de trabalho; o app abre e mostra a versão.
3. Crie um arquivo em `%APPDATA%\SoulSilver Desktop\teste.txt`, desinstale pelo Windows
   (Configurações → Aplicativos) e confira que o arquivo continua lá.

## Cenário 4 — Atualizar (US3, SC-003)

1. Com `v0.2.0` instalada (cenário 3), publique `v0.2.1` (cenário 2).
2. Abra o app com internet. **Esperado**: "Baixando atualização…" e, ao terminar, o painel com
   `0.2.0` → `0.2.1`, o aviso de que versões diferentes não jogam juntas e os dois botões.
3. "Reiniciar agora" → o app reabre mostrando `0.2.1`.
4. Repita com `v0.2.2` escolhendo "Depois": feche o app; ao abrir de novo, ele mostra `0.2.2`.

## Cenário 5 — Atualização interrompida (FR-017, SC-006)

Com uma versão nova publicada, abra o app e desconecte a rede durante "Baixando atualização…".
**Esperado**: aviso discreto de falha; feche e abra o app: a versão anterior abre normalmente; com
a rede de volta, o download recomeça.

## Cenário 6 — Sem internet (US4, SC-004)

Desconecte a rede (na Área Restrita: desative o adaptador de rede) e abra o app.
**Esperado**: a janela abre no tempo normal; em até 15 s aparece "Não foi possível verificar
atualizações", dispensável; o restante do app funciona.

## Testes automatizados

`npm test` cobre `validateReleaseTag`, `buildReleaseNotes`, `findForbiddenPackageFiles` e o
`createUpdateController` (transições e timeout de 15 s).
