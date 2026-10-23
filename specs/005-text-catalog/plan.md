# Implementation Plan: Textos e i18n

**Branch**: `005-text-catalog` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-text-catalog/spec.md`

## Summary

Acrescentar ao pipeline uma etapa `text-catalog` que decodifica os 829 bancos de mensagens da ROM
(49.984 textos), converte os códigos de controle numa marcação neutra e documentada, e grava um
catálogo de inglês em arquivos JSON editáveis, um por banco. O formato foi conferido com a ROM
real e um protótipo reproduziu os 829 bancos byte a byte ([research.md](./research.md)):

1. **Decodificação**: cifra por entrada, tabela de caracteres, textos comprimidos (9 bits em
   palavras de 15) e comandos `0xFFFE`. O que não é reconhecido vira `{raw:XXXX}` ou
   `{cmd:XXXX:…}` e entra no relatório, nunca é descartado.
2. **Marcação** (`shared`): `{n}`, `{page}`, `{scroll}`, `{color:N}`, variáveis `{nome:slot}`.
3. **Catálogo e i18n** (`shared`): schemas validados por zod, identificadores `banco:índice`,
   bancos com nome (espécies, golpes, itens, habilidades, tipos, naturezas…), catálogos paralelos
   com fallback para inglês e validação das variáveis de uma tradução.
4. **Formatação** (`shared`): preenche variáveis e recusa as que faltam e as que sobram.
5. **Ferramentas**: `--find` para buscar um trecho e uma seção "Textos" no `--report`.

A ida e volta (`bytes → marcação → bytes`) é conferida pela própria etapa em todos os bancos, e uma
diferença falha a extração. Nenhuma dependência nova.

## Technical Context

**Language/Version**: TypeScript 6.0 (strict), Node.js 24 LTS (herdados).

**Primary Dependencies**: nenhuma nova. `zod` já está em `shared`; o extrator usa só módulos do Node.

**Storage**: arquivos JSON na saída `catalog/` da etapa, dentro da área de trabalho da 003
(`%APPDATA%\SoulSilver Desktop\extraction\stages\text-catalog\catalog\` no app; `assets/stages/...`
na CLI).

**Testing**: Vitest (`extractor`, `shared`), com bancos sintéticos cifrados pelos próprios testes
(cifra independente do código testado).

**Target Platform**: Windows 10/11 x64 (app e CLI).

**Project Type**: biblioteca + CLI no pacote `extractor`; marcação, schemas, formatação e catálogo
em `shared`.

**Performance Goals**:

- etapa: no máximo 30 s a mais na preparação (SC-009); a estimativa é abaixo de 5 s (4,6 MB de
  entrada, ~830 arquivos de saída);
- busca: menos de 2 s no catálogo completo (SC-008).

**Constraints**:

- saída determinística (SC-005) e ida e volta exata (SC-003);
- texto gravado como está na ROM, sem correção nem tradução (princípio I);
- nenhum texto da ROM no repositório; os testes são sintéticos (princípio II);
- `shared/src/text/` sem APIs do Node, para o servidor e o renderer importarem;
- nada desconhecido é descartado.

**Scale/Scope**: 829 bancos, 49.984 textos, ~830 arquivos de ~10 MB no total; ~12 arquivos novos
em `extractor`, ~8 em `shared`.

### Dependências novas (princípio X)

Nenhuma. Foram rejeitados: bibliotecas de parser de gramática e de i18n (a marcação tem 10 tipos
de token e a lógica de fallback cabe em dezenas de linhas), e um índice de busca (R13).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Status | Como o plano atende |
|-----------|--------|---------------------|
| I. Conteúdo fiel | ✅ | O texto é gravado como está na ROM (FR-021), inclusive os bancos em outros idiomas. Nenhum ajuste, nenhuma correção; o que não se reconhece fica preservado. |
| II. Assets nunca distribuídos | ✅ | O catálogo nasce na máquina do jogador, na pasta de dados (app) ou em `assets/` (CLI, ignorada e bloqueada). O repositório guarda só a tabela de caracteres (códigos e símbolos, que são parte do formato) e nomes de banco. Os testes usam bancos sintéticos (R14). A amostra de New Bark Town é conferida à mão, fora dos testes. |
| III. Data-driven | ✅ | Os textos vivem em arquivos de dados com schema validado na geração e no carregamento, com erro de arquivo, caminho e problema. A marcação inválida é erro de schema (R9). |
| IV. Servidor autoritativo | ✅ | `shared/src/text/` é puro (sem Node e sem Electron), então o servidor de jogo pode formatar textos. A extração roda no extractor-host da 003. |
| V. Test-first | ✅ | Decodificação, cifra, compressão, charmap, marcação, formatação, catálogo, busca e a etapa têm testes escritos antes, com bancos sintéticos (R14). Não há UI nova. |
| VI. Contratos versionados | ✅ | Schemas e a marcação ficam em `shared`. Cada arquivo tem `formatVersion`, e a etapa tem `version`. Os identificadores são estáveis. |
| VII. Progresso individual | N/A | — |
| VIII. Saves | N/A | — |
| IX. Segurança do Electron | ✅ | Sem nova superfície de IPC: a etapa roda no extractor-host existente. O formatador escapa os valores preenchidos para que um nome com `{` não vire comando. |
| X. Desempenho e simplicidade | ✅ | Zero dependências novas. Um arquivo por banco em vez de um índice de busca. A etapa é uma só, sem framework. |
| XI. Entrega incremental | ✅ | Terceiro passo do Marco 1; desbloqueia nomes, menus e diálogos. |
| Restrições técnicas | ✅ | "Idioma do jogo: textos em inglês, como extraídos da ROM, com i18n estruturada desde o início para tradução futura": é exatamente esta feature. |
| Idioma | ✅ | Docs e mensagens ao desenvolvedor em PT-BR; código, identificadores, nomes de variável da marcação e mensagens de log em inglês. |
| Fluxo de desenvolvimento | ✅ | Typecheck, lint e testes cobrem os pacotes tocados. |

**Resultado (pré-pesquisa)**: aprovado.

**Resultado (pós-design)**: aprovado, sem violações. Duas notas honestas:

- **Variáveis de jogador e rival**: a ROM não separa os dois no texto; o catálogo oferece
  `trainer-name` com o slot, e a convenção de qual slot é quem fica para os scripts
  ([research R5](./research.md#r5-comandos-de-controle-e-variáveis)). Isso é mais fraco do que o
  pedido ("variáveis nomeadas do jogador e do rival").
- **Japonês**: os bancos japoneses saem com `{raw:XXXX}`; mapear kana está fora do escopo (R4).

## Project Structure

### Documentation (this feature)

```text
specs/005-text-catalog/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── markup.md
│   ├── text-api.md
│   └── stage-and-cli.md
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/shared/
├── package.json                     # + export "./text"
├── src/text/
│   ├── index.ts                     # API do contrato text-api.md
│   ├── ids.ts                       # parseTextId, formatTextId, TEXT_BANK_NAMES, TEXT_REF_BANKS
│   ├── variables.ts                 # TEXT_VARIABLES (comando <-> nome <-> valor)
│   ├── markup.ts                    # parseMarkup, serializeMarkup, MarkupError
│   ├── format.ts                    # formatText, textVariables, screenText, TextFormatError
│   ├── schemas.ts                   # text-bank, text-index, text-report; parseTextFile/Json, serializeTextFile
│   └── catalog.ts                   # createTextCatalog, validateTranslation, UnknownTextError
└── test/text/
    ├── ids.test.ts  markup.test.ts  format.test.ts  schemas.test.ts  catalog.test.ts

packages/extractor/
├── src/text/
│   ├── bank.ts                      # decodeBank, encodeBank, BankFormatError (cifra, tabela, compressão)
│   ├── charmap.ts                   # tabela de caracteres (código <-> texto)
│   ├── words.ts                     # wordsToMarkup, markupToWords
│   ├── stage.ts                     # textCatalogStage (ida e volta, relatório)
│   ├── report.ts                    # seção "Textos" do --report, EXPECTED_TEXT_COUNTS, referências da 004
│   ├── catalog-files.ts             # loadTextCatalog(dir)
│   └── find.ts                      # findTexts
├── src/stages/index.ts              # + textCatalogStage em defaultStages
├── src/cli.ts                       # + --find/--lang/--limit; --report mostra os textos
├── src/index.ts                     # + exports
└── test/
    ├── fixtures/text/
    │   └── build-bank.ts            # banco sintético cifrado (independente do código testado)
    └── text/
        ├── bank.test.ts  charmap.test.ts  words.test.ts  roundtrip.test.ts
        ├── stage.test.ts  find.test.ts  report.test.ts  cli.test.ts

README.md                            # + "Textos" (catálogo, tradução, --find)
```

**Structure Decision**: segue as features 003 e 004. A lógica sem ROM e sem disco (marcação,
formatação, catálogo, schemas) mora em `shared`, para o servidor e a UI a usarem. O que conhece os
bytes da ROM (cifra, compressão, tabela de caracteres) mora no `extractor`.

## Complexity Tracking

Nenhuma violação da constituição a justificar.
