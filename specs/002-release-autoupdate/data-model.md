# Data Model: Build, distribuição e auto-update

**Feature**: [spec.md](./spec.md) | **Date**: 2026-10-23

Nenhuma persistência nova além do que o electron-updater guarda no cache dele. Tipos em memória
em `packages/shared` (estado da atualização) e em `scripts/` (release).

## AppVersion

| Campo | Regra |
|-------|-------|
| valor | `MAJOR.MINOR.PATCH`, inteiros sem zeros à esquerda. Fonte única: `version` em `packages/app/package.json`. |

## ReleaseTag

| Campo | Regra |
|-------|-------|
| `tag` | `^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$`; sufixos (`-beta`) são inválidos. |
| relação | `tag === "v" + AppVersion`; ausente de `publishedVersions`; maior que todas elas. |

Resultado de `validateReleaseTag`: `{ ok: true }` ou
`{ ok: false; reason: "invalid-format" | "version-mismatch" | "already-published" | "not-newer"; message: string }`.

## UpdateState

Estado da atualização visto pelo renderer. União discriminada por `status`:

| `status` | Campos | Significado |
|----------|--------|-------------|
| `disabled` | — | App não empacotado (dev); nenhuma checagem. |
| `checking` | — | Checagem em andamento. |
| `up-to-date` | — | Nenhuma versão nova. |
| `downloading` | `version: string`, `percent: number` (0–100) | Baixando a versão nova. |
| `ready` | `currentVersion: string`, `newVersion: string` | Download íntegro concluído; aguardando reinício ou fechamento. |
| `check-failed` | — | Sem internet, erro ou timeout de 15 s em qualquer fase. |

**Transições** (controladas por `createUpdateController`):

```text
(start, empacotado) ──▶ checking
(start, dev)        ──▶ disabled                      (terminal)
checking ──update-not-available──▶ up-to-date        (terminal)
checking ──update-available──────▶ downloading
checking ──error | 15 s sem resposta──▶ check-failed (terminal)
downloading ──download-progress──▶ downloading (percent só cresce)
downloading ──update-downloaded──▶ ready             (terminal até reiniciar/fechar)
downloading ──error──────────────▶ check-failed
```

Eventos que chegam depois de um estado terminal são ignorados (por exemplo, a resposta de uma
checagem que já estourou o timeout).

## ReleaseNotes

| Entrada | Saída |
|---------|-------|
| lista de assuntos de commit (`string[]`), sem merges, do mais antigo ao mais novo | Markdown com até três seções, nesta ordem e omitidas quando vazias: `## Novidades` (`feat`), `## Correções` (`fix`), `## Outras mudanças` (demais). Prefixo `tipo(escopo):` removido; `!` de breaking change vira o rótulo **(incompatível)**. Lista vazia → `Sem mudanças registradas.` |

## ForbiddenPackageFile

Reaproveita `ForbiddenFileViolation` de [001](../001-project-foundation/data-model.md) com as
regras de pacote: `asset-dir` (qualquer segmento `assets/`), `rom`, `ds-format`, `media` (qualquer
imagem ou áudio, sem exceção).
