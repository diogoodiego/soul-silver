# Contrato: pipeline de release

## Gatilho

`git push origin vX.Y.Z` → workflow `Release` (`.github/workflows/release.yml`), runner
`windows-latest`, `permissions: contents: write`, checkout com histórico completo
(`fetch-depth: 0`).

## Passos (nomes exibidos no GitHub Actions)

| # | Passo | Falha quando | Efeito da falha |
|---|-------|--------------|-----------------|
| 1 | `Validate tag` | formato inválido, versão ≠ app, tag já publicada, versão não maior | nenhuma release |
| 2 | `Forbidden files` | arquivo proibido versionado | nenhuma release |
| 3 | `Typecheck` / `Lint` / `Test` | qualquer erro | nenhuma release |
| 4 | `Build installer` | erro de build | nenhuma release |
| 5 | `Verify package` | arquivo proibido no pacote | nenhuma release |
| 6 | `Release notes` | erro ao ler o histórico | nenhuma release |
| 7 | `Publish` | erro do GitHub | release pode não existir; rodar de novo o workflow |

## Artefatos publicados na release `vX.Y.Z`

| Arquivo | Uso |
|---------|-----|
| `SoulSilver-Desktop-Setup-X.Y.Z.exe` | instalador para o jogador |
| `SoulSilver-Desktop-Setup-X.Y.Z.exe.blockmap` | download diferencial do updater |
| `latest.yml` | versão, nome do arquivo e SHA-512 lidos pelo updater |

Corpo da release: notas de [data-model.md](../data-model.md#releasenotes).

## CLIs (rodam com `node`, sem build)

```text
node scripts/check-release-tag.ts <tag>         # 0 ok | 1 inválida (mensagem PT-BR) | 2 erro de uso/gh
node scripts/verify-package.ts <win-unpacked>   # 0 ok | 1 arquivos proibidos | 2 erro de uso
node scripts/release-notes.ts <tag> <saida.md>  # 0 ok | 2 erro de uso/git
```

`check-release-tag.ts` lê a versão de `packages/app/package.json` e as versões publicadas com
`gh release list --limit 1000 --json tagName` (usa `GH_TOKEN`).

## Script local

`npm run dist` na raiz: build do electron-vite e `electron-builder --win --x64 --publish never`.
Saída em `packages/app/dist/`. Não publica nada.
