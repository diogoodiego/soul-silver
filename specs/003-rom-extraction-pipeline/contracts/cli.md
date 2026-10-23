# Contrato: CLI do extrator

**Definida em**: `packages/extractor/src/cli.ts` (`export async function main(argv, io): Promise<number>`)
**Execução**: `npm run extract -- [opções]` (equivale a `node packages/extractor/src/cli.ts [opções]`)

## Opções

| Opção | Padrão | Descrição |
|-------|--------|-----------|
| `--rom <arquivo>` | — (obrigatória, exceto com `--list`) | ROM a validar e extrair. Não é copiada. |
| `--out <pasta>` | `assets/` (relativa ao diretório atual) | Raiz da área de trabalho (mesmo layout de `extraction/` no app). |
| `--stages <id,id>` | todas | Roda só essas etapas + dependências ausentes ou desatualizadas. |
| `--force <id,id>` | — | Roda essas etapas mesmo que estejam em dia (e as dependentes). |
| `--list` | — | Lista as etapas: id, versão, título, entradas, saídas. Não exige `--rom`. |
| `--verify` | — | Recalcula os digests de todas as saídas e compara com o manifesto. Não extrai. |
| `--log <arquivo>` | — | Também grava o log nesse arquivo (mesmo formato do app). |
| `--help` | — | Ajuda. |

`--stages` e `--force` com id desconhecido → erro de uso.

## Saída

- **stdout**: plano (`rom-unpack: missing`), progresso (`[rom-unpack] Desempacotando a ROM 42%`,
  uma linha a cada 10 pontos percentuais, ou uma linha atualizada se stdout for TTY), etapas
  puladas (`rom-unpack: em dia, pulada`) e resumo final.
- **stderr**: recusa da ROM (o mesmo `romRejectionMessage` do app) e erros.

## Códigos de saída

| Código | Situação |
|--------|----------|
| 0 | Sucesso (ou `--list`; ou `--verify` sem divergências) |
| 1 | Falha de etapa, disco cheio, sem permissão, `--verify` com divergências |
| 2 | Erro de uso (opção inválida, `--rom` ausente, etapa desconhecida) |
| 3 | ROM recusada |
| 4 | Área de trabalho ocupada por outra extração (`busy`) |
| 130 | Cancelado com Ctrl+C (o `SIGINT` vira `AbortSignal`) |

## Exemplos

```text
npm run extract -- --rom D:\roms\soulsilver.nds
npm run extract -- --rom D:\roms\soulsilver.nds --out C:\tmp\ss --stages rom-unpack --force rom-unpack
npm run extract -- --list
npm run extract -- --out C:\tmp\ss --rom D:\roms\soulsilver.nds --verify
```
