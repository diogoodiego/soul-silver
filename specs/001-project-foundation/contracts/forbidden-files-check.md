# Contrato: verificação de arquivos proibidos

**Lógica**: `scripts/forbidden-files.ts` | **CLI**: `scripts/check-forbidden-files.ts`
**Usada por**: `.githooks/pre-commit` e a integração contínua

## Uso

```text
node scripts/check-forbidden-files.ts --staged   # arquivos no índice (pre-commit)
node scripts/check-forbidden-files.ts --all      # todos os arquivos versionados (CI)
```

Também disponível como `npm run check:assets` (equivale a `--all`).

| Código de saída | Significado |
|-----------------|-------------|
| `0` | Nenhum arquivo proibido. |
| `1` | Um ou mais arquivos proibidos; a lista vai para stderr. |
| `2` | Erro de uso ou falha ao consultar o git. |

## Regras (primeira que casar vence; sem diferenciar maiúsculas e minúsculas)

| Id | Casa quando | Motivo exibido |
|----|-------------|----------------|
| `asset-dir` | o caminho está dentro de `assets/` | pasta de saída do extrator |
| `rom` | extensão `.nds` | ROM do jogo |
| `ds-format` | extensão de formato extraído do DS (lista do spec, Assumptions) | dado derivado da ROM |
| `media-outside-art` | extensão de imagem ou áudio (ver [research.md](../research.md) R13) fora de `art/` | arte e áudio só são permitidos em `art/` (arte original do projeto) |

## Mensagem de recusa (formato)

```text
✖ Commit bloqueado: arquivos proibidos pelo princípio II da constituição.
  ROMs, assets e dados derivados da ROM nunca podem ser versionados.

  assets/maps/route29.png      pasta de saída do extrator
  roms/soulsilver.NDS          ROM do jogo
  tmp/a0081.narc               dado derivado da ROM

Remova esses arquivos do commit (git restore --staged <arquivo>).
Arte original do projeto deve ficar em art/.
```

A mensagem é em PT-BR (documentação e mensagens ao desenvolvedor); identificadores e código em
inglês.
