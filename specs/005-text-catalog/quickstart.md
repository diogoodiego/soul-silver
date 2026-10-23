# Quickstart: validação desta feature

**Feature**: [spec.md](./spec.md) | **Contratos**: [contracts/](./contracts/)

## Pré-requisitos

- Features 003 e 004 concluídas; `npm install` na raiz.
- Para os passos 2 a 5: o seu dump de Pokémon SoulSilver (EUA). Ele nunca entra no repositório.

## 1. Checagens automáticas

```text
npm run typecheck
npm run lint
npm test
```

Esperado: tudo verde. Cobertura sem ROM real:

| Critério | Onde |
|----------|------|
| Cifra, compressão, tabela de caracteres, comandos | `packages/extractor/test/text/bank.test.ts`, `charmap.test.ts`, `words.test.ts` |
| Ida e volta (SC-003) | `packages/extractor/test/text/roundtrip.test.ts` |
| Marcação | `packages/shared/test/text/markup.test.ts` |
| Formatação (SC-002, parte das variáveis) | `packages/shared/test/text/format.test.ts` |
| Catálogo, fallback e tradução (SC-006, SC-007) | `packages/shared/test/text/catalog.test.ts` |
| Schemas e mensagens de erro | `packages/shared/test/text/schemas.test.ts` |
| Busca | `packages/extractor/test/text/find.test.ts` |
| Etapa, determinismo e isolamento (SC-005) | `packages/extractor/test/text/stage.test.ts` |

## 2. Extração com a ROM real

```text
npm run extract -- --rom <sua ROM> --out assets
```

Esperado: a etapa `text-catalog` aparece no plano (`missing` na primeira vez), termina com código 0
e cria `assets/stages/text-catalog/catalog/` com `index.json`, `report.json` e `en/0000.json` a
`en/0828.json`. Se a ida e volta de algum banco falhar, a etapa para e diz qual banco.

Anote o tempo da etapa no log (SC-009: no máximo 30 s).

## 3. Relatório (SC-001, SC-003, SC-004)

```text
npm run extract -- --out assets --report
```

Esperado na seção "Textos": 829 bancos, 49.984 textos, 829 idas e voltas idênticas e todas as
referências de nome resolvidas, sem falha. Os alertas listam os caracteres e comandos que a
tabela ainda não nomeia (japonês e alguns símbolos raros); nenhum é descartado.

## 4. Busca (SC-008)

```text
npm run extract -- --out assets --find "new bark town"
npm run extract -- --out assets --find "photo taken" --limit 5
npm run extract -- --out assets --find "pokemon"
```

Esperado: resultados com identificador e texto na marcação, em menos de 2 s. A terceira busca
acha textos com "Pokémon" (a busca ignora acentos).

## 5. Amostra de New Bark Town (SC-002)

1. Procure os diálogos com `--find "elm"`, `--find "mom"` e `--find "new bark"`.
2. Abra o arquivo do banco (`assets/stages/text-catalog/catalog/en/0040.json` e
   `.../0190.json` são bons pontos de partida) e escolha 10 a 15 textos da cidade: a mãe do
   protagonista, o Prof. Elm e o laboratório.
3. Jogue (ou use um emulador) até ver cada fala no jogo original e compare **palavra por palavra**,
   incluindo onde aparecem os nomes `{trainer-name:0}`, `{pokemon-name:0}`, as quebras `{n}` e
   `{page}` e as cores.
4. Registre uma tabela "identificador × texto no catálogo × texto no jogo". Qualquer diferença
   é um bug do leitor, nunca se corrige editando o catálogo.

## 6. Tradução e fallback (SC-006, SC-007)

Crie `assets/stages/text-catalog/catalog/pt-BR/0034.json` copiando `en/0034.json`, trocando
`"language": "en"` por `"pt-BR"`, mantendo só 3 registros e traduzindo os textos. Carregue o
catálogo num teste ou numa tarefa do repositório com `createTextCatalog` e confira que os 3 ids
voltam traduzidos e os demais ids do banco voltam em inglês. Depois remova uma variável de um texto
traduzido que a tenha e confira que o carregamento falha, nomeando o texto e a variável.

## 7. Atualização no app

1. Com os assets da 004 prontos, rode `npm run dev`.
2. Esperado: "Atualizando os arquivos do jogo", só a etapa `text-catalog`, sem pedir a ROM,
   e depois a tela principal.
